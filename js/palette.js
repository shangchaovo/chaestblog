import { esc } from "./util.js";
import { getState } from "./app.js";
import { applyTheme } from "./theme.js";

const MAX_RESULTS = 12;

// 子序列匹配：输入的字符按顺序出现即可命中，连续命中给更高分
function score(haystack, needle) {
  if (!needle) return 1;
  const text = haystack.toLowerCase();
  const query = needle.toLowerCase();
  if (text.includes(query)) return 1000 - text.indexOf(query);
  let at = 0;
  let points = 0;
  let streak = 0;
  for (const char of query) {
    const found = text.indexOf(char, at);
    if (found < 0) return 0;
    streak = found === at ? streak + 1 : 0;
    points += 1 + streak;
    at = found + 1;
  }
  return points;
}

function commands() {
  const state = getState();
  const out = [];
  for (const project of state.site?.projects || []) {
    if (project.status !== "live" || !project.live) continue;
    out.push({
      group: "站点",
      title: project.name,
      hint: project.tag,
      keys: `${project.name} ${project.tag} ${project.summary}`,
      run: () => window.open(project.live, "_blank", "noopener"),
    });
  }
  for (const note of state.notes?.items || []) {
    out.push({
      group: "观点",
      title: note.title,
      hint: note.slug ? "全文" : "首页",
      keys: `${note.title} ${note.body}`,
      run: () => {
        location.href = note.slug ? `/notes/${note.slug}/` : "/#notes";
      },
    });
  }
  for (const sector of state.watchlist?.sectors || []) {
    out.push({
      group: "关注",
      title: sector.name,
      hint: `${(sector.stocks || []).length} 只`,
      keys: `${sector.name} ${sector.thesis} ${(sector.stocks || []).map((stock) => `${stock.symbol} ${stock.name}`).join(" ")}`,
      run: () => {
        location.hash = "#watch";
      },
    });
  }
  const jumps = [
    ["全部观点", "/notes/", "归档"],
    ["关于我", "/about/", "页面"],
    ["RSS 订阅", "/rss.xml", "订阅"],
  ];
  for (const [title, href, hint] of jumps) {
    out.push({ group: "导航", title, hint, keys: title, run: () => { location.href = href; } });
  }
  for (const [theme, title] of [["liquid", "玻璃主题"], ["eye", "护眼主题"], ["ink", "墨夜主题"]]) {
    out.push({
      group: "外观",
      title,
      hint: "切换",
      keys: `${title} theme ${theme}`,
      run: () => applyTheme(theme, true),
    });
  }
  return out;
}

let items = [];
let active = 0;

function box() {
  return document.getElementById("paletteDialog");
}

function paint(query) {
  const all = commands();
  items = (query
    ? all.map((item) => ({ item, points: score(item.keys, query) })).filter((row) => row.points > 0)
        .sort((a, b) => b.points - a.points).map((row) => row.item)
    : all
  ).slice(0, MAX_RESULTS);
  active = 0;
  const list = document.getElementById("paletteList");
  list.innerHTML = items.length
    ? items.map((item, index) => `
      <li>
        <button class="palette-item" type="button" role="option" id="palette-opt-${index}" data-index="${index}" aria-selected="${index === 0}">
          <span class="palette-group">${esc(item.group)}</span>
          <span class="palette-title">${esc(item.title)}</span>
          <span class="palette-hint">${esc(item.hint || "")}</span>
        </button>
      </li>`).join("")
    : `<li class="palette-empty">没找到「${esc(query)}」</li>`;
  syncActive();
}

function syncActive() {
  const buttons = document.querySelectorAll(".palette-item");
  buttons.forEach((button, index) => {
    const on = index === active;
    button.setAttribute("aria-selected", String(on));
    button.classList.toggle("is-active", on);
    if (on) button.scrollIntoView({ block: "nearest" });
  });
  const input = document.getElementById("paletteInput");
  if (input) input.setAttribute("aria-activedescendant", buttons.length ? `palette-opt-${active}` : "");
}

function open() {
  const dialog = box();
  if (!dialog || dialog.open) return;
  const input = document.getElementById("paletteInput");
  input.value = "";
  paint("");
  dialog.showModal();
  input.focus();
}

function pick(index) {
  const item = items[index];
  if (!item) return;
  box().close();
  item.run();
}

export function initPalette() {
  const dialog = box();
  if (!dialog || dialog.dataset.ready === "true") return;
  dialog.dataset.ready = "true";
  const input = document.getElementById("paletteInput");

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
      return;
    }
    // 没在输入框里时，斜杠也能唤出来
    if (event.key === "/" && !dialog.open && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
      event.preventDefault();
      open();
    }
  });

  document.getElementById("openPaletteBtn")?.addEventListener("click", open);
  input?.addEventListener("input", () => paint(input.value.trim()));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      active = (active + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      syncActive();
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    }
  });
  document.getElementById("paletteList")?.addEventListener("click", (event) => {
    const button = event.target.closest(".palette-item");
    if (button) pick(Number(button.dataset.index));
  });
  document.getElementById("paletteClose")?.addEventListener("click", () => dialog.close());

  const trigger = document.getElementById("openPaletteBtn");
  if (trigger) {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    trigger.querySelector(".palette-key").textContent = mac ? "⌘K" : "Ctrl K";
    trigger.hidden = false;
  }
}
