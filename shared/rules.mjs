// 校验规则的唯一来源：server.js（本地）和 functions/（线上）都从这里取，
// 不要再在任何地方复制一份。
export const DANMAKU_MAX = 36;
export const NICK_MAX = 12;
export const NOTE_TITLE_MAX = 80;
export const NOTE_BODY_MAX = 4000;
export const NOTE_ARTICLE_MAX = 20000;
export const SECTOR_NAME_MAX = 40;
export const TEXT_MAX = 800;
export const DANMAKU_KEEP = 200;
export const RATE_MS = 8000;

const PROJECT_TINTS = new Set(["violet", "cyan", "amber", "rose", "gold", "blue", "green"]);
const PROJECT_STATUSES = new Set(["live", "hidden"]);
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const BLOCKED = [
  /https?:\/\//i,
  /<script/i,
  /\b(fuck|shit|bitch)\b/i,
  /加微信/,
  /免费领取/,
];

function clip(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

// 正文要留换行，只清掉控制字符和 \r
function cleanRichText(value, max) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function blocked(value) {
  return BLOCKED.some((rule) => rule.test(value));
}

function isoOrEmpty(value) {
  const raw = String(value || "");
  return Number.isNaN(Date.parse(raw)) ? "" : raw;
}

export function safeSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : "";
}

export function assertDanmaku({ nick, text }) {
  const safeNick = clip(nick, NICK_MAX);
  const safeText = clip(text, DANMAKU_MAX);
  if (!safeText) throw Object.assign(new Error("先写点什么再发"), { status: 400 });
  if (blocked(safeText) || blocked(safeNick)) {
    throw Object.assign(new Error("这条发不出去，换个说法试试"), { status: 400 });
  }
  return { nick: safeNick, text: safeText };
}

export function assertNotes(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length > 100) throw Object.assign(new Error("观点太多了"), { status: 400 });
  return {
    updatedAt: new Date().toISOString(),
    items: items.map((item) => {
      const slug = safeSlug(item.slug);
      const article = cleanRichText(item.article, NOTE_ARTICLE_MAX);
      const updatedAt = isoOrEmpty(item.updatedAt);
      return {
        id: clip(item.id, 40) || `n_${Date.now()}`,
        title: cleanText(item.title, NOTE_TITLE_MAX) || "未命名",
        body: cleanText(item.body, NOTE_BODY_MAX),
        createdAt: item.createdAt || new Date().toISOString(),
        ...(slug ? { slug } : {}),
        ...(article ? { article } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      };
    }),
  };
}

export function assertWatchlist(payload) {
  const sectors = Array.isArray(payload?.sectors) ? payload.sectors.slice(0, 20) : [];
  return {
    disclaimer: cleanText(payload?.disclaimer, 200) || "个人记录，不是投资建议。",
    updatedAt: new Date().toISOString(),
    sectors: sectors.map((sector) => ({
      id: clip(sector.id, 40) || `s_${Date.now()}`,
      name: cleanText(sector.name, SECTOR_NAME_MAX) || "未命名板块",
      thesis: cleanText(sector.thesis, TEXT_MAX),
      stocks: Array.isArray(sector.stocks) ? sector.stocks.slice(0, 30).map((stock) => ({
        id: clip(stock.id, 40) || `k_${Date.now()}`,
        symbol: clip(String(stock.symbol || "").toUpperCase(), 12),
        name: cleanText(stock.name, 40),
        reason: cleanText(stock.reason, TEXT_MAX),
      })) : [],
    })),
  };
}

export function assertNow(payload) {
  return {
    text: cleanText(payload?.text, 80),
    updatedAt: new Date().toISOString(),
  };
}

function safeHttpUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch (error) {
    return "";
  }
}

function safeShot(value) {
  const shot = String(value || "").trim().replace(/^\/+/, "");
  if (/^assets\/shots\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(shot)) return shot;
  if (/^api\/project-shot\/[a-z0-9-]{1,60}$/i.test(shot)) return shot;
  return "";
}

export function assertProjects(payload) {
  const projects = Array.isArray(payload?.projects) ? payload.projects.slice(0, 30) : [];
  return projects.map((project, index) => {
    const rawId = String(project.id || "").trim().toLowerCase();
    const id = /^[a-z0-9-]{1,60}$/.test(rawId) ? rawId : `project-${Date.now()}-${index}`;
    const github = safeHttpUrl(project.github);
    const updatedAt = isoOrEmpty(project.updatedAt);
    return {
      id,
      icon: /^[a-z0-9-]{1,30}$/i.test(project.icon || "") ? project.icon : "chart",
      tint: PROJECT_TINTS.has(project.tint) ? project.tint : "blue",
      name: cleanText(project.name, 60) || "未命名项目",
      tag: cleanText(project.tag, 24) || "项目",
      summary: cleanText(project.summary, 500),
      live: safeHttpUrl(project.live),
      ...(github ? { github } : {}),
      ...(project.githubPublic === false ? { githubPublic: false } : {}),
      shot: safeShot(project.shot),
      status: PROJECT_STATUSES.has(project.status) ? project.status : "live",
      ...(updatedAt ? { updatedAt } : {}),
    };
  });
}

export function assertProjectShot(payload) {
  const projectId = String(payload?.projectId || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(projectId)) {
    throw Object.assign(new Error("项目 ID 不正确"), { status: 400 });
  }
  const match = String(payload?.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw Object.assign(new Error("只支持 JPG、PNG 或 WebP 截图"), { status: 400 });
  if (match[2].length > 2_800_000) throw Object.assign(new Error("截图不能超过 2 MB"), { status: 413 });
  return { projectId, mime: match[1].toLowerCase(), base64: match[2] };
}
