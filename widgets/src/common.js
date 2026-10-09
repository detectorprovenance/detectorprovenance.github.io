// Shared pieces of the two demo widgets: styling, the four-light status,
// file loading, and the frame thumbnail. Bundled into each widget by
// scripts/build_widgets.sh.

import * as cbf from "../framesig/cbf.js";
import { colormapLut } from "../framesig/display.js";
import { parsePem } from "../framesig/x509.js";
import rootPem from "../../demo/demo-root.pem";

export const ROOT_PEM = rootPem;
export const ROOTS = parsePem(rootPem);

export const LIGHTS = {
  green: { label: "Hardware signed" },
  yellow: { label: "Software signed" },
  red: { label: "Unverified" },
  violet: { label: "Modified" },
};

const CSS = `
.dpw { --fg:#1c1917; --muted:#57534e; --panel:#fafaf9; --border:#d6d3d1; --housing:#292524;
  --red:#e03131; --yellow:#fab005; --green:#2f9e44; --violet:#7048e8; --accent:rgb(204,0,0);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--fg);
  margin: 1.25rem 0 2rem 0; }
.dpw.dpw-dark { --fg:#f5f5f4; --muted:#a8a29e; --panel:#24201e; --border:#44403c; --housing:#0c0a09;
  --red:#ff1e1e; --yellow:#ffd43b; --green:#51cf66; --violet:#9775fa; --accent:rgb(255,30,30); }
.dpw * { box-sizing: border-box; }
.dpw .dpw-box { border:1px solid var(--border); border-radius:14px; background:var(--panel); padding:16px; }
.dpw .dpw-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.dpw .dpw-btn { font:inherit; font-size:15px; font-weight:600; padding:8px 16px; border-radius:9px; cursor:pointer;
  border:1px solid var(--accent); background:var(--accent); color:#fff; }
.dpw .dpw-btn:disabled { opacity:0.45; cursor:default; }
.dpw .dpw-btn.dpw-ghost { background:transparent; color:var(--accent); }
.dpw .dpw-drop { border:2px dashed var(--border); border-radius:12px; padding:18px; text-align:center;
  color:var(--muted); font-size:15px; transition:border-color .15s, background .15s; }
.dpw .dpw-drop.dpw-over { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 8%, transparent); }
.dpw .dpw-chip { font:inherit; font-size:13.5px; padding:4px 11px; border-radius:999px; cursor:pointer;
  border:1px solid var(--border); background:transparent; color:var(--fg); display:inline-flex; gap:7px; align-items:center; }
.dpw .dpw-chip:hover { border-color:var(--accent); }
.dpw .dpw-dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex:none; }
.dpw .dpw-small { font-size:13.5px; color:var(--muted); line-height:1.5; }
.dpw .dpw-split { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:stretch; }
.dpw .dpw-split > div { min-width:0; }
.dpw .dpw-split .dpw-drop { height:100%; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.dpw .dpw-list { display:flex; flex-direction:column; gap:6px; align-items:stretch; }
.dpw .dpw-menu-wrap { position:relative; }
.dpw .dpw-menu-btn { font:inherit; font-size:15px; font-weight:600; width:100%; display:flex; justify-content:space-between;
  align-items:center; padding:9px 13px; border-radius:10px; cursor:pointer; border:1px solid var(--border);
  background:var(--panel); color:var(--fg); }
.dpw .dpw-menu-btn:hover { border-color:var(--accent); }
.dpw .dpw-caret { color:var(--muted); }
.dpw .dpw-menu { position:absolute; z-index:20; top:calc(100% + 4px); left:0; right:0; display:flex; flex-direction:column;
  gap:4px; padding:6px; border-radius:10px; border:1px solid var(--border); background:var(--panel);
  box-shadow:0 10px 28px rgba(0,0,0,.22); }
.dpw .dpw-menu[hidden] { display:none; }
.dpw .dpw-menu .dpw-chip { justify-content:flex-start; border:none; border-radius:7px; padding:7px 10px; }
.dpw .dpw-menu .dpw-chip:hover { background:color-mix(in srgb, var(--accent) 10%, transparent); }
.dpw .dpw-list .dpw-chip { justify-content:flex-start; border-radius:9px; padding:6px 11px; }
@media (max-width: 640px) { .dpw .dpw-split { grid-template-columns:minmax(0,1fr); } }
.dpw .dpw-label { font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.dpw .dpw-card { display:flex; gap:16px; align-items:flex-start; border:1px solid var(--border); border-radius:14px;
  padding:14px; margin-top:12px; background:var(--panel); }
.dpw .dpw-signal { flex:none; background:var(--housing); border-radius:14px; padding:8px 7px;
  display:flex; flex-direction:column; gap:7px; }
.dpw .dpw-lamp { width:22px; height:22px; border-radius:50%; opacity:.16; }
.dpw .dpw-lamp.dpw-on { opacity:1; box-shadow:0 0 14px 3px var(--glow); }
.dpw .dpw-body { flex:1 1 260px; min-width:0; }
.dpw .dpw-title { font-size:19px; font-weight:700; margin:0 0 2px 0; }
.dpw .dpw-file { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:13px; color:var(--muted);
  overflow-wrap:anywhere; }
.dpw .dpw-text { font-size:15px; line-height:1.5; margin:6px 0 8px 0; }
.dpw .dpw-details { font-size:13.5px; line-height:1.55; color:var(--muted); margin:0; padding:0; list-style:none; }
.dpw .dpw-details b { color:var(--fg); font-weight:600; }
.dpw .dpw-thumb { flex:none; width:200px; max-width:40%; border-radius:8px; border:1px solid var(--border);
  image-rendering:pixelated; }
.dpw .dpw-choice { display:flex; flex-direction:column; gap:8px; margin:14px 0; }
.dpw .dpw-choice label { display:flex; gap:10px; align-items:flex-start; font-size:15px; line-height:1.45; cursor:pointer; }
.dpw .dpw-choice input { margin-top:4px; accent-color:var(--accent); }
.dpw .dpw-error { color:var(--red); font-size:14.5px; margin-top:10px; }
@media (max-width: 560px) {
  .dpw .dpw-card { flex-wrap:wrap; }
  .dpw .dpw-thumb { width:100%; max-width:100%; order:3; }
}
`;

/** Root element, scoped stylesheet, and dark-mode tracking. */
export function mount(el) {
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "dpw";
  const sync = () => root.classList.toggle("dpw-dark", document.documentElement.classList.contains("dark"));
  sync();
  const obs = new MutationObserver(sync);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.appendChild(style);
  el.appendChild(root);
  return { root, cleanup: () => obs.disconnect() };
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/**
 * Two panels: loading on the left, sample files on the right. `groups` is
 * `[{label, chips}]`, one per format; each is a button that pops up a menu of
 * its files.
 */
export function split(left, title, groups) {
  const menus = [];
  const closeAll = () => menus.forEach((m) => { m.hidden = true; });
  const entries = groups.map((g) => {
    const menu = h("div", { class: "dpw-menu", hidden: true }, g.chips);
    menu.addEventListener("click", closeAll);  // picking a file closes the menu
    menus.push(menu);
    const button = h("button", { class: "dpw-menu-btn", type: "button", "aria-haspopup": "menu",
                                 onclick: () => { const open = menu.hidden; closeAll(); menu.hidden = !open; } },
      h("span", {}, g.label), h("span", { class: "dpw-caret" }, "\u25be"));
    return h("div", { class: "dpw-menu-wrap" }, button, menu);
  });
  const panel = h("div", {},
    h("div", { class: "dpw-label", style: "margin-bottom:8px" }, title),
    h("div", { class: "dpw-list" }, entries));
  // Close on any click outside the menus (events from the shadow DOM are retargeted).
  document.addEventListener("click", (e) => {
    if (!e.composedPath().some((n) => n.classList && n.classList.contains("dpw-menu-wrap"))) closeAll();
  });
  return h("div", { class: "dpw-split" }, h("div", {}, left), panel);
}

/** A file input plus a drop zone; calls `onFiles([{name, bytes}])`. */
export function fileLoader({ label, multiple, onFiles, hint }) {
  const input = h("input", { type: "file", multiple, style: "display:none" });
  const read = async (list) => {
    const files = [];
    for (const f of list) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    if (files.length) onFiles(files);
  };
  input.addEventListener("change", () => { read(input.files); input.value = ""; });
  const drop = h("div", { class: "dpw-drop" },
    h("div", {}, h("button", { class: "dpw-btn", type: "button", onclick: () => input.click() }, label)),
    h("div", {}, "or drop files here"),
    h("div", { class: "dpw-small" }, hint));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dpw-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dpw-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("dpw-over"); read(e.dataTransfer.files); });
  return h("div", {}, input, drop);
}

// --------------------------------------------------------------------------
// the four lights
// --------------------------------------------------------------------------

/** Map a verification result to one of the four lights, with an explanation. */
export function classify(r) {
  const mode = r.assurance && r.assurance.mode;
  if (r.status === "invalid") {
    return { light: "violet", title: "Signature does not verify",
      text: "The file carries a signature, but it does not match the signed record, so the file or its signature was altered." };
  }
  if (r.status === "tampered") {
    return { light: "violet", title: "Data modified after signing",
      text: "The signature is genuine, but the recorded values no longer match the values that were signed." };
  }
  if (r.status === "metadata-modified") {
    return { light: "violet", title: "Metadata modified after signing",
      text: "The recorded values are unchanged, but the metadata, such as the wavelength or detector distance, was edited after signing." };
  }
  if (r.status === "unsigned") {
    return { light: "red", title: "Unsigned",
      text: "No signature was found, so nothing establishes where this file came from. Almost all existing data are unsigned, so this is not evidence of fabrication." };
  }
  const level = r.assurance ? r.assurance.level : "none";
  if (level === "instrument") {
    return { light: "green", title: "Hardware signed",
      text: "Unchanged since it was signed inside a manufacturer-certified instrument, during a physical exposure." };
  }
  if (level === "custodial") {
    return { light: "yellow", title: "Software signed",
      text: mode && mode !== "physical"
        ? `Unchanged since signing, but the detector reported a ${mode} acquisition instead of a physical exposure.`
        : "Unchanged since signing by a key that a manufacturer certified, but which is held in software. Anyone with access to that key can sign any file." };
  }
  return { light: "red", title: "Unverified signature",
    text: "The signature is valid, but its key traces back to no trusted manufacturer, so anyone could have produced it." };
}

function detailLines(r) {
  const lines = [];
  const m = r.manifest || {};
  lines.push(["Integrity", r.status]);
  lines.push(["Origin", r.assurance ? r.assurance.level : "none"]);
  if (m.signer && m.signer.subject) lines.push(["Signer", m.signer.subject]);
  else if (m.signer && m.signer.key_id) lines.push(["Signing key", m.signer.key_id.slice(0, 23) + "..."]);
  const inst = r.assurance && r.assurance.instrument;
  if (inst && Object.keys(inst).length) {
    lines.push(["Instrument", Object.entries(inst).map(([k, v]) => `${k} ${v}`).join(", ")]);
  }
  if (r.assurance && r.assurance.mode) lines.push(["Acquisition mode", r.assurance.mode]);
  if (m.created) lines.push(["Signed", `${m.created} (stated by the signer)`]);
  for (const p of (r.problems || []).slice(0, 2)) lines.push(["Note", p]);
  return lines;
}

export function resultCard(name, r, thumb = null) {
  const c = classify(r);
  // A three-lamp traffic light. Red and violet share the top lamp, since
  // both mean "do not rely on this file"; the colour says which case it is.
  const top = c.light === "violet" ? "violet" : "red";
  const signal = h("div", { class: "dpw-signal", title: LIGHTS[c.light].label },
    [[top, c.light === top], ["yellow", c.light === "yellow"], ["green", c.light === "green"]].map(([color, on]) =>
      h("div", { class: "dpw-lamp" + (on ? " dpw-on" : ""),
                 style: `background:var(--${color}); --glow:var(--${color})` })));
  const body = h("div", { class: "dpw-body" },
    h("div", { class: "dpw-title", style: `color:var(--${c.light})` }, c.title),
    h("div", { class: "dpw-file" }, name),
    h("p", { class: "dpw-text" }, c.text),
    h("ul", { class: "dpw-details" },
      detailLines(r).map(([k, v]) => h("li", {}, h("b", {}, k + ": "), String(v)))));
  const card = h("div", { class: "dpw-card" }, signal, body);
  if (thumb) card.appendChild(thumb);
  return card;
}

// --------------------------------------------------------------------------
// frame thumbnail (CBF only)
// --------------------------------------------------------------------------

export function frameThumbnail(bytes, target = 256) {
  try {
    if (!cbf.sniff(bytes)) return null;
    const offset = cbf.findBlockOffset(bytes);
    const base = offset === null ? bytes : bytes.subarray(0, offset);
    const payloads = cbf.scanPayloads(base, base.length);
    if (!payloads.length || payloads[0].dimensions.length < 2) return null;
    const [width, height] = payloads[0].dimensions;
    const decoded = cbf.canonicalPayloadStream(base, payloads[0]);
    if (!decoded.values) return null;
    // Max-pool, as the frame viewer does, so single-pixel peaks stay visible.
    const step = Math.max(1, Math.ceil(Math.max(width, height) / target));
    const ow = Math.ceil(width / step), oh = Math.ceil(height / step);
    const pooled = new Float64Array(ow * oh).fill(-Infinity);
    for (let y = 0; y < height; y++) {
      const oy = (y / step) | 0;
      for (let x = 0; x < width; x++) {
        const v = decoded.values[y * width + x];
        const i = oy * ow + ((x / step) | 0);
        if (v > pooled[i]) pooled[i] = v;
      }
    }
    return imageCanvas(pooled, ow, oh, true);
  } catch {
    return null;
  }
}

/**
 * Display limits from the `lo` and `hi` quantiles of the values. In CBF frames
 * negative values are masked pixels (detector gaps, dead pixels) rather than
 * measurements, so `maskNegative` leaves them out and they render at the bottom
 * of the colour map; in processed data they are real values.
 */
export function quantileWindow(values, lo = 0.02, hi = 0.98, maskNegative = false) {
  const v = Float64Array.from(values).filter((x) => Number.isFinite(x) && (!maskNegative || x >= 0)).sort();
  if (!v.length) return [0, 1];
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  const low = at(lo), high = at(hi);
  return [low, high > low ? high : low + 1];
}

/** Paint values (row-major, width x height) with the viridis map, scaled
 * linearly between their 2nd and 98th percentiles. */
export function imageCanvas(values, width, height, maskNegative = false) {
  const [low, high] = quantileWindow(values, 0.02, 0.98, maskNegative);
  const span = (high - low) || 1;
  const lut = colormapLut("viridis");
  const canvas = h("canvas", { class: "dpw-thumb", width, height });
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < values.length; i++) {
    const t = Math.max(0, Math.min(1, (values[i] - low) / span));
    const k = Math.min(255, (t * 255) | 0) * 3;
    img.data.set([lut[k], lut[k + 1], lut[k + 2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Draw the preview the Python side returns: an image, or a spectrum line. */
export function previewCanvas(preview) {
  if (!preview) return null;
  const bytes = fromBase64String(preview.values);
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  if (preview.kind === "image") return imageCanvas(values, preview.width, preview.height);
  const width = 400, height = 240;
  const canvas = h("canvas", { class: "dpw-thumb", width, height });
  const ctx = canvas.getContext("2d");
  const [low, high] = quantileWindow(values, 0, 1);
  const span = (high - low) || 1;
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#51cf66";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (width - 16) + 8;
    const y = height - 8 - ((v - low) / span) * (height - 16);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.stroke();
  return canvas;
}

/** A one-line progress message that a later result replaces. */
export function statusLine(text) {
  return h("div", { class: "dpw-small", style: "margin-top:12px" }, text);
}

const SAMPLE_CACHE = new Map();

/**
 * A sample file's bytes, fetched from this page's own download link for it
 * (MyST copies each {download} file into the site under a hashed name, so the
 * link is the only stable reference). Same site, nothing leaves the browser.
 */
export async function sampleBytes(file) {
  if (!SAMPLE_CACHE.has(file)) {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === file);
    if (!link) throw new Error(`this page has no download link for ${file}`);
    SAMPLE_CACHE.set(file, fetch(link.href).then((r) => {
      if (!r.ok) throw new Error(`could not load ${file} (${r.status})`);
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b)));
  }
  return SAMPLE_CACHE.get(file);
}

export function fromBase64String(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
