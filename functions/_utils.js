import { DANMAKU_KEEP, RATE_MS } from "../shared/rules.mjs";

const VERSION_KEEP = 10;
const VERSION_TTL = 90 * 24 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 10 * 60;
const LOGIN_MAX_FAILURES = 5;
const HEALTH_TTL_MS = 10 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 6000;

// 校验规则只有 shared/rules.mjs 一份，这里原样转出去给路由用
export {
  assertDanmaku,
  assertNotes,
  assertWatchlist,
  assertNow,
  assertProjects,
  assertProjectShot,
} from "../shared/rules.mjs";

export { DANMAKU_KEEP };

export function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function adminSecret(env) {
  return String(env.HUB_ADMIN_TOKEN || "").trim();
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function signSession(secret) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const payload = `v1.${exp}.${nonce}`;
  const mac = await hmacHex(secret, payload);
  return `${payload}.${mac}`;
}

export async function verifySession(secret, value) {
  if (!secret || !value) return false;
  const parts = String(value).split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [version, exp, nonce, mac] = parts;
  if (Date.now() > Number(exp)) return false;
  const expected = await hmacHex(secret, `${version}.${exp}.${nonce}`);
  return safeEqual(mac, expected);
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return "";
}

export function cookieHeader(value, request) {
  const secure = new URL(request.url).protocol === "https:";
  const bits = [`HubSession=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=604800"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearCookie(request) {
  const secure = new URL(request.url).protocol === "https:";
  const bits = ["HubSession=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export async function isAdmin(request, env) {
  return verifySession(adminSecret(env), readCookie(request, "HubSession"));
}

export async function readStore(env, request, key, staticPath, fallback) {
  if (env.HUB_KV) {
    const raw = await env.HUB_KV.get(key);
    if (raw) return JSON.parse(raw);
  }
  try {
    const response = await fetch(new URL(staticPath, request.url));
    if (response.ok) return await response.json();
  } catch (error) {}
  return fallback;
}

export async function writeStore(env, key, data) {
  if (!env.HUB_KV) {
    throw Object.assign(new Error("未绑定 HUB_KV，无法持久化。在 Cloudflare Pages 给这个项目绑一个 KV，名称填 HUB_KV。"), { status: 503 });
  }
  await env.HUB_KV.put(key, JSON.stringify(data));
}

export async function writeStoreVersioned(env, key, data) {
  if (!env.HUB_KV) {
    throw Object.assign(new Error("未绑定 HUB_KV，无法持久化。在 Cloudflare Pages 给这个项目绑一个 KV，名称填 HUB_KV。"), { status: 503 });
  }
  const previous = await env.HUB_KV.get(key);
  if (previous) {
    const createdAt = new Date().toISOString();
    const backupKey = `backup:${key}:${Date.now()}`;
    const historyKey = `history:${key}`;
    let history = [];
    try {
      history = JSON.parse((await env.HUB_KV.get(historyKey)) || "[]");
    } catch (error) {}
    const next = [{ key: backupKey, createdAt }, ...history].slice(0, VERSION_KEEP);
    const expired = history.slice(VERSION_KEEP - 1);
    await Promise.all([
      env.HUB_KV.put(backupKey, previous, { expirationTtl: VERSION_TTL }),
      env.HUB_KV.put(historyKey, JSON.stringify(next)),
      ...expired.map((item) => env.HUB_KV.delete(item.key)),
    ]);
  }
  await env.HUB_KV.put(key, JSON.stringify(data));
}

export async function restoreStoreVersion(env, key) {
  if (!env.HUB_KV) throw Object.assign(new Error("未绑定 HUB_KV"), { status: 503 });
  let history = [];
  try {
    history = JSON.parse((await env.HUB_KV.get(`history:${key}`)) || "[]");
  } catch (error) {}
  const latest = history[0];
  if (!latest) throw Object.assign(new Error("还没有可恢复的历史版本"), { status: 404 });
  const raw = await env.HUB_KV.get(latest.key);
  if (!raw) throw Object.assign(new Error("这个历史版本已经过期"), { status: 404 });
  const data = JSON.parse(raw);
  await writeStoreVersioned(env, key, data);
  return data;
}

export async function readStaticStore(request, path, fallback) {
  try {
    const response = await fetch(new URL(path, request.url));
    if (response.ok) return await response.json();
  } catch (error) {}
  return fallback;
}

function loginKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  return `login:${ip}`;
}

export async function loginBlocked(env, request) {
  if (!env.HUB_KV) return false;
  try {
    const state = JSON.parse((await env.HUB_KV.get(loginKey(request))) || "{}");
    return Number(state.failures || 0) >= LOGIN_MAX_FAILURES;
  } catch (error) {
    return false;
  }
}

export async function recordLoginFailure(env, request) {
  if (!env.HUB_KV) return;
  let failures = 0;
  try {
    const state = JSON.parse((await env.HUB_KV.get(loginKey(request))) || "{}");
    failures = Number(state.failures || 0);
  } catch (error) {}
  await env.HUB_KV.put(loginKey(request), JSON.stringify({ failures: failures + 1 }), {
    expirationTtl: LOGIN_WINDOW_SECONDS,
  });
}

export async function clearLoginFailures(env, request) {
  if (env.HUB_KV) await env.HUB_KV.delete(loginKey(request));
}

export async function rateLimited(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.HUB_KV) {
    const key = `rate:${ip}`;
    const last = Number((await env.HUB_KV.get(key)) || 0);
    const now = Date.now();
    if (last && now - last < RATE_MS) return true;
    // KV 的 expirationTtl 最小为 60 秒，故改存时间戳来实现更短的限流窗口
    await env.HUB_KV.put(key, String(now), { expirationTtl: 60 });
    return false;
  }
  return false;
}

export function randomId(prefix) {
  const bytes = [...crypto.getRandomValues(new Uint8Array(6))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${bytes}`;
}

// 逐个探活线上项目。只看能不能连上和用了多久，不解析页面内容。
export async function probeTargets(targets) {
  const checks = await Promise.all(targets.map(async (target) => {
    const startedAt = Date.now();
    try {
      const response = await fetch(target.url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "chaestblog-health/1.0" },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return {
        id: target.id,
        ok: response.status < 400,
        status: response.status,
        ms: Date.now() - startedAt,
      };
    } catch (error) {
      return { id: target.id, ok: false, status: 0, ms: Date.now() - startedAt };
    }
  }));
  return { checkedAt: new Date().toISOString(), checks };
}

export function healthIsFresh(health) {
  const at = Date.parse(health?.checkedAt || "");
  return Boolean(at) && Date.now() - at < HEALTH_TTL_MS;
}

export async function readHealth(env) {
  if (!env.HUB_KV) return null;
  try {
    return JSON.parse((await env.HUB_KV.get("health")) || "null");
  } catch (error) {
    return null;
  }
}

export async function saveHealth(env, health) {
  if (env.HUB_KV) await env.HUB_KV.put("health", JSON.stringify(health));
}

// 简易访问计数：一次会话只记一笔，避免把 KV 的每日写配额打满
export async function bumpHits(env) {
  if (!env.HUB_KV) return { total: 0, today: 0 };
  let store = { total: 0, days: {} };
  try {
    store = JSON.parse((await env.HUB_KV.get("hits")) || "null") || store;
  } catch (error) {}
  const day = new Date().toISOString().slice(0, 10);
  const days = store.days || {};
  days[day] = Number(days[day] || 0) + 1;
  const kept = Object.fromEntries(
    Object.entries(days).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30)
  );
  const next = { total: Number(store.total || 0) + 1, days: kept };
  await env.HUB_KV.put("hits", JSON.stringify(next));
  return { total: next.total, today: kept[day] };
}

export async function readHits(env) {
  if (!env.HUB_KV) return { total: 0, today: 0 };
  try {
    const store = JSON.parse((await env.HUB_KV.get("hits")) || "null") || {};
    const day = new Date().toISOString().slice(0, 10);
    return { total: Number(store.total || 0), today: Number((store.days || {})[day] || 0) };
  } catch (error) {
    return { total: 0, today: 0 };
  }
}

export async function tokenOk(given, secret) {
  const encode = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  const [left, right] = await Promise.all([encode(given), encode(secret)]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a[i] ^ b[i];
  return out === 0;
}
