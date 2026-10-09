// Verify widget: load files in the browser, verify them against the demo
// trust anchor, and show a three-lamp light. Nothing is uploaded.
//
// CBF and sidecar-signed files are verified in JavaScript. HDF5 files signed
// in place are verified by framesig itself, running in the page (python.js).
//
//   :::{anywidget} ../widgets/verify-demo.js
//   :::

import { verifyFrame } from "../framesig/verify.js";
import {
  ROOTS, ROOT_PEM, fileLoader, frameThumbnail, fromBase64String, h, mount, previewCanvas, resultCard, split, statusLine,
} from "./common.js";
import { inScratch, isHdf5, python } from "./python.js";
import samples from "../../demo/samples/index.json";
import hdf5Samples from "../../demo/samples/hdf5.json";
import genuine from "../../demo/samples/genuine.cbf";
import softwareSigned from "../../demo/samples/software-signed.cbf";
import testPattern from "../../demo/samples/test-pattern.cbf";
import fabricated from "../../demo/samples/fabricated.cbf";
import unsigned from "../../demo/samples/unsigned.cbf";
import tampered from "../../demo/samples/tampered.cbf";
import metadataModified from "../../demo/samples/metadata-modified.cbf";
import h5Hardware from "../../demo/samples/diffraction_hardware-signed.hspy";
import h5Software from "../../demo/samples/diffraction_software-signed.hspy";
import h5Tampered from "../../demo/samples/diffraction_tampered.hspy";

const SAMPLE_BYTES = {
  "genuine.cbf": genuine,
  "software-signed.cbf": softwareSigned,
  "test-pattern.cbf": testPattern,
  "fabricated.cbf": fabricated,
  "unsigned.cbf": unsigned,
  "tampered.cbf": tampered,
  "metadata-modified.cbf": metadataModified,
  "diffraction_hardware-signed.hspy": h5Hardware,
  "diffraction_software-signed.hspy": h5Software,
  "diffraction_tampered.hspy": h5Tampered,
};
const SAMPLES = [...samples, ...hdf5Samples.filter((s) => SAMPLE_BYTES[s.file])];

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

async function verifyHdf5(job, status) {
  const py = await python(status);
  status("Verifying the HDF5 file...");
  const out = await inScratch(py, async (dir) => {
    py.FS.writeFile(`${dir}/in.h5`, job.bytes);
    return JSON.parse(py.pyimport("dp_web").verify_h5(`${dir}/in.h5`, ROOT_PEM));
  });
  return { result: out.result, thumb: previewCanvas(out.preview) };
}

async function verifyJob(job, status) {
  if (!job.sidecar && isHdf5(job.bytes)) return verifyHdf5(job, status);
  let sidecar;
  if (job.sidecar) {
    try {
      sidecar = JSON.parse(new TextDecoder().decode(job.sidecar.bytes));
    } catch {
      return { error: `${job.sidecar.name} is not a readable signature file.` };
    }
  }
  return { result: await verifyFrame(job.bytes, { roots: ROOTS, sidecar }), thumb: frameThumbnail(job.bytes) };
}

function render({ el }) {
  const { root, cleanup } = mount(el);
  const results = h("div", {});
  let run = 0;

  async function show(files) {
    const mine = ++run;
    results.replaceChildren();
    for (const job of pairUp(files)) {
      if (job.error) {
        results.appendChild(h("div", { class: "dpw-error" }, job.error));
        continue;
      }
      const line = statusLine("Verifying...");
      results.appendChild(line);
      try {
        const { result, thumb, error } = await verifyJob(job, (t) => { line.textContent = t; });
        if (mine !== run) return;
        line.replaceWith(error
          ? h("div", { class: "dpw-error" }, error)
          : resultCard(job.sidecar ? `${job.name} + ${job.sidecar.name}` : job.name, result, thumb));
      } catch (e) {
        if (mine !== run) return;
        line.replaceWith(h("div", { class: "dpw-error" }, `Could not verify ${job.name}: ${e.message}`));
      }
    }
  }

  const chip = (s) =>
    h("button", { class: "dpw-chip", type: "button", title: s.description,
                  onclick: () => show([{ name: s.file, bytes: fromBase64String(SAMPLE_BYTES[s.file]) }]) },
      h("i", { class: "dpw-dot", style: `background:var(--${s.light})` }), s.file);
  const groups = [
    { label: "CBF", chips: SAMPLES.filter((s) => s.file.endsWith(".cbf")).map(chip) },
    { label: "HyperSpy (.hspy, HDF5)", chips: SAMPLES.filter((s) => s.file.endsWith(".hspy")).map(chip) },
  ];

  root.appendChild(h("div", { class: "dpw-box" },
    split(
      fileLoader({
        label: "Load data",
        multiple: true,
        onFiles: show,
        hint: "CBF and HDF5 files, such as HyperSpy .hspy, carry their signature inside. Load any other file together with its .framesig file. Files never leave your browser.",
      }),
      "Or try a sample",
      groups)));
  root.appendChild(results);
  return cleanup;
}

export default { render };
