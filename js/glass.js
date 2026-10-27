// A static, rounded-edge displacement map. Only the nav and five desk tiles use it;
// scrolling cards keep the cheaper CSS material. No capture, WebGL or render loop.
const NS = "http://www.w3.org/2000/svg";
const surfaces = new Map();
let defs;
let observer;
let transparency;
let sequence = 0;

function svgNode(name, attributes) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function updateMap(element, record) {
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height || (record.width === width && record.height === height)) return;
  record.width = width;
  record.height = height;
  const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 24, width / 2, height / 2);
  const rim = Math.min(18, radius * .7);
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 640 / width, 280 / height);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const px = (x + .5) / canvas.width * width - width / 2;
      const py = (y + .5) / canvas.height * height - height / 2;
      const qx = Math.abs(px) - (width / 2 - radius);
      const qy = Math.abs(py) - (height / 2 - radius);
      const dx = Math.max(qx, 0);
      const dy = Math.max(qy, 0);
      const length = Math.hypot(dx, dy);
      const depth = -(length + Math.min(Math.max(qx, qy), 0) - radius);
      // Neutral centre and outer boundary, with a smooth curved lens in between.
      const bend = depth > 0 && depth < rim ? Math.sin(depth / rim * Math.PI) ** .8 : 0;
      const nx = length ? dx / length : Number(qx > qy);
      const ny = length ? dy / length : Number(qy >= qx);
      const offset = (y * canvas.width + x) * 4;
      pixels.data[offset] = 128 + Math.sign(px) * nx * bend * 120;
      pixels.data[offset + 1] = 128 + Math.sign(py) * ny * bend * 120;
      pixels.data[offset + 2] = 128;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  record.image.setAttribute("href", canvas.toDataURL());
  record.ready = true;
  element.style.setProperty("--glass-refraction", `url("#${record.filter.id}")`);
  element.classList.toggle("refraction-ready", !transparency.matches);
}

export function refreshGlass() {
  if (!defs) return;
  for (const [element, record] of surfaces) {
    if (element.isConnected) continue;
    observer.unobserve(element);
    record.filter.remove();
    surfaces.delete(element);
  }
  document.querySelectorAll(".nav, .scene-chip").forEach((element) => {
    if (surfaces.has(element)) return;
    const filter = svgNode("filter", { id: `glass-edge-${++sequence}`, x: "0%", y: "0%", width: "100%", height: "100%", "color-interpolation-filters": "sRGB" });
    const image = svgNode("feImage", { x: "0", y: "0", width: "100%", height: "100%", preserveAspectRatio: "none", result: "edge" });
    filter.append(image, svgNode("feDisplacementMap", { in: "SourceGraphic", in2: "edge", scale: element.matches(".nav") ? "22" : "16", xChannelSelector: "R", yChannelSelector: "G" }));
    defs.append(filter);
    const record = { filter, image };
    surfaces.set(element, record);
    observer.observe(element);
    updateMap(element, record);
  });
}

export function initGlass() {
  // Safari/Firefox accept the syntax but do not reliably displace the backdrop.
  // Keep their CSS blur/highlight fallback, including iOS browsers using WebKit.
  if (defs || typeof ResizeObserver === "undefined" || !/Chrome|Chromium|Edg\//.test(navigator.userAgent) || !CSS.supports("backdrop-filter", 'url("#glass")')) return;
  transparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
  const svg = svgNode("svg", { width: "0", height: "0", "aria-hidden": "true", focusable: "false" });
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  defs = svgNode("defs", {});
  svg.append(defs);
  document.body.append(svg);
  observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const record = surfaces.get(target);
      if (record) updateMap(target, record);
    }
  });
  transparency.addEventListener("change", () => {
    for (const [element, record] of surfaces) element.classList.toggle("refraction-ready", Boolean(record.ready) && !transparency.matches);
  });
  refreshGlass();
}
