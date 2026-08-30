// 服务端渲染用的模板与工具：server.js（本地）和 functions/（线上）共用同一份，
// 保证本地看到的观点页 / RSS / sitemap 和线上一模一样。
export const ORIGIN = "https://chaestblog.pages.dev";
export const SITE_NAME = "chaestblog";
export const AUTHOR = "Chase Xie";
export const TWITTER = "@johny_xie";
// CSS / JS 的防缓存版本号。改了样式或脚本就 bump 这里和 index.html 里的 ?v=。
export const ASSET_V = "20260830a";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function escapeXml(value) {
  return escapeHtml(value);
}

function safeLink(url) {
  const raw = String(url || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(\/|#|mailto:)/.test(raw)) return raw;
  return "";
}

// 行内格式：只在已转义的文本上跑，所以不会引入新的标签注入面
function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, url) => {
      const href = safeLink(url.replace(/&amp;/g, "&"));
      if (!href) return text;
      const external = /^https?:\/\//i.test(href);
      const attrs = external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${escapeHtml(href)}"${attrs}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// Markdown 的一个小子集：标题、有序/无序列表、引用、代码块、分割线、段落。
// 够写观点文章，不引第三方依赖。
export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(escapeHtml(paragraph.join(" ")))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([a-z0-9+#-]*)\s*$/i);
    if (code) {
      if (fence) {
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (fence) {
      flush();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      out.push("<hr>");
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      out.push(`<blockquote>${inline(escapeHtml(quote[1].trim()))}</blockquote>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      flushParagraph();
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet || ordered)[1].trim());
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flush();
  return out.join("\n");
}

export function plainText(source, max = 200) {
  const text = String(source || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function readingMinutes(source) {
  const text = String(source || "");
  // 中文按字数、西文按词数，各自折算后取和
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9']+/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 220));
}

export function formatDay(iso) {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function noteUrl(note) {
  return `${ORIGIN}/notes/${note.slug}/`;
}

export function publishedNotes(notes) {
  return (notes?.items || []).filter((item) => item && item.slug);
}

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("hubTheme");if(t==="liquid"||t==="eye"||t==="ink"){document.documentElement.dataset.theme=t;return;}if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.dataset.theme="ink";}}catch(e){}})();`;

function head({ title, description, canonical, type = "website", extraMeta = "", jsonLd = "" }) {
  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS" href="${ORIGIN}/rss.xml" />
    <meta property="og:type" content="${type}" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ORIGIN}/assets/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${TWITTER}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ORIGIN}/assets/og.jpg" />
${extraMeta}    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <link rel="stylesheet" href="/css/themes.css?v=${ASSET_V}" />
    <link rel="stylesheet" href="/css/styles.css?v=${ASSET_V}" />
${jsonLd}    <script>${THEME_BOOT}</script>`;
}

function chrome() {
  return `    <div class="atmosphere" aria-hidden="true">
      <span class="blob blob-a"></span>
      <span class="blob blob-b"></span>
      <span class="blob blob-c"></span>
    </div>
    <header class="nav glass">
      <a class="brand" href="/">
        <img class="brand-avatar" src="/assets/avatar.jpg" alt="${AUTHOR}" width="40" height="40" />
        <span class="brand-copy">
          <strong>${AUTHOR}</strong>
          <small>Personal Hub</small>
        </span>
      </a>
      <nav class="nav-links" aria-label="页面">
        <a href="/#sites">站点</a>
        <a href="/notes/">观点</a>
        <a href="/#watch">关注</a>
        <a href="/about/">关于</a>
        <a href="/#contact">联系</a>
      </nav>
      <div class="theme-switch" role="radiogroup" aria-label="主题">
        <button class="theme-btn" type="button" data-theme="liquid" aria-pressed="true" title="Liquid Glass"><i class="orb orb-liquid" aria-hidden="true"></i><span>玻璃</span></button>
        <button class="theme-btn" type="button" data-theme="eye" aria-pressed="false" title="护眼"><i class="orb orb-eye" aria-hidden="true"></i><span>护眼</span></button>
        <button class="theme-btn" type="button" data-theme="ink" aria-pressed="false" title="墨夜"><i class="orb orb-ink" aria-hidden="true"></i><span>墨夜</span></button>
      </div>
    </header>`;
}

function shell({ bodyClass, headHtml, main }) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="liquid">
  <head>
${headHtml}
  </head>
  <body class="${bodyClass}">
${chrome()}
${main}
    <script src="/js/page.js?v=${ASSET_V}" type="module"></script>
  </body>
</html>
`;
}

export function notePage(note) {
  const canonical = noteUrl(note);
  const day = formatDay(note.createdAt);
  const updated = note.updatedAt ? formatDay(note.updatedAt) : day;
  const description = plainText(note.body || note.article, 150);
  const minutes = readingMinutes(note.article || note.body);
  const jsonLd = `    <script type="application/ld+json">
${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: note.title,
    description,
    inLanguage: "zh-CN",
    datePublished: day,
    dateModified: updated,
    mainEntityOfPage: canonical,
    image: `${ORIGIN}/assets/og.jpg`,
    author: { "@type": "Person", "@id": `${ORIGIN}/#person`, name: AUTHOR, url: `${ORIGIN}/` },
    publisher: { "@type": "Person", "@id": `${ORIGIN}/#person`, name: AUTHOR },
  }, null, 2).split("\n").map((line) => `      ${line}`).join("\n")}
    </script>
`;
  const extraMeta = `    <meta property="article:published_time" content="${escapeHtml(note.createdAt || day)}" />
    <meta property="article:author" content="${AUTHOR}" />
`;
  const body = note.article
    ? renderMarkdown(note.article)
    : `<p>${escapeHtml(note.body || "")}</p>`;
  const main = `    <main class="page-doc">
      <p class="crumbs"><a href="/">${SITE_NAME}</a> / <a href="/notes/">观点</a> / ${escapeHtml(note.title)}</p>
      <p class="kicker">Notes</p>
      <h1>${escapeHtml(note.title)}</h1>
      <p class="updated">${escapeHtml(day)} · ${AUTHOR} · 约 ${minutes} 分钟</p>
      ${note.article && note.body ? `<p class="lede">${escapeHtml(note.body)}</p>` : ""}
      <div class="prose">
${body}
      </div>
      <p class="note-nav"><a href="/notes/">← 回到全部观点</a></p>
      <p class="disclaimer">个人观察，用来固定我当时为什么这么看。不是投资建议，也不构成任何推荐。</p>
    </main>`;
  return shell({
    bodyClass: "page article-page",
    headHtml: head({
      title: `${note.title} · ${AUTHOR}`,
      description,
      canonical,
      type: "article",
      extraMeta,
      jsonLd,
    }),
    main,
  });
}

export function archivePage(notes) {
  const items = publishedNotes(notes);
  const canonical = `${ORIGIN}/notes/`;
  const jsonLd = `    <script type="application/ld+json">
${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} · 观点`,
    url: canonical,
    inLanguage: "zh-CN",
    author: { "@type": "Person", "@id": `${ORIGIN}/#person`, name: AUTHOR },
    blogPost: items.map((note) => ({
      "@type": "BlogPosting",
      headline: note.title,
      url: noteUrl(note),
      datePublished: formatDay(note.createdAt),
    })),
  }, null, 2).split("\n").map((line) => `      ${line}`).join("\n")}
    </script>
`;
  const list = items.length
    ? `<div class="archive-list">
${items.map((note) => `        <a class="archive-item glass" href="/notes/${escapeHtml(note.slug)}/">
          <time>${escapeHtml(formatDay(note.createdAt))}</time>
          <strong>${escapeHtml(note.title)}</strong>
          <small>${escapeHtml(plainText(note.body || note.article, 110))}</small>
        </a>`).join("\n")}
      </div>`
    : `<p class="lede">还没有公开的长文，观点先记在<a href="/#notes">首页</a>。</p>`;
  const main = `    <main class="page-doc archive-doc">
      <p class="crumbs"><a href="/">${SITE_NAME}</a> / 观点</p>
      <p class="kicker">Notes</p>
      <h1>观点</h1>
      <p class="lede">写过的判断都留在这里。数字会变，判断按日期读。共 ${items.length} 篇。</p>
      ${list}
      <p class="note-nav"><a href="/rss.xml">RSS 订阅</a> · <a href="/">回首页</a></p>
    </main>`;
  return shell({
    bodyClass: "page archive-page",
    headHtml: head({
      title: `观点 · ${AUTHOR}`,
      description: `${AUTHOR} 写过的判断与长文：AI 算力、HBM、预测市场与独立开发。共 ${items.length} 篇。`,
      canonical,
      jsonLd,
    }),
    main,
  });
}

export function notFoundPage() {
  const main = `    <main class="page-doc notfound-doc">
      <p class="kicker">404</p>
      <h1>这页不在了</h1>
      <p class="lede">链接可能过期，或者我把它挪走了。下面这几个入口是好的。</p>
      <p class="note-nav"><a href="/">回首页</a> · <a href="/notes/">全部观点</a> · <a href="/about/">关于我</a> · <a href="/rss.xml">RSS</a></p>
    </main>`;
  return shell({
    bodyClass: "page notfound-page",
    headHtml: `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>页面不存在 · ${AUTHOR}</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <link rel="stylesheet" href="/css/themes.css?v=${ASSET_V}" />
    <link rel="stylesheet" href="/css/styles.css?v=${ASSET_V}" />
    <script>${THEME_BOOT}</script>`,
    main,
  });
}

export function rssXml(notes) {
  const items = publishedNotes(notes).slice(0, 30);
  const latest = items[0]?.updatedAt || items[0]?.createdAt || new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} · ${AUTHOR}</title>
    <link>${ORIGIN}/</link>
    <description>${AUTHOR} 关于市场工具、AI 算力、HBM 与独立产品的个人笔记。</description>
    <language>zh-CN</language>
    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>
    <ttl>1440</ttl>
${items.map((note) => `    <item>
      <title>${escapeXml(note.title)}</title>
      <link>${noteUrl(note)}</link>
      <guid isPermaLink="true">${noteUrl(note)}</guid>
      <pubDate>${new Date(note.createdAt || latest).toUTCString()}</pubDate>
      <description>${escapeXml(plainText(note.body || note.article, 300))}</description>
    </item>`).join("\n")}
  </channel>
</rss>
`;
}

export function sitemapXml(notes) {
  const noteItems = publishedNotes(notes);
  const today = formatDay(new Date().toISOString());
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${ORIGIN}/notes/`, lastmod: formatDay(noteItems[0]?.createdAt) || today, changefreq: "weekly", priority: "0.8" },
    { loc: `${ORIGIN}/about/`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    ...noteItems.map((note) => ({
      loc: noteUrl(note),
      lastmod: formatDay(note.updatedAt || note.createdAt) || today,
      changefreq: "monthly",
      priority: "0.7",
    })),
    { loc: `${ORIGIN}/rss/`, lastmod: today, changefreq: "monthly", priority: "0.5" },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
}
