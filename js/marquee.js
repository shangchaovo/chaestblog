// Steer the compositor's existing CSS animation. Only rate transitions need a JS frame loop.
let started = false;
let track;
let board;
let controls;
let animation;
let reduce;
let visible = false;
let rate = 1;
let target = 1;
let frame = 0;
let previous = 0;
const held = new Map();
const buttons = [];

function enabled() {
  return visible && !document.hidden && !reduce.matches && document.body.classList.contains("marquee-on") && !document.body.classList.contains("admin");
}

function paint() {
  animation?.updatePlaybackRate(rate);
  const value = document.getElementById("marqueeSpeedValue");
  if (value) value.textContent = `${rate.toFixed(2)}×`;
}

function step(time) {
  frame = 0;
  const dt = Math.min(time - previous, 64);
  previous = time;
  rate += (target - rate) * (1 - Math.exp(-dt / 160));
  if (Math.abs(target - rate) < .004) rate = target;
  paint();
  if (rate !== target && enabled()) frame = requestAnimationFrame(step);
}

function steer() {
  const directions = [...held.values()];
  const direction = Number(directions.includes("ArrowRight")) - Number(directions.includes("ArrowLeft"));
  target = direction > 0 ? 3 : direction < 0 ? .25 : 1;
  document.body.classList.toggle("marquee-steering", held.size > 0);
  controls.dataset.direction = direction > 0 ? "fast" : direction < 0 ? "slow" : "natural";
  for (const button of buttons) button.classList.toggle("is-held", directions.includes(button.dataset.marqueeKey));
  if (!frame && enabled()) {
    previous = performance.now();
    frame = requestAnimationFrame(step);
  }
}

function release() {
  held.clear();
  steer();
  // A background tab or an offscreen section must not retain keys or an idle rAF loop.
  if (!enabled()) {
    cancelAnimationFrame(frame);
    frame = 0;
    rate = target = 1;
    paint();
  }
}

function maySteer(event) {
  return enabled() && !document.body.classList.contains("marquee-paused") && !event.defaultPrevented &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    !event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider']") &&
    !document.querySelector("dialog[open], .nav-more[open]");
}

export function refreshMarquee() {
  if (!started) return;
  animation = track.getAnimations().find((item) => item.animationName === "board-marquee");
  controls.hidden = !animation || reduce.matches || document.body.classList.contains("admin");
  if (controls.hidden) release();
  else paint();
}

export function initMarquee() {
  track = document.getElementById("siteGrid");
  board = document.getElementById("boardMarquee");
  controls = document.getElementById("marqueeControls");
  if (started || !track?.getAnimations || !board || !controls || typeof IntersectionObserver === "undefined") return;
  started = true;
  reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  buttons.push(...controls.querySelectorAll("[data-marquee-key]"));
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) release();
  }, { threshold: .08 });
  observer.observe(board);
  document.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !maySteer(event)) return;
    event.preventDefault();
    if (!held.has(event.key)) { held.set(event.key, event.key); steer(); }
  });
  document.addEventListener("keyup", (event) => {
    if (held.delete(event.key)) steer();
  });
  for (const button of buttons) {
    button.addEventListener("keydown", (event) => {
      if (![" ", "Enter"].includes(event.key) || !maySteer(event)) return;
      event.preventDefault();
      held.set(`button:${event.key}`, button.dataset.marqueeKey);
      steer();
    });
    button.addEventListener("keyup", (event) => {
      if (held.delete(`button:${event.key}`)) steer();
    });
    button.addEventListener("blur", release);
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !maySteer(event)) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      held.set(`pointer:${event.pointerId}`, button.dataset.marqueeKey);
      steer();
    });
    const lift = (event) => { if (held.delete(`pointer:${event.pointerId}`)) steer(); };
    button.addEventListener("pointerup", lift);
    button.addEventListener("pointercancel", lift);
    button.addEventListener("lostpointercapture", lift);
  }
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", release);
  reduce.addEventListener("change", refreshMarquee);
  refreshMarquee();
}
