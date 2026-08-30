import { readStore } from "../_utils.js";
import { safeSlug } from "../../shared/rules.mjs";
import { archivePage, notePage, notFoundPage, publishedNotes } from "../../shared/view.mjs";

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

function segments(context) {
  const parts = context.params.path;
  if (Array.isArray(parts)) return parts.filter(Boolean);
  return String(parts || "").split("/").filter(Boolean);
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 手写的长文页（notes/<slug>/index.html）优先，动态渲染只接没有静态页的 slug
  try {
    const staticFirst = await context.next();
    if (staticFirst.status === 200) return staticFirst;
  } catch (error) {}

  const notes = await readStore(context.env, request, "notes", "/data/notes.json", { items: [] });
  const parts = segments(context);

  if (!parts.length) {
    return new Response(archivePage(notes), { headers: HTML });
  }

  const slug = safeSlug(parts[0]);
  const note = slug ? publishedNotes(notes).find((item) => item.slug === slug) : null;
  if (!note) {
    return new Response(notFoundPage(), { status: 404, headers: { ...HTML, "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  if (!url.pathname.endsWith("/")) {
    return Response.redirect(`${url.origin}/notes/${slug}/`, 301);
  }
  return new Response(notePage(note), { headers: HTML });
}
