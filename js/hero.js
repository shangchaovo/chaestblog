// Keep the editable headline as the first phrase, and never restart it for counters or health reads.
let headline;
let source = "";
let phrases = [];
let phrase = 0;
let letters = 0;
let deleting = false;
let typed;
let timer = 0;
let started = false;
let visible = true;
let reduce;

const canAnimate = () => started && visible && !document.hidden && !reduce.matches && !document.body.classList.contains("admin");

function schedule(delay = 90) {
  clearTimeout(timer);
  timer = 0;
  if (canAnimate()) timer = setTimeout(type, delay);
}

function type() {
  timer = 0;
  if (!canAnimate()) return;
  const text = Array.from(phrases[phrase]);
  letters += deleting ? -1 : 1;
  typed.textContent = text.slice(0, Math.max(0, letters)).join("");
  headline.classList.toggle("is-typing", letters > 0 && letters < text.length);
  if (!deleting && letters >= text.length) {
    deleting = true;
    schedule(3000);
  } else if (deleting && letters <= 0) {
    deleting = false;
    phrase = (phrase + 1) % phrases.length;
    schedule(260);
  } else schedule(deleting ? 32 : 85);
}

function sync() {
  clearTimeout(timer);
  timer = 0;
  if (!headline || !typed) return;
  headline.classList.toggle("typing-active", canAnimate());
  if (reduce.matches || document.body.classList.contains("admin")) {
    phrase = 0;
    letters = Array.from(source).length;
    deleting = true;
    typed.textContent = source;
  }
  if (canAnimate()) schedule(deleting ? 3000 : 85);
}

export function renderHeroTitle(text) {
  const element = document.getElementById("profileTitle");
  if (!element) return;
  if (headline === element && source === text) {
    // A render with identical content must leave the current phrase and timer alone.
    if (started && document.body.classList.contains("admin")) sync();
    else if (started && !timer) sync();
    return;
  }
  clearTimeout(timer);
  headline = element;
  source = text;
  phrase = 0;
  letters = 0;
  deleting = false;
  if (!started) {
    element.textContent = text;
    return;
  }
  phrases = [...new Set([source, "把灵感写成可以打开的作品", "写代码，做工具，也观察市场"])];
  // Overlay invisible full phrases to reserve their exact wrapped height on every screen size.
  element.replaceChildren();
  const accessible = document.createElement("span");
  accessible.className = "sr-only";
  accessible.textContent = source;
  element.append(accessible);
  for (const value of phrases) {
    const measure = document.createElement("span");
    measure.className = "headline-measure";
    measure.setAttribute("aria-hidden", "true");
    measure.textContent = value;
    element.append(measure);
  }
  const line = document.createElement("span");
  line.className = "headline-live";
  line.setAttribute("aria-hidden", "true");
  typed = document.createElement("span");
  typed.id = "heroTyped";
  typed.textContent = "";
  line.append(typed);
  element.append(line);
  element.classList.add("headline-animated");
  sync();
}

export function initHeroMotion() {
  if (started || !headline || typeof IntersectionObserver === "undefined") return;
  started = true;
  reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const text = source;
  source = "";
  renderHeroTitle(text);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .05 });
  observer.observe(document.getElementById("top"));
  document.addEventListener("visibilitychange", sync);
  reduce.addEventListener("change", sync);
}
