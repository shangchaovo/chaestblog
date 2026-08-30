import { readStore } from "./_utils.js";
import { sitemapXml } from "../shared/view.mjs";

export async function onRequest(context) {
  const notes = await readStore(context.env, context.request, "notes", "/data/notes.json", { items: [] });
  return new Response(sitemapXml(notes), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800",
    },
  });
}
