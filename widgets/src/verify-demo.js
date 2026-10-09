// Verify widget: load files in the browser, verify them against the demo
// trust anchor, and show one of four lights. Nothing is uploaded.
//
//   :::{anywidget} ./widgets/verify-demo.js
//   :::

import { verifyFrame } from "../framesig/verify.js";
import { ROOTS, fileLoader, fromBase64String, h, legend, mount, resultCard } from "./common.js";
import samples from "../../demo/samples/index.json";
import genuine from "../../demo/samples/genuine.cbf";
import softwareSigned from "../../demo/samples/software-signed.cbf";
import testPattern from "../../demo/samples/test-pattern.cbf";
import fabricated from "../../demo/samples/fabricated.cbf";
import unsigned from "../../demo/samples/unsigned.cbf";
import tampered from "../../demo/samples/tampered.cbf";
import metadataModified from "../../demo/samples/metadata-modified.cbf";

const SAMPLE_BYTES = {
  "genuine.cbf": genuine,
  "software-signed.cbf": softwareSigned,
  "test-pattern.cbf": testPattern,
  "fabricated.cbf": fabricated,
  "unsigned.cbf": unsigned,
  "tampered.cbf": tampered,
  "metadata-modified.cbf": metadataModified,
};

const SIDECAR = ".framesig";

/** Pair each data file with its `.framesig` sidecar, when one was loaded. */
function pairUp(files) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const jobs = [];
  for (const f of files) {
    if (f.name.endsWith(SIDECAR)) {
      if (!byName.has(f.name.slice(0, -SIDECAR.length))) {
        jobs.push({ name: f.name, error: `This is a signature file. Load it together with ${f.name.slice(0, -SIDECAR.length)}.` });
      }
      continue;
    }
    jobs.push({ name: f.name, bytes: f.bytes, sidecar: byName.get(f.name + SIDECAR) || null });
  }
  return jobs;
}

async function verifyJob(job) {
  let sidecar;
  if (job.sidecar) {
    try {
      sidecar = JSON.parse(new TextDecoder().decode(job.sidecar.bytes));
    } catch {
      return { error: `${job.sidecar.name} is not a readable signature file.` };
    }
  }
  return { result: await verifyFrame(job.bytes, { roots: ROOTS, sidecar }) };
}

function render({ el }) {
  const { root, cleanup } = mount(el);
  const results = h("div", {});

  async function show(files) {
    results.replaceChildren();
    for (const job of pairUp(files)) {
      if (job.error) {
        results.appendChild(h("div", { class: "dpw-error" }, job.error));
        continue;
      }
      const { result, error } = await verifyJob(job);
      if (error) results.appendChild(h("div", { class: "dpw-error" }, error));
      else results.appendChild(resultCard(job.sidecar ? `${job.name} + ${job.sidecar.name}` : job.name, result, job.bytes));
    }
  }

  const chips = samples.map((s) =>
    h("button", { class: "dpw-chip", type: "button", title: s.description,
                  onclick: () => show([{ name: s.file, bytes: fromBase64String(SAMPLE_BYTES[s.file]) }]) },
      h("i", { class: "dpw-dot", style: `background:var(--${s.light})` }), s.file));

  root.appendChild(h("div", { class: "dpw-box" },
    fileLoader({
      label: "Load data",
      multiple: true,
      onFiles: show,
      hint: "or drop files here. Load a file together with its .framesig file if it has one. Files never leave your browser.",
    }),
    h("div", { style: "margin-top:14px" },
      h("div", { class: "dpw-label", style: "margin-bottom:6px" }, "Or try a sample"),
      h("div", { class: "dpw-row" }, chips)),
    h("div", { style: "margin-top:14px" }, legend())));
  root.appendChild(results);
  return cleanup;
}

export default { render };
