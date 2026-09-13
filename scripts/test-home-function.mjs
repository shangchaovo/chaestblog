// Run with: node scripts/test-home-function.mjs (Node 22+).
// Exercise the actual Pages homepage handler with mocked assets/KV, without network or writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest } from "../functions/index.js";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("index.html", root), "utf8");
const policy = readFileSync(new URL("_headers", root), "utf8")
  .match(/Content-Security-Policy: (.+)/)[1];
const storedNotes = {
  items: [{ id: "new-note", title: "Latest <note>", body: '<img src=x onerror="alert(1)">', createdAt: "2026-09-05T00:00:00.000Z" }],
};
globalThis.fetch = async () => { throw new Error("Unexpected network request in homepage test"); };

async function requestHome({ method = "GET", html = source, get = async () => JSON.stringify(storedNotes) } = {}) {
  return onRequest({
    request: new Request("https://hub.test/", { method }),
    env: {
      HUB_KV: { get },
      ASSETS: {
        fetch: async (request) => {
          assert.equal(request.method, "GET", "Read static HTML even for a HEAD request");
          assert.equal(request.url, "https://hub.test/", "Read the homepage asset");
          return new Response(html, { headers: {
            "Content-Security-Policy": policy,
            "X-Frame-Options": "DENY",
            "Cache-Control": "public, max-age=604800",
            "ETag": '"old-static-page"',
            "Last-Modified": "Fri, 04 Sep 2026 00:00:00 GMT",
            "Content-Length": String(Buffer.byteLength(html)),
            "Content-Encoding": "gzip",
          } });
        },
      },
    },
  });
}

function checkHeaders(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Security-Policy"), policy, "Retain the site's CSP");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("Cache-Control"), "no-store", "Do not cache deleted notes");
  assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
  for (const header of ["ETag", "Last-Modified", "Content-Length", "Content-Encoding"]) {
    assert.equal(response.headers.get(header), null, `Discard the old asset's ${header}`);
  }
}

const rendered = await requestHome();
checkHeaders(rendered);
const html = await rendered.text();
const notes = html.match(/<!-- hub:notes:start -->([\s\S]*?)<!-- hub:notes:end -->/)[1];
assert.match(notes, /Latest &lt;note&gt;/, "Render the current KV note");
assert.match(notes, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/, "Escape note content");
assert.match(notes, /href="\/notes\/#note-new-note"/, "Link short notes to their archive anchor");
assert.doesNotMatch(notes, /data-id="n_hbm"|HBM 比标题先紧/, "Do not resurrect a removed static article");
assert.match(html, /<!-- hub:note-count:start -->1<!-- hub:note-count:end -->/, "Use the current note count");

const empty = await requestHome({ get: async () => '{"items":[]}' });
assert.match(await empty.text(), /<!-- hub:note-count:start -->0<!-- hub:note-count:end -->/, "Render deletion of every note");

for (const get of [async () => { throw new Error("KV unavailable"); }, async () => "invalid json"]) {
  const fallback = await requestHome({ get });
  checkHeaders(fallback);
  assert.equal(await fallback.text(), source, "KV failure retains a readable static homepage");
}
const brokenTemplate = source.replace("hub:notes:start", "missing-marker");
const fallback = await requestHome({ html: brokenTemplate });
checkHeaders(fallback);
assert.equal(await fallback.text(), brokenTemplate, "Template errors retain the static homepage");

const head = await requestHome({ method: "HEAD" });
checkHeaders(head);
assert.equal(await head.text(), "", "HEAD sends headers without a body");
const rejected = await requestHome({ method: "POST", get: async () => assert.fail("POST must not access KV") });
assert.equal(rejected.status, 405);
assert.equal(rejected.headers.get("Allow"), "GET, HEAD");
console.log("Homepage Function passed: current notes, deletions, escaping, KV/template fallbacks, HEAD and response headers.");
