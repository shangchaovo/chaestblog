import {
  json,
  adminSecret,
  signSession,
  cookieHeader,
  clearCookie,
  isAdmin,
  readStore,
  writeStore,
  rateLimited,
  assertDanmaku,
  assertNotes,
  assertWatchlist,
  assertNow,
  assertProjects,
  assertProjectShot,
  randomId,
  tokenOk,
  DANMAKU_KEEP,
  writeStoreVersioned,
  restoreStoreVersion,
  readStaticStore,
  loginBlocked,
  recordLoginFailure,
  clearLoginFailures,
  probeTargets,
  healthIsFresh,
  readHealth,
  saveHealth,
  bumpHits,
  readHits,
} from "../_utils.js";

function routeName(context) {
  const parts = context.params.path;
  if (Array.isArray(parts)) return parts.join("/");
  return String(parts || "");
}

async function readJson(request, maxBytes = 250_000) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error("内容太大"), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text) return {};
  return JSON.parse(text);
}

export async function onRequest(context) {
  const { request, env } = context;
  const route = routeName(context);
  const method = request.method;

  try {
    if (route === "session" && method === "GET") {
      return json(200, { admin: await isAdmin(request, env) });
    }

    if (route === "session" && method === "POST") {
      const secret = adminSecret(env);
      if (!secret) return json(503, { error: "未配置 HUB_ADMIN_TOKEN" });
      if (await loginBlocked(env, request)) {
        return json(429, { error: "口令尝试次数过多，请 10 分钟后再试" });
      }
      const body = await readJson(request);
      if (!(await tokenOk(String(body.token || ""), secret))) {
        await recordLoginFailure(env, request);
        return json(403, { error: "口令不对" });
      }
      await clearLoginFailures(env, request);
      const value = await signSession(secret);
      return json(200, { admin: true }, { "Set-Cookie": cookieHeader(value, request) });
    }

    if (route === "session" && method === "DELETE") {
      return json(200, { admin: false }, { "Set-Cookie": clearCookie(request) });
    }

    if (route === "content" && method === "GET") {
      const [site, notes, watchlist, now] = await Promise.all([
        readStore(env, request, "site", "/data/site.json", { projects: [] }),
        readStore(env, request, "notes", "/data/notes.json", { items: [] }),
        readStore(env, request, "watchlist", "/data/watchlist.json", { sectors: [] }),
        readStore(env, request, "now", "/data/now.json", { text: "" }),
      ]);
      return json(200, { site, notes, watchlist, now, kv: Boolean(env.HUB_KV) });
    }

    if (route === "notes" && method === "PUT") {
      if (!(await isAdmin(request, env))) return json(401, { error: "访客不能改观点" });
      const notes = assertNotes(await readJson(request));
      await writeStoreVersioned(env, "notes", notes);
      return json(200, { ok: true, notes });
    }

    if (route === "watchlist" && method === "PUT") {
      if (!(await isAdmin(request, env))) return json(401, { error: "访客不能改盯盘" });
      const watchlist = assertWatchlist(await readJson(request));
      await writeStoreVersioned(env, "watchlist", watchlist);
      return json(200, { ok: true, watchlist });
    }

    if (route === "now" && method === "PUT") {
      if (!(await isAdmin(request, env))) return json(401, { error: "这项只能我来改" });
      const now = assertNow(await readJson(request));
      await writeStoreVersioned(env, "now", now);
      return json(200, { ok: true, now });
    }

    if (route === "projects" && method === "PUT") {
      if (!(await isAdmin(request, env))) return json(401, { error: "访客不能改项目" });
      const current = await readStore(env, request, "site", "/data/site.json", { projects: [] });
      const projects = assertProjects(await readJson(request));
      const site = { ...current, projects, updatedAt: new Date().toISOString() };
      await writeStoreVersioned(env, "site", site);
      return json(200, { ok: true, site });
    }

    if (route === "restore" && method === "POST") {
      if (!(await isAdmin(request, env))) return json(401, { error: "只有作者能恢复内容" });
      const body = await readJson(request);
      const allowed = {
        notes: ["/data/notes.json", { items: [] }],
        watchlist: ["/data/watchlist.json", { sectors: [] }],
        now: ["/data/now.json", { text: "" }],
        site: ["/data/site.json", { projects: [] }],
      };
      if (!allowed[body.key]) return json(400, { error: "不支持恢复这类内容" });
      let data;
      if (body.source === "default") {
        data = await readStaticStore(request, allowed[body.key][0], allowed[body.key][1]);
        await writeStoreVersioned(env, body.key, data);
      } else if (body.source === "latest") {
        data = await restoreStoreVersion(env, body.key);
      } else {
        return json(400, { error: "恢复来源不正确" });
      }
      return json(200, { ok: true, key: body.key, data });
    }

    if (route === "project-shot" && method === "POST") {
      if (!(await isAdmin(request, env))) return json(401, { error: "只有作者能上传截图" });
      const shot = assertProjectShot(await readJson(request, 3_000_000));
      await writeStore(env, `shot:${shot.projectId}`, { mime: shot.mime, base64: shot.base64 });
      return json(200, { ok: true, path: `api/project-shot/${shot.projectId}` });
    }

    if (route.startsWith("project-shot/") && method === "GET") {
      const projectId = route.slice("project-shot/".length);
      if (!/^[a-z0-9-]{1,60}$/.test(projectId) || !env.HUB_KV) return new Response("Not Found", { status: 404 });
      const raw = await env.HUB_KV.get(`shot:${projectId}`);
      if (!raw) return new Response("Not Found", { status: 404 });
      const shot = JSON.parse(raw);
      const bytes = Uint8Array.from(atob(shot.base64), (char) => char.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          "Content-Type": shot.mime,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (route === "health" && method === "GET") {
      const site = await readStore(env, request, "site", "/data/site.json", { projects: [] });
      const targets = (site.projects || [])
        .filter((project) => project.status === "live" && project.live)
        .map((project) => ({ id: project.id, url: project.live }));
      const cached = await readHealth(env);
      if (cached && healthIsFresh(cached)) {
        return json(200, { ...cached, stale: false });
      }
      // 有旧结果就先返回旧的，探活放到后台，别让访客等 6 秒
      if (cached) {
        context.waitUntil(probeTargets(targets).then((health) => saveHealth(env, health)));
        return json(200, { ...cached, stale: true });
      }
      const health = await probeTargets(targets);
      context.waitUntil(saveHealth(env, health));
      return json(200, { ...health, stale: false });
    }

    if (route === "hit" && method === "POST") {
      const counts = await bumpHits(env);
      return json(200, counts);
    }

    if (route === "hit" && method === "GET") {
      return json(200, await readHits(env));
    }

    if (route === "danmaku" && method === "GET") {
      const store = await readStore(env, request, "danmaku", "/data/danmaku.json", { items: [] });
      return json(200, store);
    }

    if (route === "danmaku" && method === "POST") {
      const safe = assertDanmaku(await readJson(request));
      if (await rateLimited(env, request)) return json(429, { error: "发太快了，过几秒再试" });
      const store = await readStore(env, request, "danmaku", "/data/danmaku.json", { items: [] });
      const item = {
        id: randomId("d"),
        nick: safe.nick,
        text: safe.text,
        createdAt: new Date().toISOString(),
      };
      store.items = [...(store.items || []), item].slice(-DANMAKU_KEEP);
      store.updatedAt = item.createdAt;
      await writeStore(env, "danmaku", store);
      return json(200, { item });
    }

    if (route === "danmaku" && method === "DELETE") {
      if (!(await isAdmin(request, env))) return json(401, { error: "只有作者能清弹幕" });
      await writeStore(env, "danmaku", { updatedAt: new Date().toISOString(), items: [] });
      return json(200, { ok: true });
    }

    return json(404, { error: "找不到这个接口" });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(status, { error: error.message || "服务器出错了" });
  }
}
