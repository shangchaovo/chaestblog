import { THEMES } from "./util.js?v=20260922b";

export function applyTheme(theme, persist) {
  const next = THEMES.includes(theme) ? theme : "liquid";
  document.documentElement.dataset.theme = next;
  if (persist) {
    try { localStorage.setItem("hubTheme", next); } catch (error) {}
  }
  for (const button of document.querySelectorAll(".theme-btn")) {
    button.setAttribute("aria-pressed", String(button.dataset.theme === next));
  }
}

export function bindThemeSwitch() {
  applyTheme(document.documentElement.dataset.theme || "liquid", false);
  document.querySelector(".theme-switch")?.addEventListener("click", (event) => {
    const button = event.target.closest(".theme-btn");
    if (!button) return;
    applyTheme(button.dataset.theme, true);
  });
  const menu = document.querySelector(".nav-more");
  if (!menu) return;
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) || event.target.closest(".theme-btn, .admin-entry")) {
      menu.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
}

export function bindGlassLight() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  let targetX = 28;
  let targetY = 16;
  let x = 28;
  let y = 16;
  let frame = 0;
  let lit = null;

  const paint = () => {
    x += (targetX - x) * 0.06;
    y += (targetY - y) * 0.06;
    root.style.setProperty("--glass-x", `${x.toFixed(1)}%`);
    root.style.setProperty("--glass-y", `${y.toFixed(1)}%`);
    const angle = Math.atan2(x - 50, 50 - y) * (180 / Math.PI);
    root.style.setProperty("--glass-angle", `${angle.toFixed(1)}deg`);
    frame = Math.hypot(targetX - x, targetY - y) > 0.15 ? requestAnimationFrame(paint) : 0;
  };

  window.addEventListener("pointermove", (event) => {
    targetX = (event.clientX / window.innerWidth) * 100;
    targetY = (event.clientY / window.innerHeight) * 100;
    const next = event.target?.closest?.(".glass") || null;
    if (lit && lit !== next) {
      lit.style.removeProperty("--spot-x");
      lit.style.removeProperty("--spot-y");
    }
    if (next) {
      const rect = next.getBoundingClientRect();
      const spotX = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
      const spotY = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
      next.style.setProperty("--spot-x", `${Math.min(100, Math.max(0, spotX)).toFixed(1)}%`);
      next.style.setProperty("--spot-y", `${Math.min(100, Math.max(0, spotY)).toFixed(1)}%`);
    }
    lit = next;
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });

  window.addEventListener("pointerleave", () => {
    targetX = 28;
    targetY = 16;
    if (lit) {
      lit.style.removeProperty("--spot-x");
      lit.style.removeProperty("--spot-y");
      lit = null;
    }
    if (!frame) frame = requestAnimationFrame(paint);
  });
}
