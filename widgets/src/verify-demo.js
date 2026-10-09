// Verify widget: load files in the browser, verify them against the demo
// trust anchor, and show a three-lamp light. Nothing is uploaded.
//
// CBF and sidecar-signed files are verified in JavaScript. HDF5 files and
// Zarr zips (quantEM, HyperSpy .zspy) signed in place are verified by
// framesig itself, running in the page (python.js). Sample files are fetched
// from this page's own download links.
//
//   :::{anywidget} ../widgets/verify-demo.js
//   :::

import { verifyFrame } from "../framesig/verify.js";
import {
  ROOTS, ROOT_PEM, fileLoader, frameThumbnail, h, mount, previewCanvas, resultCard, sampleBytes, split, statusLine,
} from "./common.js";
import { inScratch, isHdf5, isZip, python } from "./python.js";
import cbfSamples from "../../demo/samples/index.json";
import hdf5Samples from "../../demo/samples/hdf5.json";
import zarrSamples from "../../demo/samples/zarr.json";

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

/** HDF5 files and Zarr zips, verified by framesig in Python. */
async function verifyInPython(job, kind, status) {
  const py = await python(status);
  status(kind === "zarr" ? "Verifying the Zarr store..." : "Verifying the HDF5 file...");
  const out = await inScratch(py, async (dir) => {
    const path = `${dir}/in.${kind === "zarr" ? "zip" : "h5"}`;
    py.FS.writeFile(path, job.bytes);
    const dp = py.pyimport("dp_web");
    return JSON.parse(kind === "zarr" ? dp.verify_zarr(path, ROOT_PEM) : dp.verify_h5(path, ROOT_PEM));
  });
  return { result: out.result, thumb: previewCanvas(out.preview) };
}

async function verifyJob(job, status) {
  if (!job.sidecar && isHdf5(job.bytes)) return verifyInPython(job, "hdf5", status);
  if (!job.sidecar && isZip(job.bytes)) return verifyInPython(job, "zarr", status);
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

  async function showSample(file) {
    results.replaceChildren(statusLine(`Loading ${file}...`));
    try {
      await show([{ name: file, bytes: await sampleBytes(file) }]);
    } catch (e) {
      results.replaceChildren(h("div", { class: "dpw-error" }, e.message));
    }
  }

  const chip = (s) =>
    h("button", { class: "dpw-chip", type: "button", title: s.description, onclick: () => showSample(s.file) },
      h("i", { class: "dpw-dot", style: `background:var(--${s.light})` }), s.file);
  const groups = [
    { label: "CBF", chips: cbfSamples.map(chip) },
    { label: "HyperSpy (.hspy, HDF5)", chips: hdf5Samples.map(chip) },
    { label: "quantEM (Zarr)", chips: zarrSamples.filter((s) => s.file.includes("_quantem_")).map(chip) },
    { label: "HyperSpy (.zspy, Zarr)", chips: zarrSamples.filter((s) => s.file.includes("_zspy_")).map(chip) },
  ];

  root.appendChild(h("div", { class: "dpw-box" },
    split(
      fileLoader({
        label: "Load data",
        multiple: true,
        onFiles: show,
        hint: "CBF, HDF5 (such as HyperSpy .hspy) and zipped Zarr files (quantEM, HyperSpy .zspy) carry their signature inside. Load any other file together with its .framesig file. Files never leave your browser.",
      }),
      "Or try a sample",
      groups)));
  root.appendChild(results);
  return cleanup;
}

export default { render };
