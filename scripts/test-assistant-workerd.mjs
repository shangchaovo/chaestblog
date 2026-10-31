// Exercise the real Pages API in Cloudflare's local workerd runtime.
// Requires the Wrangler CLI already used for deployment. Model traffic is mocked.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const temporary = mkdtempSync(join(tmpdir(), "chaestblog-workerd-test-"));
const received = [];
let redirect = false;
const model = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  received.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
  if (redirect) { res.writeHead(302, { Location: "https://example.invalid/" }); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "这是公开项目的介绍 [3]。" } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
const listener = http.createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const handler = fileURLToPath(new URL("../functions/api/[[path]].js", import.meta.url));
writeFileSync(join(temporary, "worker.mjs"), `
import { onRequest } from ${JSON.stringify(handler)};
const content = {site:{profile:{name:"Runtime fixture"},projects:[{id:"public",name:"Public project",summary:"Public feature",status:"live",live:"https://project.example/"}]},notes:{items:[]},now:{text:"Current public note"},watchlist:{sectors:[]}};
const counts = new Map();
const env = {
  MAGPIE_BASE_URL: "http://127.0.0.1:${model.address().port}/v1", MAGPIE_API_KEY:"workerd-test-key",
  HUB_KV: {get: async key => key in content ? JSON.stringify(content[key]) : counts.get(key) || null, put: async (key,value) => counts.set(key,value)},
  ASSETS: {fetch: async () => Response.json({sources:[]})}
};
export default {fetch: request => onRequest({request, env, params:{path:["assistant"]}})};
`);
writeFileSync(join(temporary, "wrangler.json"), JSON.stringify({ name: "chaestblog-assistant-runtime-test", main: "worker.mjs", compatibility_date: "2026-08-17" }));
const cli = spawn(process.env.WRANGLER_BIN || "wrangler", ["dev", "--local", "--port", String(port), "--inspector-port", "0"], {
  cwd: temporary,
  env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", WRANGLER_SEND_METRICS: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
cli.stdout.on("data", (chunk) => { output = (output + chunk).slice(-5000); });
cli.stderr.on("data", (chunk) => { output = (output + chunk).slice(-5000); });
let spawnError;
cli.on("error", (error) => { spawnError = error; });
try {
  const url = `http://127.0.0.1:${port}/api/assistant`;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (spawnError) throw spawnError;
    if (cli.exitCode !== null) throw new Error(`Wrangler exited: ${output}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).status === 405) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `workerd did not start: ${output}`);
  const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "介绍 Public project" }] }) };
  let response = await fetch(url, request);
  const body = await response.text();
  assert.equal(response.status, 200, body);
  const events = body.trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).type, "done", body);
  assert.ok(events.some((e) => e.type === "delta" && e.text.includes("公开项目")));
  assert.equal(received[0].authorization, "Bearer workerd-test-key");
  assert.equal(received[0].body.model, "workbuddy/deepseek-v4.1-flash");
  assert.ok(received[0].body.messages[0].content.includes("Runtime fixture"));
  redirect = true;
  response = await fetch(url, request);
  assert.equal(response.status, 502, "Reject a redirect without forwarding model credentials");
  assert.equal(received.length, 2);
  console.log("Assistant workerd passed: actual Pages handler, KV reads, model request, UTF-8 streaming and redirect rejection in Cloudflare runtime.");
} finally {
  const closed = new Promise((resolve) => cli.once("close", resolve));
  cli.kill("SIGTERM");
  await Promise.race([closed, delay(2000)]);
  if (cli.exitCode === null && cli.signalCode === null) cli.kill("SIGKILL");
  await new Promise((resolve) => model.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
