import { THEMES } from "./util.js?v=2026102701";

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

let themeAnimation;

export function bindThemeSwitch() {
  applyTheme(document.documentElement.dataset.theme || "liquid", false);
  document.querySelector(".theme-switch")?.addEventListener("click", (event) => {
    const button = event.target.closest(".theme-btn");
    if (!button) return;
    const theme = button.dataset.theme;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const content = document.querySelector("main");
    const opacity = themeAnimation && content ? Number(getComputedStyle(content).opacity) : .78;
    themeAnimation?.cancel();
    applyTheme(theme, true);
    // Animate the live content: snapshots freeze hit testing during a theme switch.
    if (!reduce && content?.animate) {
      themeAnimation = content.animate([{ opacity }, { opacity: 1 }], {
        duration: 420, easing: "cubic-bezier(.2,.7,.2,1)",
      });
      const animation = themeAnimation;
      animation.finished.then(() => {
        if (themeAnimation === animation) themeAnimation = null;
      }).catch(() => {});
    }
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
