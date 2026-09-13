import { readStore } from "./_utils.js";
import { homePage } from "../shared/view.mjs";

// 保留静态首页及 _headers 的样式和安全策略，只让观点首屏跟随当前 KV。
export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const [page, notes] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" })),
    readStore(env, request, "notes", "/data/notes.json", { items: [] }).catch(() => null),
  ]);
  if (page.status !== 200) return page;
  const source = await page.text();
  let html = source;
  // 内容存储临时不可用时，仍提供可阅读的静态页，前端会继续尝试加载内容。
  if (notes) {
    try { html = homePage(source, notes); } catch (error) {}
  }
  const headers = new Headers(page.headers);
  // 静态文件的校验器和长度不适用于替换后的 HTML，也不能缓存已删除观点的首屏。
  for (const name of ["ETag", "Last-Modified", "Content-Length", "Content-Encoding"]) headers.delete(name);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : html, { headers });
}
