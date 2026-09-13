// Run with: node --experimental-vm-modules scripts/test-modules.mjs
// Executes the homepage's actual module URLs with a small DOM and mocked fetch.
// No server, network requests, dependencies, or data-file writes are needed.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { ASSET_V } from "../shared/view.mjs";

assert.ok(vm.SourceTextModule, "Run with node --experimental-vm-modules scripts/test-modules.mjs");
const root = new URL("../", import.meta.url);
const origin = "https://hub.test";
const html = readFileSync(new URL("index.html", root), "utf8");
const entries = [...html.matchAll(/<script\b([^>]*)>/g)]
  .filter(([, attrs]) => /\btype=["']module["']/.test(attrs))
  .map(([, attrs]) => attrs.match(/\bsrc=["']([^"']+)["']/)?.[1])
  .filter(Boolean);
assert.equal(entries.length, 1, "Homepage must have one module entry");

const listeners = new Map();
const nodes = new Map();
function node(name) {
  if (nodes.has(name)) return nodes.get(name);
  const classes = new Set();
  const value = {
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    classList: {
      add: (item) => classes.add(item),
      remove: (item) => classes.delete(item),
      toggle(item, on) { return on ? (classes.add(item), true) : (classes.delete(item), false); },
    },
    textContent: "", innerHTML: "", scrollWidth: 2400,
    addEventListener(type, callback) {
      const key = `${name}:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), callback]);
    },
    setAttribute() {}, removeAttribute() {}, append() {}, replaceChildren() {},
    querySelector: (selector) => node(`${name} ${selector}`),
    querySelectorAll: () => [],
    closest: (selector) => node(`${name} ${selector}`),
  };
  nodes.set(name, value);
  return value;
}
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
const document = Object.assign(node("document"), {
  body: node("body"), documentElement: node("html"),
  getElementById: (id) => ids.has(id) ? node(`#${id}`) : null,
  createElement: (tag) => node(`created:${tag}`),
  querySelector: (selector) => node(selector),
  querySelectorAll: () => [],
});
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const content = Object.fromEntries(["site", "notes", "watchlist", "now"].map((key) => [
  key, JSON.parse(readFileSync(new URL(`data/${key}.json`, root), "utf8")),
]));
const requests = [];
const errors = [];
const timers = [];
const context = vm.createContext({
  document,
  window: Object.assign(node("window"), { matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 900 }),
  location: { search: "" }, navigator: { platform: "MacIntel" },
  localStorage: storage(), sessionStorage: storage(),
  URL, URLSearchParams, CSS: { escape: (value) => value },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: (callback) => { timers.push(callback); },
  setInterval: (callback) => { timers.push(callback); },
  fetch: async (path, options = {}) => {
    const method = options.method || "GET";
    requests.push(`${method} ${path}`);
    const response = {
      "/api/content": content,
      "/api/session": { admin: false },
      "/api/health": { checks: [] },
      "/api/hit": { total: 1, days: {} },
    }[path];
    if (!response) throw new Error(`Unexpected mocked request: ${method} ${path}`);
    return { ok: true, text: async () => JSON.stringify(response) };
  },
});
// Capture the entry's error toast, so startup failures cannot pass silently.
node("#toastHost").append = (toast) => errors.push(toast.textContent);

const modules = new Map();
function moduleAt(url) {
  if (!modules.has(url.href)) {
    assert.equal(url.origin, origin, "Module graph must stay on this site");
    const path = fileURLToPath(new URL(url.pathname.slice(1), root));
    modules.set(url.href, new vm.SourceTextModule(readFileSync(path, "utf8"), {
      context, identifier: url.href,
    }));
  }
  return modules.get(url.href);
}
const entry = moduleAt(new URL(entries[0], origin));
await entry.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier)));
await entry.evaluate();
// Allow the async startup and its background reads to settle.
for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(errors, [], "Startup must complete without a toast error");
assert.equal(requests.filter((item) => item === "GET /api/content").length, 1, "Load content once");
assert.equal(requests.filter((item) => item === "GET /api/session").length, 1, "Check session once");
assert.equal(requests.filter((item) => item === "GET /api/health").length, 1, "Load health once");
assert.equal(requests.filter((item) => item === "POST /api/hit").length, 1, "Count first visit once (mocked)");
assert.equal(requests.length, 4, "Successful startup needs only four mocked requests");
for (const key of [".theme-switch:click", "window:pointermove", "#openAdminBtn:click", "document:click"]) {
  assert.equal(listeners.get(key)?.length, 1, `Bind ${key} once`);
}
assert.equal(listeners.get("document:keydown")?.length, 2, "Bind menu Escape and command palette shortcuts once each");

const versions = new Map();
const expectedVersion = new URL(entries[0], origin).searchParams.get("v");
assert.ok(expectedVersion, "The entry must have a cache version");
assert.equal(ASSET_V, expectedVersion, "Server-rendered pages use the same asset version");
function htmlFiles(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}
const pages = ["index.html", "404.html", ...["about", "notes", "rss"].flatMap(htmlFiles)];
for (const path of pages) {
  const source = readFileSync(new URL(path, root), "utf8");
  for (const [, asset] of source.matchAll(/(?:src|href)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"/g)) {
    const url = new URL(asset, `${origin}/${path}`);
    assert.equal(url.searchParams.get("v"), expectedVersion, `Version ${asset} in ${path}`);
    if (url.pathname === "/js/page.js") {
      const page = moduleAt(url);
      if (page.status === "unlinked") {
        await page.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier)));
      }
    }
  }
}
for (const identifier of modules.keys()) {
  const url = new URL(identifier);
  assert.equal(url.searchParams.get("v"), expectedVersion, `Version ${url.pathname} consistently`);
  assert.ok(!versions.has(url.pathname), `No second URL for ${url.pathname}`);
  versions.set(url.pathname, url.href);
}
const app = modules.get(versions.get("/js/app.js"));
assert.ok(app, "The entry must load the application");
assert.equal(typeof app.namespace.boot, "function", "Application exports an explicit boot function");
const before = [...requests];
const firstBoot = app.namespace.boot();
assert.equal(app.namespace.boot(), firstBoot, "Repeated boot calls share the same promise");
await firstBoot;
assert.deepEqual(requests, before, "Repeated boot must not reload content or count another visit");
const marker = { text: "Shared state regression check" };
app.namespace.setContent({ now: marker });
assert.equal(app.namespace.getState().now, marker, "State updates use the same application instance");
console.log(`Module startup passed: ${modules.size} unique module URLs, 4 mocked requests, one set of event bindings.`);
