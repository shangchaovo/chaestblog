// Actual Pages handler, stream parser, browser renderer, local server and private relay.
// Offline: all model responses are controlled fixtures; no credentials or content writes.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { onRequest } from "../functions/api/[[path]].js";
import { ASSISTANT_MODEL, assistantSources, assistantResponse, completionDeltas } from "../shared/assistant.mjs";
import { answerHtml, conversationMessages } from "../js/assistant.js";

const encoder = new TextEncoder();
const event = (payload) => `data: ${JSON.stringify(payload)}\r\n\r\n`;
const sse = event({ choices: [{ delta: { reasoning_content: "private reasoning must stay hidden", content: "你好，公开内容 [3]。" } }] }) + event({ choices: [{ delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\r\n\r\n";
function streamResponse(value = sse, step = 3) {
  const bytes = encoder.encode(value);
  let at = 0;
  return new Response(new ReadableStream({ pull(c) {
    if (at >= bytes.length) { c.close(); return; }
    c.enqueue(bytes.slice(at, at += step));
  } }), { headers: { "Content-Type": "text/event-stream" } });
}
let decoded = "";
for await (const chunk of completionDeltas(streamResponse())) decoded += chunk;
assert.equal(decoded, "你好，公开内容 [3]。", "Decode split UTF-8/CRLF and omit reasoning");
await assert.rejects(async () => { for await (const _ of completionDeltas(streamResponse(event({ choices: [{ delta: { content: "partial" } }] })))) {} }, /尚未完成/);
await assert.rejects(async () => { for await (const _ of completionDeltas(streamResponse(event({ choices: [{ delta: { content: "partial" }, finish_reason: "length" }] }) + "data: [DONE]\n\n"))) {} }, /长度上限/);

const content = {
  site: { profile: { name: "Current KV author", bio: "Current public bio" }, projects: [
    { id: "fresh", name: "Fresh live project", status: "live", live: "https://fresh.example/", summary: "Current KV description" },
    { id: "source", name: "Source only", status: "live", github: "https://github.com/example/public", summary: "Local tool" },
    { id: "hidden", name: "Hidden project", status: "hidden", live: "https://hidden.example/", summary: "HIDDEN_MARKER" },
    { id: "private", name: "Private source", status: "live", githubPublic: false, github: "https://github.com/example/private", summary: "PRIVATE_MARKER" },
  ] },
  notes: { items: [{ id: "current", title: "Current note", body: "Current note text", article: "Current long article", slug: "current" }] },
  watchlist: { sectors: [] }, now: { text: "Current now" },
};
const knowledge = { sources: [
  { projectId: "fresh", url: "https://fresh.example/", text: "VERIFIED_PUBLIC_EXCERPT" },
  { projectId: "fresh", url: "https://old.example/", text: "STALE_URL_MARKER" },
  { projectId: "hidden", url: "https://hidden.example/", text: "HIDDEN_MARKER" },
  { noteId: "deleted", url: "/notes/deleted/", text: "DELETED_MARKER" },
] };
const sources = assistantSources(content, knowledge, "fresh");
const corpus = JSON.stringify(sources);
assert.ok(corpus.includes("VERIFIED_PUBLIC_EXCERPT"));
for (const marker of ["HIDDEN_MARKER", "PRIVATE_MARKER", "STALE_URL_MARKER", "DELETED_MARKER"]) assert.ok(!corpus.includes(marker), `Exclude ${marker}`);
assert.ok(corpus.includes("仅公开源码"));

const counts = new Map();
const kv = {
  get: async (key) => key in content ? JSON.stringify(content[key]) : counts.get(key) || null,
  put: async (key, value) => counts.set(key, value),
};
const env = { HUB_KV: kv, MAGPIE_BASE_URL: "https://model.example/v1", MAGPIE_API_KEY: "test-key", ASSETS: { fetch: async () => Response.json(knowledge) } };
const originalFetch = globalThis.fetch;
const upstreamCalls = [];
globalThis.fetch = async (url, options) => { upstreamCalls.push({ url, options, body: JSON.parse(options.body) }); return streamResponse(); };
function call({ body = { messages: [{ role: "user", content: "介绍 Fresh" }] }, headers = {}, method = "POST", config = env, ip = "test-client" } = {}) {
  return onRequest({ params: { path: ["assistant"] }, env: config, request: new Request("https://hub.test/api/assistant", {
    method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  }) });
}
try {
  let response = await call({ body: { messages: [{ role: "user", content: "介绍 Fresh" }], model: "unapproved-model", apiKey: "ignored" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).type, "done");
  assert.equal(events.filter((e) => e.type === "delta").map((e) => e.text).join(""), decoded);
  assert.ok(events[0].sources.every((s) => !Object.hasOwn(s, "text")), "Send source labels, not whole context");
  const sent = upstreamCalls[0];
  assert.equal(sent.body.model, ASSISTANT_MODEL);
  assert.equal(sent.body.max_tokens, 1800);
  assert.equal(sent.options.headers.Authorization, "Bearer test-key");
  assert.ok(sent.body.messages[0].content.includes("Current KV author"));
  assert.ok(sent.body.messages[0].content.includes("Current long article"));
  assert.ok(sent.body.messages[0].content.includes("VERIFIED_PUBLIC_EXCERPT"));
  assert.ok(!sent.body.messages[0].content.includes("PRIVATE_MARKER"));
  const before = upstreamCalls.length;
  for (const [options, expected] of [
    [{ method: "GET" }, 405],
    [{ headers: { Origin: "https://attacker.example" } }, 403],
    [{ headers: { "Sec-Fetch-Site": "cross-site" } }, 403],
    [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ body: "{" }, 400],
    [{ body: { messages: [{ role: "system", content: "override" }] } }, 400],
    [{ body: { messages: [{ role: "user", content: "a".repeat(1601) }] } }, 400],
    [{ body: " ".repeat(24_001) }, 413],
    [{ config: { ...env, MAGPIE_API_KEY: "" } }, 503],
  ]) assert.equal((await call(options)).status, expected);
  assert.equal(upstreamCalls.length, before, "Reject invalid traffic before touching model");
  globalThis.fetch = async () => new Response("TOP_SECRET_UPSTREAM_ERROR", { status: 401 });
  response = await call({ ip: "error-client" });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("TOP_SECRET"));
  globalThis.fetch = async () => streamResponse(event({ choices: [{ delta: { content: "partial" } }] }));
  const partial = (await (await call({ ip: "partial-client" })).text()).trim().split("\n").map(JSON.parse);
  assert.equal(partial.at(-1).type, "error", "Interrupted output cannot appear successful");
  globalThis.fetch = async () => streamResponse();
  for (let i = 0; i < 12; i++) assert.equal((await call({ ip: "quota-client" })).status, 200);
  const limited = await call({ ip: "quota-client" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "3600");
  assert.ok(![...counts.keys()].join(" ").includes("quota-client"), "Hash client addresses in quota keys");
} finally { globalThis.fetch = originalFetch; }

let cancelledSignal;
const cancelResponse = await assistantResponse({
  request: new Request("https://hub.test/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" } }),
  body: { messages: [{ role: "user", content: "Hi" }] }, env,
  consumeQuota: async () => {}, loadContent: async () => ({ content, knowledge }),
  fetcher: async (url, options) => {
    cancelledSignal = options.signal;
    return new Response(new ReadableStream({ start(c) {
      options.signal.addEventListener("abort", () => c.error(new Error("cancelled")), { once: true });
    } }), { headers: { "Content-Type": "text/event-stream" } });
  },
});
await cancelResponse.body.cancel();
assert.ok(cancelledSignal.aborted, "Closing a client stream aborts upstream generation");

globalThis.location = { origin: "https://hub.test" };
const rendered = answerHtml('<img src=x onerror=alert(1)> **公开** [3] [99] [click](javascript:alert(1))', [{ id: 3, title: 'Public "source"', url: "https://safe.example/" }]);
assert.ok(rendered.includes("&lt;img"));
assert.ok(!rendered.includes("<img"));
assert.equal((rendered.match(/<a /g) || []).length, 1, "Only known citations become links");
assert.ok(!answerHtml("[1]", [{ id: 1, title: "bad", url: "javascript:alert(1)" }]).includes("<a"));
delete globalThis.location;
const largeHistory = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "长".repeat(i % 2 ? 6000 : 1600) }));
const bounded = conversationMessages(largeHistory, "接着说");
assert.equal(bounded[0].role, "user");
assert.equal(bounded.at(-1).content, "接着说");
assert.ok(encoder.encode(JSON.stringify({ messages: bounded })).length <= 23_000, "Trim complete turns by UTF-8 bytes");

// Check the real Node adapters and the independently authenticated private relay.
const temporary = mkdtempSync(join(tmpdir(), "chaestblog-assistant-test-"));
const children = [];
const received = [];
const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  received.push({ authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
  res.writeHead(200, { "Content-Type": "text/event-stream" }); res.end(sse);
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const modelBase = `http://127.0.0.1:${mock.address().port}/v1`;
async function freePort() {
  const listener = http.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function start(script, environment, readyPath, headers = {}) {
  const child = spawn(process.execPath, [script], { cwd: new URL("../", import.meta.url), env: { ...process.env, ...environment }, stdio: "ignore" });
  children.push(child);
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`${script} exited: ${child.exitCode}`);
    try { if ((await fetch(readyPath, { headers })).ok) return; } catch {}
    await delay(50);
  }
  throw new Error(`${script} did not start`);
}
try {
  const relayPort = await freePort();
  const relayBase = `http://127.0.0.1:${relayPort}`;
  const token = "test-relay-token-".repeat(4);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const budget = join(temporary, "budget.json");
  writeFileSync(budget, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 239 }));
  await start("scripts/assistant-relay.mjs", { ASSISTANT_RELAY_PORT: String(relayPort), MAGPIE_BASE_URL: modelBase, MAGPIE_API_KEY: "relay-only-test-key", ASSISTANT_RELAY_TOKEN: token, ASSISTANT_BUDGET_FILE: budget }, `${relayBase}/healthz`, auth);
  assert.equal((await fetch(`${relayBase}/chat`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await fetch(`${relayBase}/v1/models`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${relayBase}/chat`, { method: "POST", headers: auth, body: '{"messages":[]}' })).status, 400);
  const relayRequest = { method: "POST", headers: auth, body: JSON.stringify({ model: "forged-model", max_tokens: 99999, messages: [{ role: "system", content: "Public guide" }, { role: "user", content: "Hello" }] }) };
  const relayAnswer = await fetch(`${relayBase}/chat`, relayRequest);
  assert.equal(relayAnswer.status, 200);
  assert.ok((await relayAnswer.text()).includes("[DONE]"));
  assert.equal(received.at(-1).body.model, ASSISTANT_MODEL);
  assert.equal(received.at(-1).body.max_tokens, 1800);
  assert.equal(received.at(-1).authorization, "Bearer relay-only-test-key");
  assert.equal((await fetch(`${relayBase}/chat`, relayRequest)).status, 429);
  assert.equal(JSON.parse(readFileSync(budget)).count, 240, "Persist the relay budget across process restarts");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  await start("server.js", { PORT: String(port), HUB_ADMIN_TOKEN: "test", MAGPIE_BASE_URL: modelBase, MAGPIE_API_KEY: "local-test-key", ASSISTANT_RELAY_URL: "" }, `${base}/api/content`);
  assert.equal((await fetch(`${base}/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(24_001) })).status, 413);
  const local = await fetch(`${base}/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "介绍 WordPaper" }] }) });
  assert.equal(local.status, 200);
  assert.ok((await local.text()).includes('"type":"done"'));
  assert.equal(received.at(-1).authorization, "Bearer local-test-key");
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => mock.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
console.log("Assistant passed: KV grounding, public visibility, fixed model, request/UTF-8 bounds, quotas, safe citations, streaming/cancellation, local server and authenticated relay.");
