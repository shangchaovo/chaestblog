// node --experimental-vm-modules scripts/test-marquee.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = new Map();
const frames = new Map();
let clock = 0;
let nextFrame = 0;
let intersect;
let dialogOpen = false;
function element(name) {
  const classes = new Set();
  return {
    dataset: {}, textContent: "", hidden: false,
    classList: {
      contains: (key) => classes.has(key),
      add: (key) => classes.add(key), remove: (key) => classes.delete(key),
      toggle: (key, on) => on ? classes.add(key) : classes.delete(key),
    },
    closest: () => null, setPointerCapture() {},
    addEventListener(type, callback) {
      const key = `${name}:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), callback]);
    },
  };
}
const body = element("body");
body.classList.add("marquee-on");
const reduce = Object.assign(element("reduce"), { matches: false });
const left = Object.assign(element("left"), { dataset: { marqueeKey: "ArrowLeft" } });
const right = Object.assign(element("right"), { dataset: { marqueeKey: "ArrowRight" } });
const controls = Object.assign(element("controls"), { querySelectorAll: () => [left, right] });
const animation = {
  animationName: "board-marquee", playbackRate: 1,
  get currentTime() { return 12345; },
  set currentTime(value) { assert.fail("Steering must never seek or restart the conveyor"); },
  updatePlaybackRate(value) { this.playbackRate = value; },
};
const track = { getAnimations: () => body.classList.contains("marquee-on") ? [animation] : [] };
const nodes = { siteGrid: track, boardMarquee: element("board"), marqueeControls: controls, marqueeSpeedValue: element("value") };
const document = Object.assign(element("document"), {
  body, hidden: false, getElementById: (id) => nodes[id], querySelector: () => dialogOpen,
});
const context = vm.createContext({
  document, performance: { now: () => clock },
  window: Object.assign(element("window"), { matchMedia: () => reduce }),
  IntersectionObserver: class { constructor(callback) { intersect = callback; } observe() {} },
  requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
  cancelAnimationFrame(id) { frames.delete(id); },
});
const module = new vm.SourceTextModule(readFileSync(new URL("../js/marquee.js", import.meta.url), "utf8"), { context });
await module.link(() => assert.fail("Marquee controller has no dependencies"));
await module.evaluate();
module.namespace.initMarquee();
module.namespace.initMarquee();
assert.equal(listeners.get("document:keydown").length, 1, "Bind controls only once");
intersect([{ isIntersecting: true }]);
const fire = (target, type, values = {}) => {
  const event = { target: body, preventDefault() { this.defaultPrevented = true; }, ...values };
  for (const callback of listeners.get(`${target}:${type}`) || []) callback(event);
  return event;
};
function advance(count = 100) {
  for (let i = 0; i < count && frames.size; i++) {
    clock += 16;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(clock);
  }
}
function expectRate(value) { advance(); assert.equal(animation.playbackRate, value); assert.equal(frames.size, 0, "No idle JS ticker"); }
fire("document", "keydown", { key: "ArrowRight" });
advance(1);
assert.ok(animation.playbackRate > 1 && animation.playbackRate < 3, "Accelerate smoothly");
expectRate(3);
assert.ok(right.classList.contains("is-held"));
fire("document", "keyup", { key: "ArrowRight" });
expectRate(1);
fire("document", "keydown", { key: "ArrowLeft" });
expectRate(.25);
fire("document", "keydown", { key: "ArrowRight" });
expectRate(1);
fire("document", "keyup", { key: "ArrowLeft" });
expectRate(3);
fire("window", "blur");
expectRate(1);
assert.ok(!body.classList.contains("marquee-steering"));

for (const values of [{ target: { closest: () => ({}) } }, { metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
  assert.ok(!fire("document", "keydown", { key: "ArrowRight", ...values }).defaultPrevented, "Preserve editing and native shortcuts");
  expectRate(1);
}
dialogOpen = true;
fire("document", "keydown", { key: "ArrowRight" });
expectRate(1);
dialogOpen = false;
body.classList.add("marquee-paused");
fire("document", "keydown", { key: "ArrowRight" });
expectRate(1);
body.classList.remove("marquee-paused");
fire("right", "pointerdown", { target: right, button: 0, pointerId: 7 });
expectRate(3);
fire("right", "pointercancel", { pointerId: 7 });
expectRate(1);
fire("right", "keydown", { target: right, key: " " });
expectRate(3);
fire("right", "blur");
expectRate(1);
fire("document", "keydown", { key: "ArrowRight" });
advance(2);
document.hidden = true;
fire("document", "visibilitychange");
expectRate(1);
document.hidden = false;
fire("document", "visibilitychange");
fire("document", "keydown", { key: "ArrowLeft" });
advance(2);
intersect([{ isIntersecting: false }]);
expectRate(1);
intersect([{ isIntersecting: true }]);
reduce.matches = true;
fire("reduce", "change");
assert.ok(controls.hidden);
fire("document", "keydown", { key: "ArrowRight" });
expectRate(1);
assert.equal(animation.currentTime, 12345);
console.log("Marquee controls passed: smooth rates, release, pointer, editing guards, pause, visibility, reduced motion, no timeline seek or idle ticker.");
