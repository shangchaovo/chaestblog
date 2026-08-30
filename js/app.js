import { esc, toast, api, formatDay, icon, appIcon, shotImg } from "./util.js";
import { bindThemeSwitch, bindGlassLight } from "./theme.js";
import { initAdmin } from "./admin.js";
import { initDanmaku } from "./danmaku.js";
import { initPalette } from "./palette.js";

const RESEARCH = "https://fresearch.cc.cd/";

const state = {
  site: null,
  notes: { items: [] },
  watchlist: { sectors: [], disclaimer: "" },
  now: { text: "" },
  admin: false,
  health: null,
  hits: null,
};

export function getState() {
  return state;
}

export function setAdmin(on) {
  state.admin = Boolean(on);
  document.body.classList.toggle("admin", state.admin);
  const button = document.getElementById("openAdminBtn");
  if (button) {
    button.classList.toggle("is-active", state.admin);
    button.querySelector("span").textContent = state.admin ? "编辑中" : "管理";
    button.setAttribute("aria-label", state.admin ? "当前已进入编辑模式" : "打开管理入口");
  }
  if (state.site) render();
}

export function setContent({ site, notes, watchlist, now }) {
  if (site) state.site = site;
  if (notes) state.notes = notes;
  if (watchlist) state.watchlist = watchlist;
  if (now) state.now = now;
}

function noteHref(item) {
  return item?.slug ? `/notes/${encodeURIComponent(item.slug)}/` : "#notes";
}

function liveProjects() {
  return (state.site.projects || []).filter((item) => item.status === "live" && item.live);
}

function visibleProjects() {
  return state.admin ? (state.site.projects || []) : liveProjects();
}

function setSectionVisible(id, on) {
  const section = document.getElementById(id)?.closest(".section");
  if (section) section.hidden = !on;
}

function renderHero() {
  const profile = state.site.profile;
  const projects = liveProjects();
  document.getElementById("profileKicker").innerHTML = `${icon("spark")} ${esc(profile.kicker)}`;
  document.getElementById("profileName").textContent = profile.name;
  document.getElementById("profileTitle").textContent = profile.title;
  document.getElementById("profileBio").textContent = profile.bio;
  const github = state.site.socials.find((item) => item.id === "github");
  const mail = state.site.socials.find((item) => item.id === "email");
  const coffee = state.site.socials.find((item) => item.id === "bmc");
  const twitter = state.site.socials.find((item) => item.id === "x");
  document.getElementById("heroActions").innerHTML = [
    coffee?.href ? `<a class="btn primary" href="${esc(coffee.href)}" target="_blank" rel="noopener">${appIcon("coffee", 22)} 请我喝杯咖啡</a>` : "",
    github?.href ? `<a class="btn" rel="me noopener" href="${esc(github.href)}" target="_blank">${appIcon("github", 22)} GitHub</a>` : "",
    twitter?.href ? `<a class="btn" rel="me noopener" href="${esc(twitter.href)}" target="_blank">${appIcon("x", 22)} X</a>` : "",
    mail?.href ? `<a class="btn" href="${esc(mail.href)}">${appIcon("mail", 22)} 写信</a>` : "",
  ].join("");
  const nowText = state.now?.text || "";
  const nowBox = document.getElementById("profileNow");
  if (nowBox) {
    nowBox.hidden = !nowText && !state.admin;
    const label = nowBox.querySelector(".now-text");
    if (label) label.textContent = nowText || "写一句最近在做的事";
  }
  const noteCount = (state.notes.items || []).length;
  const stockCount = (state.watchlist.sectors || []).reduce((sum, sector) => sum + (sector.stocks || []).length, 0);
  const visits = Number(state.hits?.total || 0);
  document.getElementById("statRow").innerHTML = `
    <div class="stat"><b>${projects.length}</b><span>在线站点</span></div>
    <div class="stat"><b>${noteCount}</b><span>条观点</span></div>
    <div class="stat"><b>${stockCount}</b><span>只在盯</span></div>
    ${visits ? `<div class="stat"><b>${visits.toLocaleString("zh-CN")}</b><span>次到访</span></div>` : ""}
  `;
}

function siteCardHtml(item, clone) {
  // clone=true 的是跑马灯里用于无缝拼接的副本:对读屏隐藏、不进 Tab 序
  const tab = clone ? ' tabindex="-1"' : "";
  const hidden = clone ? ' aria-hidden="true"' : "";
  const github = item.github && item.githubPublic !== false
    ? `<a class="btn" href="${esc(item.github)}" target="_blank" rel="noopener"${tab}>${appIcon("github", 18)} GitHub</a>`
    : "";
  return `
    <article class="card glass" data-id="${esc(item.id)}" data-tint="${esc(item.tint || "blue")}"${hidden}>
      ${item.shot && item.live ? `<a class="shot" href="${esc(item.live)}" target="_blank" rel="noopener"${tab}>${shotImg(item.shot, `${item.name} 页面截图`)}</a>` : ""}
      <div class="card-top">
        <span class="well app">${appIcon(item.icon || "book", 46)}</span>
        <span class="pill ${item.status === "live" ? "live" : "degraded"}"${item.status === "live" ? ` data-health="${esc(item.id)}"` : ""}>
          <i class="live-dot" aria-hidden="true"></i>
          <span class="pill-label">${item.status === "live" ? "在线" : "已隐藏"}</span>
        </span>
      </div>
      <div>
        <span class="pill">${esc(item.tag)}</span>
        <h3>${esc(item.name)}</h3>
      </div>
      <p>${esc(item.summary)}</p>
      ${item.updatedAt ? `<p class="project-updated">更新于 ${esc(formatDay(item.updatedAt))}</p>` : ""}
      <div class="card-links">
        ${item.live ? `<a class="btn primary" href="${esc(item.live)}" target="_blank" rel="noopener"${tab}>${icon("arrow")} 打开</a>` : ""}
        ${github}
      </div>
      <div class="row-actions project-actions">
        <button class="btn" type="button" data-edit-project="${esc(item.id)}"${tab}>${icon("edit")} 改项目</button>
        <button class="btn" type="button" data-move-project="${esc(item.id)}:-1" aria-label="向前移动"${tab}>↑</button>
        <button class="btn" type="button" data-move-project="${esc(item.id)}:1" aria-label="向后移动"${tab}>↓</button>
        <button class="btn danger" type="button" data-del-project="${esc(item.id)}"${tab}>${icon("trash")} 删除</button>
      </div>
    </article>`;
}

function renderSites() {
  const items = visibleProjects();
  setSectionVisible("siteGrid", items.length > 0);
  const track = document.getElementById("siteGrid");
  if (!track) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 卡片够多才横滚;管理态(要用编辑按钮)/减少动态 退回普通 grid
  const wantMarquee = !state.admin && !reduceMotion && items.length >= 4;
  const build = (clone) => items.map((item) => siteCardHtml(item, clone)).join("");
  // 无缝循环的关键:轨道里放两组相同卡片,动画平移 -50% 正好一整组
  track.innerHTML = wantMarquee ? build(false) + build(true) : build(false);
  document.body.classList.toggle("marquee-on", wantMarquee);
  if (wantMarquee) {
    // 按轨道半宽换算时长,保持滚动速度恒定(约 65px/s)
    requestAnimationFrame(() => {
      const half = track.scrollWidth / 2;
      const dur = Math.min(90, Math.max(22, Math.round(half / 65)));
      track.style.setProperty("--board-dur", `${dur}s`);
    });
  } else {
    track.style.removeProperty("--board-dur");
  }
}

function renderNotes() {
  const items = state.notes.items || [];
  document.getElementById("noteList").innerHTML = items.length ? items.map((item) => `
    <article class="note glass" data-id="${esc(item.id)}">
      <time>${icon("feather")} ${esc(formatDay(item.createdAt))}</time>
      <h3>${item.slug ? `<a href="${esc(noteHref(item))}">${esc(item.title)}</a>` : esc(item.title)}</h3>
      <p>${esc(item.body)}</p>
      ${item.slug ? `<p class="note-more"><a href="${esc(noteHref(item))}">阅读全文</a></p>` : ""}
      <div class="note-actions">
        <button class="btn" type="button" data-edit-note="${esc(item.id)}">${icon("edit")} 改</button>
        <button class="btn danger" type="button" data-del-note="${esc(item.id)}">${icon("trash")} 删</button>
      </div>
    </article>
  `).join("") : `<div class="empty glass">${appIcon("notes", 48)}<span>最近没什么想写的。</span></div>`;
}

function renderWatch() {
  const sectors = state.watchlist.sectors || [];
  document.getElementById("watchDisclaimer").textContent = state.watchlist.disclaimer || "";
  document.getElementById("watchList").innerHTML = sectors.length ? sectors.map((sector) => `
    <article class="sector glass" data-id="${esc(sector.id)}" data-tint="amber">
      <div class="card-top">
        <span class="well app">${appIcon("watch", 48)}</span>
        <span class="pill">${esc((sector.stocks || []).length)} 只</span>
      </div>
      <h3>${esc(sector.name)}</h3>
      <p>${esc(sector.thesis)}</p>
      <div class="row-actions">
        <button class="btn" type="button" data-edit-sector="${esc(sector.id)}">${icon("edit")} 改板块</button>
        <button class="btn danger" type="button" data-del-sector="${esc(sector.id)}">${icon("trash")} 删板块</button>
      </div>
      <div class="stocks">
        ${(sector.stocks || []).map((stock) => `
          <div class="stock" data-id="${esc(stock.id)}">
            <div class="stock-head">
              <span class="symbol"><a href="${esc(RESEARCH)}" target="_blank" rel="noopener">${esc(stock.symbol)}</a></span>
              <strong>${esc(stock.name)}</strong>
              <div class="row-actions">
                <button class="btn" type="button" data-edit-stock="${esc(sector.id)}:${esc(stock.id)}">${icon("edit")}</button>
                <button class="btn danger" type="button" data-del-stock="${esc(sector.id)}:${esc(stock.id)}">${icon("trash")}</button>
              </div>
            </div>
            <p>${esc(stock.reason)}</p>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("") : `<div class="empty glass">${appIcon("watch", 48)}<span>这阵子没盯什么票。</span></div>`;
}

function renderContact() {
  const items = (state.site.socials || []).filter((item) => item.kind !== "soon" && item.href);
  if (!items.some((item) => item.id === "rss")) {
    items.push({ id: "rss", icon: "rss", label: "RSS 订阅", handle: "关注最新博文", href: "/rss/" });
  }
  document.getElementById("contactGrid").innerHTML = items.map((item) => `
    <a class="contact glass" href="${esc(item.href)}" ${item.href.startsWith("mailto:") ? "" : `target="_blank" rel="${item.id === "github" || item.id === "x" ? "me noopener" : "noopener"}"`}>
      <span class="well app">${appIcon(item.icon || "mail", 56)}</span>
      <small>${esc(item.label)}</small>
      <strong>${esc(item.handle || item.label)}</strong>
    </a>
  `).join("");
}

// 探活结果只改状态标签，不重渲染卡片，否则跑马灯动画会从头开始
function applyHealth() {
  for (const check of state.health?.checks || []) {
    const label = check.ok
      ? `在线${check.ms ? ` · ${check.ms}ms` : ""}`
      : check.status ? `异常 ${check.status}` : "连不上";
    const title = check.ok
      ? `最近一次探测 ${check.ms}ms（${formatDay(state.health.checkedAt)}）`
      : `最近一次探测没连上（${check.status ? `HTTP ${check.status}` : "超时"}）`;
    for (const pill of document.querySelectorAll(`[data-health="${CSS.escape(check.id)}"]`)) {
      pill.classList.toggle("live", check.ok);
      pill.classList.toggle("degraded", !check.ok);
      pill.title = title;
      const text = pill.querySelector(".pill-label");
      if (text) text.textContent = label;
    }
  }
}

export function render() {
  if (!state.site) return;
  renderHero();
  renderSites();
  renderNotes();
  renderWatch();
  renderContact();
  applyHealth();
}

async function loadStaticSeed() {
  const [site, notes, watchlist, now] = await Promise.all([
    fetch("/data/site.json").then((res) => res.json()),
    fetch("/data/notes.json").then((res) => res.json()),
    fetch("/data/watchlist.json").then((res) => res.json()),
    fetch("/data/now.json").then((res) => res.json()).catch(() => ({ text: "" })),
  ]);
  return { site, notes, watchlist, now };
}

async function loadContent() {
  try {
    setContent(await api("/api/content"));
  } catch (error) {
    setContent(await loadStaticSeed());
    toast("内容接口暂不可用，已显示仓库里的种子稿。");
  }
}

// 一次会话只上报一笔，KV 的写配额扛得住
async function countVisit() {
  let counted = false;
  try {
    counted = sessionStorage.getItem("hubCounted") === "1";
  } catch (error) {}
  const hits = await api("/api/hit", { method: counted ? "GET" : "POST" });
  if (!counted) {
    try { sessionStorage.setItem("hubCounted", "1"); } catch (error) {}
  }
  state.hits = hits;
  renderHero();
}

async function loadHealth() {
  state.health = await api("/api/health");
  applyHealth();
}

async function boot() {
  bindThemeSwitch();
  bindGlassLight();
  await loadContent();
  render();
  try {
    const session = await api("/api/session");
    setAdmin(Boolean(session.admin));
  } catch (error) {
    setAdmin(false);
  }
  initAdmin();
  initDanmaku();
  initPalette();
  // 这两个都是装饰性的，失败就安静地保持静态兜底
  loadHealth().catch(() => {});
  countVisit().catch(() => {});
}

boot().catch((error) => toast(error.message || "页面启动失败"));
