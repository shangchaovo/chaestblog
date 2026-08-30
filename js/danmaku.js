import { api, toast } from "./util.js";

const seen = new Set();
let danmakuVisible = false;

function spawn(item, { instant = false } = {}) {
  if (!item?.id || seen.has(item.id)) return;
  seen.add(item.id);
  const stage = document.getElementById("danmakuStage");
  if (!stage) return;
  const node = document.createElement("div");
  const nick = item.nick ? `${item.nick} · ` : "";
  node.className = "danmaku-item";
  node.textContent = `${nick}${item.text}`;
  node.style.top = `${14 + Math.random() * 56}vh`;
  node.style.animationDuration = `${10 + Math.random() * 8}s`;
  if (instant) node.style.animationDelay = `${-Math.random() * 8}s`;
  stage.append(node);
  node.addEventListener("animationend", () => node.remove());
}

async function pull(instant) {
  if (!danmakuVisible) return;
  try {
    const data = await api("/api/danmaku");
    for (const item of data.items || []) spawn(item, { instant });
  } catch (error) {
    if (instant) toast("招呼暂时发不出去，页面还能看。");
  }
}

export function initDanmaku() {
  const form = document.getElementById("danmakuForm");
  if (!form || form.dataset.danmakuReady === "true") return;
  form.dataset.danmakuReady = "true";
  const toggleDock = document.getElementById("toggleDockBtn");
  const closeDock = document.getElementById("closeDockBtn");
  const toggleView = document.getElementById("toggleDanmakuViewBtn");

  const setDockOpen = (open) => {
    form?.classList.toggle("is-collapsed", !open);
    toggleDock?.setAttribute("aria-expanded", String(open));
    if (open) requestAnimationFrame(() => document.getElementById("danmakuText")?.focus());
  };

  const setDanmakuVisible = (visible) => {
    danmakuVisible = visible;
    document.body.classList.toggle("danmaku-hidden", !visible);
    toggleView?.setAttribute("aria-pressed", String(visible));
    if (toggleView) toggleView.textContent = visible ? "隐藏弹幕" : "显示弹幕";
    try { localStorage.setItem("hubDanmakuVisible", visible ? "1" : "0"); } catch (error) {}
    if (visible) pull(true);
    else document.getElementById("danmakuStage")?.replaceChildren();
  };

  try { danmakuVisible = localStorage.getItem("hubDanmakuVisible") === "1"; } catch (error) {}
  setDanmakuVisible(danmakuVisible);
  toggleDock?.addEventListener("click", () => setDockOpen(true));
  closeDock?.addEventListener("click", () => setDockOpen(false));
  toggleView?.addEventListener("click", () => setDanmakuVisible(!danmakuVisible));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nick = document.getElementById("danmakuNick").value.trim();
    const text = document.getElementById("danmakuText").value.trim();
    if (!text) return;
    try {
      const saved = await api("/api/danmaku", {
        method: "POST",
        body: JSON.stringify({ nick, text }),
      });
      document.getElementById("danmakuText").value = "";
      if (danmakuVisible) spawn(saved.item);
      toast("留言已经送出");
    } catch (error) {
      toast(error.message || "没发出去，稍后再试");
    }
  });
  setInterval(() => pull(false), 8000);
}
