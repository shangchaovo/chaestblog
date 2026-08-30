const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8777);

// shared/ 是 ESM（functions/ 也从那里取同一份规则和模板），CJS 这边用动态 import 装载
let rules = null;
let view = null;

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

loadEnv();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".xsl": "application/xml; charset=utf-8",
};

const STATIC_ROOTS = new Set(["css", "js", "data", "assets", "about", "notes", "rss"]);
const STATIC_FILES = new Set(["index.html", "404.html", "robots.txt", "rss.xsl"]);
const rates = new Map();
const loginFailures = new Map();
const versions = new Map();
const projectShots = new Map();
const hits = { total: 0, days: {} };
let health = null;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, payload, extra = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    ...extra,
  });
}

function readJson(name, fallback) {
  const file = path.join(ROOT, "data", name);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(name, data) {
  const file = path.join(ROOT, "data", name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

const defaults = {
  "site.json": readJson("site.json", { projects: [] }),
  "notes.json": readJson("notes.json", { items: [] }),
  "watchlist.json": readJson("watchlist.json", { sectors: [] }),
  "now.json": readJson("now.json", { text: "" }),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJsonVersioned(name, data) {
  const history = versions.get(name) || [];
  history.unshift(readJson(name, {}));
  versions.set(name, history.slice(0, 10));
  writeJson(name, data);
}

function restoreJsonVersion(name) {
  const history = versions.get(name) || [];
  if (!history.length) throw Object.assign(new Error("还没有可恢复的历史版本"), { status: 404 });
  const data = history.shift();
  const current = readJson(name, {});
  history.unshift(current);
  versions.set(name, history.slice(0, 10));
  writeJson(name, data);
  return data;
}

function adminSecret() {
  return String(process.env.HUB_ADMIN_TOKEN || "").trim();
}

function signSession(secret) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `v1.${exp}.${nonce}`;
  const mac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

function tokenOk(given, secret) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifySession(secret, value) {
  if (!secret || !value) return false;
  const parts = String(value).split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [version, exp, nonce, mac] = parts;
  if (Date.now() > Number(exp)) return false;
  const payload = `${version}.${exp}.${nonce}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeEqual(mac, expected);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(adminSecret(), cookies.HubSession);
}

function cookieHeader(value, secure) {
  const bits = ["HubSession=" + encodeURIComponent(value), "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=604800"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function clearCookie(secure) {
  const bits = ["HubSession=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "");
    const parts = forwarded.split(",").map((item) => item.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress || "unknown";
}

function limited(ip) {
  const now = Date.now();
  const last = rates.get(ip) || 0;
  if (now - last < rules.RATE_MS) return true;
  rates.set(ip, now);
  return false;
}

function loginBlocked(ip) {
  const state = loginFailures.get(ip);
  if (!state || Date.now() - state.startedAt > 10 * 60 * 1000) {
    loginFailures.delete(ip);
    return false;
  }
  return state.failures >= 5;
}

function recordLoginFailure(ip) {
  const current = loginFailures.get(ip);
  if (!current || Date.now() - current.startedAt > 10 * 60 * 1000) {
    loginFailures.set(ip, { failures: 1, startedAt: Date.now() });
    return;
  }
  current.failures += 1;
}

function safeStaticPath(urlPath) {
  try {
    const decoded = decodeURIComponent(urlPath.split("?")[0]);
    let requested = decoded === "/" ? "/index.html" : decoded;
    if (requested.endsWith("/") && requested !== "/") requested += "index.html";
    let resolved = path.resolve(ROOT, `.${requested}`);
    if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) return null;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = path.join(resolved, "index.html");
    }
    const rel = path.relative(ROOT, resolved).split(path.sep);
    if (rel.includes("..")) return null;
    if (STATIC_FILES.has(rel[0]) && rel.length === 1) return resolved;
    if (!STATIC_ROOTS.has(rel[0])) return null;
    return resolved;
  } catch (error) {
    return null;
  }
}

async function probeTargets(targets) {
  const checks = await Promise.all(targets.map(async (target) => {
    const startedAt = Date.now();
    try {
      const response = await fetch(target.url, {
        redirect: "follow",
        headers: { "User-Agent": "chaestblog-health/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      return { id: target.id, ok: response.status < 400, status: response.status, ms: Date.now() - startedAt };
    } catch (error) {
      return { id: target.id, ok: false, status: 0, ms: Date.now() - startedAt };
    }
  }));
  return { checkedAt: new Date().toISOString(), checks };
}

function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("内容太大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, "") || "/";
  const secure = url.protocol === "https:" || req.headers["x-forwarded-proto"] === "https";

  if (route === "/api/session" && req.method === "GET") {
    sendJson(res, 200, { admin: isAdmin(req) });
    return;
  }

  if (route === "/api/session" && req.method === "POST") {
    const secret = adminSecret();
    if (!secret) {
      sendJson(res, 503, { error: "未配置 HUB_ADMIN_TOKEN" });
      return;
    }
    const ip = clientIp(req);
    if (loginBlocked(ip)) {
      sendJson(res, 429, { error: "口令尝试次数过多，请 10 分钟后再试" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    if (!tokenOk(String(body.token || ""), secret)) {
      recordLoginFailure(ip);
      sendJson(res, 403, { error: "口令不对" });
      return;
    }
    loginFailures.delete(ip);
    sendJson(res, 200, { admin: true }, { "Set-Cookie": cookieHeader(signSession(secret), secure) });
    return;
  }

  if (route === "/api/session" && req.method === "DELETE") {
    sendJson(res, 200, { admin: false }, { "Set-Cookie": clearCookie(secure) });
    return;
  }

  if (route === "/api/content" && req.method === "GET") {
    sendJson(res, 200, {
      site: readJson("site.json", { projects: [] }),
      notes: readJson("notes.json", { items: [] }),
      watchlist: readJson("watchlist.json", { sectors: [] }),
      now: readJson("now.json", { text: "" }),
    });
    return;
  }

  if (route === "/api/notes" && req.method === "PUT") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "访客不能改观点" });
      return;
    }
    const notes = rules.assertNotes(JSON.parse((await readBody(req)) || "{}"));
    writeJsonVersioned("notes.json", notes);
    sendJson(res, 200, { ok: true, notes });
    return;
  }

  if (route === "/api/watchlist" && req.method === "PUT") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "访客不能改盯盘" });
      return;
    }
    const watchlist = rules.assertWatchlist(JSON.parse((await readBody(req)) || "{}"));
    writeJsonVersioned("watchlist.json", watchlist);
    sendJson(res, 200, { ok: true, watchlist });
    return;
  }

  if (route === "/api/now" && req.method === "PUT") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "这项只能我来改" });
      return;
    }
    const now = rules.assertNow(JSON.parse((await readBody(req)) || "{}"));
    writeJsonVersioned("now.json", now);
    sendJson(res, 200, { ok: true, now });
    return;
  }

  if (route === "/api/projects" && req.method === "PUT") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "访客不能改项目" });
      return;
    }
    const current = readJson("site.json", { projects: [] });
    const projects = rules.assertProjects(JSON.parse((await readBody(req)) || "{}"));
    const site = { ...current, projects, updatedAt: new Date().toISOString() };
    writeJsonVersioned("site.json", site);
    sendJson(res, 200, { ok: true, site });
    return;
  }

  if (route === "/api/restore" && req.method === "POST") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "只有作者能恢复内容" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const names = { site: "site.json", notes: "notes.json", watchlist: "watchlist.json", now: "now.json" };
    const name = names[body.key];
    if (!name) {
      sendJson(res, 400, { error: "不支持恢复这类内容" });
      return;
    }
    let data;
    if (body.source === "default") {
      data = clone(defaults[name]);
      writeJsonVersioned(name, data);
    } else if (body.source === "latest") {
      data = restoreJsonVersion(name);
    } else {
      sendJson(res, 400, { error: "恢复来源不正确" });
      return;
    }
    sendJson(res, 200, { ok: true, key: body.key, data });
    return;
  }

  if (route === "/api/project-shot" && req.method === "POST") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "只有作者能上传截图" });
      return;
    }
    const body = JSON.parse((await readBody(req, 3_000_000)) || "{}");
    const match = String(body.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
    if (!/^[a-z0-9-]{1,60}$/.test(body.projectId || "") || !match || match[2].length > 2_800_000) {
      sendJson(res, 400, { error: "截图格式或项目 ID 不正确" });
      return;
    }
    projectShots.set(body.projectId, { mime: match[1].toLowerCase(), base64: match[2] });
    sendJson(res, 200, { ok: true, path: `api/project-shot/${body.projectId}` });
    return;
  }

  if (route.startsWith("/api/project-shot/") && req.method === "GET") {
    const projectId = route.slice("/api/project-shot/".length);
    const shot = projectShots.get(projectId);
    if (!shot) {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    send(res, 200, Buffer.from(shot.base64, "base64"), {
      "Content-Type": shot.mime,
      "X-Content-Type-Options": "nosniff",
    });
    return;
  }

  if (route === "/api/health" && req.method === "GET") {
    const site = readJson("site.json", { projects: [] });
    const targets = (site.projects || [])
      .filter((project) => project.status === "live" && project.live)
      .map((project) => ({ id: project.id, url: project.live }));
    const fresh = health && Date.now() - Date.parse(health.checkedAt) < 10 * 60 * 1000;
    if (!fresh) health = await probeTargets(targets);
    sendJson(res, 200, { ...health, stale: false });
    return;
  }

  if (route === "/api/hit" && (req.method === "POST" || req.method === "GET")) {
    const day = new Date().toISOString().slice(0, 10);
    if (req.method === "POST") {
      hits.total += 1;
      hits.days[day] = (hits.days[day] || 0) + 1;
    }
    sendJson(res, 200, { total: hits.total, today: hits.days[day] || 0 });
    return;
  }

  if (route === "/api/danmaku" && req.method === "GET") {
    sendJson(res, 200, readJson("danmaku.json", { items: [] }));
    return;
  }

  if (route === "/api/danmaku" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const safe = rules.assertDanmaku(body);
    const ip = clientIp(req);
    if (limited(ip)) {
      sendJson(res, 429, { error: "发太快了，过几秒再试" });
      return;
    }
    const store = readJson("danmaku.json", { items: [] });
    const item = {
      id: `d_${crypto.randomBytes(6).toString("hex")}`,
      nick: safe.nick,
      text: safe.text,
      createdAt: new Date().toISOString(),
    };
    store.items = [...(store.items || []), item].slice(-rules.DANMAKU_KEEP);
    store.updatedAt = item.createdAt;
    writeJson("danmaku.json", store);
    sendJson(res, 200, { item });
    return;
  }

  if (route === "/api/danmaku" && req.method === "DELETE") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { error: "只有作者能清弹幕" });
      return;
    }
    writeJson("danmaku.json", { updatedAt: new Date().toISOString(), items: [] });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "找不到这个接口" });
}

// 复刻 functions/notes/[[path]].js、rss.xml.js、sitemap.xml.js 的行为
function renderDynamic(res, pathname) {
  const notes = readJson("notes.json", { items: [] });
  if (pathname === "/rss.xml") {
    send(res, 200, view.rssXml(notes), { "Content-Type": "application/rss+xml; charset=utf-8" });
    return true;
  }
  if (pathname === "/sitemap.xml") {
    send(res, 200, view.sitemapXml(notes), { "Content-Type": MIME[".xml"] });
    return true;
  }
  if (pathname === "/notes") {
    send(res, 301, "", { Location: "/notes/" });
    return true;
  }
  if (pathname === "/notes/") {
    send(res, 200, view.archivePage(notes), { "Content-Type": MIME[".html"] });
    return true;
  }
  const match = pathname.match(/^\/notes\/([^/]+)\/?$/);
  if (match) {
    const slug = rules.safeSlug(decodeURIComponent(match[1]));
    const note = slug ? view.publishedNotes(notes).find((item) => item.slug === slug) : null;
    if (note) {
      send(res, 200, view.notePage(note), { "Content-Type": MIME[".html"] });
      return true;
    }
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method Not Allowed");
      return;
    }
    // 和线上一样：手写的静态页优先，剩下的交给动态渲染
    const file = safeStaticPath(url.pathname);
    if (file && fs.existsSync(file) && !fs.statSync(file).isDirectory()) {
      const ext = path.extname(file).toLowerCase();
      send(res, 200, fs.readFileSync(file), { "Content-Type": MIME[ext] || "application/octet-stream" });
      return;
    }
    if (renderDynamic(res, url.pathname)) return;
    send(res, 404, fs.readFileSync(path.join(ROOT, "404.html")), { "Content-Type": MIME[".html"] });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    sendJson(res, status, { error: error.message || "服务器出错了" });
  }
});

(async () => {
  rules = await import("./shared/rules.mjs");
  view = await import("./shared/view.mjs");
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Chase hub http://127.0.0.1:${PORT}`);
  });
})();

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用，设 PORT= 换一个，不要自动漂移。`);
    process.exit(1);
  }
  throw error;
});
