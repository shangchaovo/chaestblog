import { readStore } from "./_utils.js";
import { rssXml } from "../shared/view.mjs";

export async function onRequest(context) {
  const notes = await readStore(context.env, context.request, "notes", "/data/notes.json", { items: [] });
  return new Response(rssXml(notes), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800",
    },
  });
}
