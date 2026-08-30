import { THEMES } from "./util.js";

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
}

export function bindGlassLight() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.addEventListener("pointermove", (event) => {
    const x = Math.round((event.clientX / window.innerWidth) * 100);
    const y = Math.round((event.clientY / window.innerHeight) * 100);
    document.documentElement.style.setProperty("--glass-x", `${x}%`);
    document.documentElement.style.setProperty("--glass-y", `${y}%`);
  }, { passive: true });
}
