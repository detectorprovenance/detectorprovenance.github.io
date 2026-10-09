// Shared pieces of the two demo widgets: styling, the four-light status,
// file loading, and the frame thumbnail. Bundled into each widget by
// scripts/build_widgets.sh.

import * as cbf from "../framesig/cbf.js";
import { colormapLut } from "../framesig/display.js";
import { parsePem } from "../framesig/x509.js";
import rootPem from "../../demo/demo-root.pem";

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
.dpw .dpw-label { font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.dpw .dpw-legend { display:flex; gap:16px; flex-wrap:wrap; font-size:14px; }
.dpw .dpw-legend span { display:inline-flex; gap:7px; align-items:center; }
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
@media (max-width: 560px) { .dpw .dpw-thumb { display:none; } }
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

export function legend() {
  return h("div", { class: "dpw-legend" },
    Object.entries(LIGHTS).map(([color, { label }]) =>
      h("span", {}, h("i", { class: "dpw-dot", style: `background:var(--${color})` }), label)));
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
    h("button", { class: "dpw-btn", type: "button", onclick: () => input.click() }, label),
    h("div", { style: "margin-top:8px" }, hint));
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

export function resultCard(name, r, bytes) {
  const c = classify(r);
  const signal = h("div", { class: "dpw-signal", title: LIGHTS[c.light].label },
    ["red", "yellow", "green", "violet"].map((color) =>
      h("div", { class: "dpw-lamp" + (color === c.light ? " dpw-on" : ""),
                 style: `background:var(--${color}); --glow:var(--${color})` })));
  const body = h("div", { class: "dpw-body" },
    h("div", { class: "dpw-title", style: `color:var(--${c.light})` }, c.title),
    h("div", { class: "dpw-file" }, name),
    h("p", { class: "dpw-text" }, c.text),
    h("ul", { class: "dpw-details" },
      detailLines(r).map(([k, v]) => h("li", {}, h("b", {}, k + ": "), String(v)))));
  const card = h("div", { class: "dpw-card" }, signal, body);
  const thumb = bytes ? frameThumbnail(bytes) : null;
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
    const [low, high] = quantileWindow(pooled, 0.02, 0.98);
    const span = (high - low) || 1;
    const lut = colormapLut("viridis");
    const canvas = h("canvas", { class: "dpw-thumb", width: ow, height: oh });
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(ow, oh);
    for (let i = 0; i < pooled.length; i++) {
      const t = Math.max(0, Math.min(1, (pooled[i] - low) / span));
      const k = Math.min(255, (t * 255) | 0) * 3;
      img.data.set([lut[k], lut[k + 1], lut[k + 2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Display limits from the `lo` and `hi` quantiles of the measured values.
 * Negative values are masked pixels (detector gaps, dead pixels) rather than
 * measurements, so they are left out, and they render at the bottom of the
 * colour map.
 */
export function quantileWindow(values, lo = 0.02, hi = 0.98) {
  const v = Float64Array.from(values).filter((x) => Number.isFinite(x) && x >= 0).sort();
  if (!v.length) return [0, 1];
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  const low = at(lo), high = at(hi);
  return [low, high > low ? high : low + 1];
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
