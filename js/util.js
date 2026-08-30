export const THEMES = ["liquid", "eye", "ink"];

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function toast(message) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const node = document.createElement("div");
  node.className = "toast glass";
  node.textContent = message;
  host.append(node);
  setTimeout(() => node.remove(), 3200);
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { error: text.slice(0, 180) };
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `请求失败 ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function formatDay(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function icon(name, cls = "ic") {
  const fill = name === "github" ? " ic-fill" : "";
  return `<svg class="${cls}${fill}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function appIcon(name, size = 40) {
  const safe = /^[a-z0-9-]+$/i.test(name || "") ? name : "github";
  return `<img class="app-icon" src="/assets/icons/${safe}.svg" alt="" width="${size}" height="${size}">`;
}

export function shotImg(src, alt = "项目页面截图") {
  if (!src || !/^(assets\/shots\/[a-z0-9-]+\.(jpg|jpeg|png|webp)|api\/project-shot\/[a-z0-9-]{1,60})$/i.test(src)) return "";
  const img = `<img src="/${esc(src)}" alt="${esc(alt)}" width="1280" height="800" loading="lazy" decoding="async">`;
  // 仓库里的截图都有 scripts/make-webp.py 生成的同名 WebP；工作台上传的走接口，没有
  const webp = src.replace(/\.(jpe?g|png)$/i, ".webp");
  if (webp === src) return img;
  return `<picture><source type="image/webp" srcset="/${esc(webp)}">${img}</picture>`;
}
