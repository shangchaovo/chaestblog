import { initHeroMotion } from "./hero.js?v=2026102001";

// A shared, event-driven spring loop. Idle pages use CSS/WAAPI, not a JS ticker.
let started = false;
let revealObserver;
let visibilityObserver;
const observed = new WeakSet();
const revealed = new WeakSet();
const revealAnimations = new Set();
const moving = new Set();
const springs = new WeakMap();
let frame = 0;
let previousTime = 0;
let reduce;
let fine;
let hovered;
let magnet;
let sceneSpring;
let sceneElement;
let sceneBounds;
let indicator;
let indicatorSpring;
let progress;
let scrollFrame = 0;

function wake(spring) {
  moving.add(spring);
  if (!frame && !document.hidden && !reduce.matches) {
    previousTime = performance.now();
    frame = requestAnimationFrame(step);
  }
}

function springFor(element, size, paint, speed = 20) {
  let spring = springs.get(element);
  if (!spring) {
    spring = { element, value: Array(size).fill(0), target: Array(size).fill(0), velocity: Array(size).fill(0), paint, speed };
    springs.set(element, spring);
  }
  return spring;
}

function step(time) {
  frame = 0;
  const dt = Math.min((time - previousTime) / 1000, .034);
  previousTime = time;
  for (const spring of moving) {
    if (!spring.element.isConnected) { moving.delete(spring); continue; }
    let settled = true;
    const decay = Math.exp(-spring.speed * dt);
    for (let i = 0; i < spring.value.length; i++) {
      const difference = spring.value[i] - spring.target[i];
      const c = spring.velocity[i] + spring.speed * difference;
      spring.value[i] = spring.target[i] + (difference + c * dt) * decay;
      spring.velocity[i] = (spring.velocity[i] - spring.speed * c * dt) * decay;
      if (Math.abs(spring.value[i] - spring.target[i]) > .01 || Math.abs(spring.velocity[i]) > .02) settled = false;
    }
    if (settled) {
      spring.value = [...spring.target];
      spring.velocity.fill(0);
      moving.delete(spring);
    }
    spring.paint(spring.value);
  }
  if (moving.size && !document.hidden && !reduce.matches) frame = requestAnimationFrame(step);
}

function reset(spring) {
  if (!spring) return;
  spring.target.fill(0);
  wake(spring);
}

function leaveSurface() {
  if (!hovered) return;
  hovered.element.classList.remove("is-pointed");
  reset(hovered.tilt);
  hovered = null;
}

function followSurface(element, event) {
  if (hovered?.element !== element) {
    leaveSurface();
    let sheen = element.querySelector(":scope > .glass-sheen");
    if (!sheen) {
      sheen = document.createElement("span");
      sheen.className = "glass-sheen";
      sheen.setAttribute("aria-hidden", "true");
      element.append(sheen);
    }
    const light = springFor(sheen, 2, ([x,y]) => { sheen.style.transform = `translate3d(${x - 190}px,${y - 190}px,0)`; }, 24);
    const tilt = springFor(element, 2, ([x,y]) => {
      element.style.transform = Math.abs(x) + Math.abs(y) < .001 ? "" : `perspective(900px) rotateX(${y}deg) rotateY(${x}deg)`;
    });
    hovered = { element, bounds: element.getBoundingClientRect(), light, tilt };
    const x = event.clientX - hovered.bounds.left;
    const y = event.clientY - hovered.bounds.top;
    light.value = [x,y];
    element.classList.add("is-pointed");
  }
  const { bounds, light, tilt } = hovered;
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  light.target = [x,y];
  tilt.target = [(x / bounds.width - .5) * 5, (.5 - y / bounds.height) * 4];
  wake(light);
  wake(tilt);
}

function movePointer(event) {
  if (reduce.matches || !fine.matches || event.pointerType === "touch" || document.body.classList.contains("admin")) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const surface = target.closest(".card, .note, .sector, .contact, .scene-chip, .avatar-frame, .rss-entry, .archive-item");
  if (surface) followSurface(surface, event); else leaveSurface();

  const button = target.closest(".hero-actions .btn, .hero-link, .marquee-toggle, .palette-entry, .dock-toggle");
  if (magnet?.element !== button) {
    reset(magnet?.spring);
    magnet = button ? { element: button, bounds: button.getBoundingClientRect(), spring: springFor(button, 2, ([x,y]) => {
      button.style.transform = Math.abs(x) + Math.abs(y) < .001 ? "" : `translate3d(${x}px,${y}px,0)`;
    }, 24) } : null;
  }
  if (magnet) {
    magnet.spring.target = [(event.clientX - magnet.bounds.left - magnet.bounds.width / 2) * .12, (event.clientY - magnet.bounds.top - magnet.bounds.height / 2) * .18];
    wake(magnet.spring);
  }

  if (sceneSpring && target.closest(".liquid-scene")) {
    const bounds = sceneBounds || (sceneBounds = sceneElement.getBoundingClientRect());
    sceneSpring.target = [(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 12, (bounds.top + bounds.height / 2 - event.clientY) / bounds.height * 10];
    wake(sceneSpring);
  } else reset(sceneSpring);

  const link = target.closest(".nav-links a");
  if (link && indicator) {
    indicator.style.opacity = "1";
    const width = link.offsetWidth;
    if (!indicatorSpring) {
      indicatorSpring = springFor(indicator, 2, ([x,w]) => { indicator.style.transform = `translate3d(${x}px,0,0) scaleX(${w})`; }, 25);
      indicator.style.width = "1px";
      indicator.style.transformOrigin = "left";
      indicatorSpring.value = [link.offsetLeft, width];
    }
    indicatorSpring.target = [link.offsetLeft, width];
    wake(indicatorSpring);
  } else if (indicator) indicator.style.opacity = "0";
}

function clearPointer() {
  leaveSurface();
  reset(magnet?.spring);
  magnet = null;
  reset(sceneSpring);
  sceneBounds = null;
  if (indicator) indicator.style.opacity = "0";
}

function reveal(entries) {
  let stagger = 0;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const node = entry.target;
    revealObserver.unobserve(node);
    if (reduce.matches || revealed.has(node)) continue;
    revealed.add(node);
    const animation = node.animate([
      { opacity: 0, transform: "translate3d(0,28px,0) scale(.98)" },
      { opacity: 1, transform: "none" },
    ], { duration: 800, delay: Math.min(stagger++ * 65, 195), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
    revealAnimations.add(animation);
    animation.finished.finally(() => revealAnimations.delete(animation)).catch(() => {});
  }
}

export function refreshMotion() {
  if (!started) return;
  // Retire detached admin/content renders without keeping old nodes alive.
  for (const item of moving) if (!item.element.isConnected) moving.delete(item);
  document.querySelectorAll(".section-head, .board-marquee, .repo-card, .note, .sector, .contact, .archive-note, .rss-entry").forEach((node) => {
    if (!observed.has(node)) {
      observed.add(node);
      revealObserver.observe(node);
      if (node.matches(".board-marquee")) visibilityObserver.observe(node);
    }
  });
}

function syncPreference() {
  clearPointer();
  if (reduce.matches) {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const item of moving) {
      item.value.fill(0);
      item.velocity.fill(0);
      item.target.fill(0);
      item.paint(item.value);
    }
    moving.clear();
    for (const animation of revealAnimations) animation.cancel();
    document.documentElement.classList.remove("hero-enter");
    if (sceneElement) sceneElement.style.translate = "";
  }
}

export function initMotion() {
  // Content stays fully usable when enhancement APIs are unavailable.
  if (started || typeof IntersectionObserver === "undefined" || typeof Element === "undefined" || !Element.prototype.animate) return;
  started = true;
  initHeroMotion();
  reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  revealObserver = new IntersectionObserver(reveal, { threshold: .08 });
  visibilityObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) target.classList.toggle("is-offscreen", !isIntersecting);
  }, { rootMargin: "80px" });
  sceneElement = document.querySelector(".liquid-scene");
  if (sceneElement) {
    const layer = sceneElement.querySelector(".scene-parallax");
    sceneSpring = springFor(layer, 2, ([x,y]) => { layer.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`; }, 14);
    visibilityObserver.observe(sceneElement);
    if (!reduce.matches) document.documentElement.classList.add("hero-enter");
    // Load choreography runs once; later content edits must not replay it.
    window.setTimeout(() => document.documentElement.classList.remove("hero-enter"), 1800);
  }
  const links = document.querySelector(".nav-links");
  if (links) {
    indicator = document.createElement("span");
    indicator.className = "nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    links.append(indicator);
  }
  const nav = document.querySelector(".nav");
  if (nav) {
    const bar = document.createElement("span");
    bar.className = "nav-progress";
    bar.setAttribute("aria-hidden", "true");
    progress = document.createElement("span");
    bar.append(progress);
    nav.append(bar);
  }
  document.addEventListener("pointermove", movePointer, { passive: true });
  document.addEventListener("pointerleave", clearPointer);
  document.addEventListener("pointerdown", (event) => {
    if (reduce.matches) return;
    const button = event.target.closest?.(".btn, .hero-link, .theme-btn, .marquee-toggle");
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "tap-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.left = `${event.clientX - bounds.left}px`;
    ripple.style.top = `${event.clientY - bounds.top}px`;
    button.append(ripple);
    const animation = ripple.animate([{ transform: "scale(.1)", opacity: .8 }, { transform: "scale(2.8)", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.7,.2,1)" });
    animation.finished.finally(() => ripple.remove()).catch(() => {});
  }, { passive: true });
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      clearPointer();
      if (sceneElement && !reduce.matches && window.innerWidth > 720) {
        sceneElement.style.translate = `0 ${Math.min(window.scrollY * .065, 18)}px`;
      }
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.transform = `scaleX(${height > 0 ? window.scrollY / height : 0})`;
    });
  }, { passive: true });
  window.addEventListener("resize", clearPointer, { passive: true });
  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("motion-hidden", document.hidden);
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (moving.size) wake(moving.values().next().value);
  });
  reduce.addEventListener("change", syncPreference);
  fine.addEventListener("change", clearPointer);
  refreshMotion();
}
