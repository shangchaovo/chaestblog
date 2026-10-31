// Private-network bridge: expose only this authenticated, fixed-model endpoint through a tunnel.
// Uses Node's built-ins. Neither the Magpie key nor this token belongs in public assets.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ASSISTANT_MODEL } from "../shared/assistant.mjs";

const root = new URL("../", import.meta.url);
const envFile = new URL(".env", root);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z_0-9]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
const base = String(process.env.MAGPIE_BASE_URL || "").replace(/\/$/, "");
const key = process.env.MAGPIE_API_KEY;
const token = process.env.ASSISTANT_RELAY_TOKEN;
if (!base || !key || !token || token.length < 32) throw new Error("Configure MAGPIE_BASE_URL, MAGPIE_API_KEY and a 32+ character ASSISTANT_RELAY_TOKEN in .env");
const port = Number(process.env.ASSISTANT_RELAY_PORT || 8778);
const budgetFile = process.env.ASSISTANT_BUDGET_FILE || fileURLToPath(new URL("logs/assistant-budget.json", root));
const dailyLimit = 240;
let active = 0;
const digest = (value) => createHash("sha256").update(value).digest();

function json(res, status, error) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify({ error }));
}
function reserveBudget() {
  const day = new Date().toISOString().slice(0, 10);
  let state = { day, count: 0 };
  if (existsSync(budgetFile)) {
    const saved = JSON.parse(readFileSync(budgetFile, "utf8"));
    if (!Number.isSafeInteger(saved.count) || saved.count < 0) throw new Error("Invalid budget state");
    if (saved.day === day) state = saved;
  }
  if (state.count >= dailyLimit) return false;
  state.count += 1;
  mkdirSync(new URL("logs/", root), { recursive: true });
  writeFileSync(`${budgetFile}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${budgetFile}.tmp`, budgetFile);
  return true;
}

const server = http.createServer(async (req, res) => {
  if (!timingSafeEqual(digest(req.headers.authorization || ""), digest(`Bearer ${token}`))) { json(res, 401, "Unauthorized"); return; }
  if (req.url === "/healthz" && req.method === "GET") { json(res, 200, null); return; }
  if (req.url !== "/chat" || req.method !== "POST") { json(res, 404, "Not Found"); return; }
  if (active >= 3) { json(res, 429, "Busy"); return; }
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) { json(res, 415, "JSON required"); return; }
  active += 1;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 65_000);
  res.once("close", abort);
  let reader;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 180_000) { json(res, 413, "Too large"); return; }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length < 2 || messages.length > 10 || messages.some((m, i) => m?.role !== (i === 0 ? "system" : i % 2 ? "user" : "assistant") || typeof m.content !== "string" || m.content.length > (i === 0 ? 60_000 : 6000)) || messages.at(-1)?.role !== "user") {
      json(res, 400, "Invalid messages"); return;
    }
    if (!reserveBudget()) { json(res, 429, "Daily budget reached"); return; }
    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST", signal: controller.signal, redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ model: ASSISTANT_MODEL, messages: messages.map(({ role, content }) => ({ role, content })), max_tokens: 1800, stream: true }),
    });
    if (!upstream.ok || !upstream.body || !upstream.headers.get("Content-Type")?.includes("text/event-stream")) {
      await upstream.body?.cancel();
      json(res, upstream.status === 429 ? 429 : 502, "Model unavailable"); return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no" });
    reader = upstream.body.getReader();
    let sent = 0;
    while (!res.destroyed) {
      const { value, done } = await reader.read();
      if (done) break;
      sent += value.byteLength;
      if (sent > 500_000) { abort(); break; }
      res.write(value);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent && !res.destroyed) json(res, error instanceof SyntaxError ? 400 : 502, "Relay unavailable");
    else res.end();
  } finally {
    await reader?.cancel().catch(() => {});
    clearTimeout(timer);
    res.off("close", abort);
    active -= 1;
  }
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(port, "127.0.0.1", () => console.log(`chaestblog assistant relay listening on 127.0.0.1:${port}`));
server.on("error", (error) => { console.error(`Assistant relay: ${error.code || "startup failed"}`); process.exitCode = 1; });
