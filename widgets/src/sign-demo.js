// Sign widget: load a file in the browser, sign it with the website's demo key
// or with a key generated in this page, and download the result. Nothing is
// uploaded.
//
//   CBF              signed in place, in JavaScript (sign.js)
//   HDF5             signed in place by framesig running in the page (python.js)
//   proprietary      converted to HyperSpy .hspy with rosettasciio, then signed in place
//   anything else    a separate .framesig signature file
//
//   :::{anywidget} ../widgets/sign-demo.js
//   :::

import { fromBase64 } from "../framesig/bytes.js";
import * as cbf from "../framesig/cbf.js";
import { generateSigner, importSigner, signFile, SIDECAR_SUFFIX } from "../framesig/sign.js";
import { verifyFrame } from "../framesig/verify.js";
import {
  ROOTS, ROOT_PEM, download, fileLoader, frameThumbnail, fromBase64String, h, mount, previewCanvas, resultCard,
  split, statusLine,
} from "./common.js";
import { CONVERTIBLE, extension, inScratch, isHdf5, python, pythonWithReaders } from "./python.js";
import demoSigner from "../../demo/demo-signer.json";
import hdf5Samples from "../../demo/samples/hdf5.json";
import h5Raw from "../../demo/samples/diffraction_raw.hspy";
import cbfUnsigned from "../../demo/samples/unsigned.cbf";

const NOTE = "Signed in a web browser by the Detector Provenance demo";
const SAMPLES = [
  { file: "unsigned.cbf", bytes: cbfUnsigned },
  ...hdf5Samples.filter((s) => s.sign).map((s) => ({ file: s.file, bytes: h5Raw })),
];

function stemAndExt(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** How a file will be signed, decided from its contents and name. */
function methodFor(file) {
  if (cbf.sniff(file.bytes)) return { kind: "cbf", text: "CBF file: the signature is added inside the file." };
  if (isHdf5(file.bytes)) {
    return { kind: "hdf5", text: "HDF5 file: the signature is added inside the file, as a /framesig group." };
  }
  if (CONVERTIBLE.has(extension(file.name))) {
    return { kind: "convert",
      text: "Proprietary format: the data and metadata are converted to HyperSpy's open HDF5 format (.hspy) with rosettasciio, and the signature is added inside the new file." };
  }
  return { kind: "sidecar", text: "Other format: the file is left unchanged and the signature is written to a separate .framesig file." };
}

function render({ el }) {
  const { root, cleanup } = mount(el);
  let file = null;
  let freshSigner = null;

  const fileLine = h("div", { class: "dpw-small", style: "margin-top:10px" }, "No file loaded.");
  const methodLine = h("div", { class: "dpw-small" });
  const signBtn = h("button", { class: "dpw-btn", type: "button", disabled: true }, "Sign");
  const out = h("div", {});
  const keyChoice = h("div", { class: "dpw-choice" },
    h("label", {},
      h("input", { type: "radio", name: "dpw-key", value: "demo", checked: true }),
      h("span", {}, h("b", {}, "Website demo key. "),
        "A key certified by the demo manufacturer as custodial. It is published with this page, so anyone can use it, and files it signs show a yellow light.")),
    h("label", {},
      h("input", { type: "radio", name: "dpw-key", value: "fresh" }),
      h("span", {}, h("b", {}, "New key generated in this browser. "),
        "A key that exists only in this page and traces back to no manufacturer. The signature is valid, but files it signs show a red light.")));

  const chosenKey = () => keyChoice.querySelector("input:checked").value;

  function load(f) {
    file = f;
    fileLine.textContent = `Loaded ${file.name} (${file.bytes.length.toLocaleString()} bytes).`;
    methodLine.textContent = methodFor(file).text;
    signBtn.disabled = false;
    out.replaceChildren();
  }

  async function signInJs() {
    const signer = chosenKey() === "demo"
      ? await importSigner(fromBase64(demoSigner.pkcs8), demoSigner.certificates.map(fromBase64), demoSigner.subject)
      : (freshSigner ||= await generateSigner());
    const signed = await signFile(file.bytes, signer, { claims: { note: NOTE } });
    const check = await verifyFrame(signed.signed, { roots: ROOTS, sidecar: signed.sidecar ? signed.envelope : undefined });
    const [stem, ext] = stemAndExt(file.name);
    if (signed.embedded) {
      const name = `${stem}-signed${ext}`;
      return { name, card: resultCard(name, check, frameThumbnail(signed.signed)),
               downloads: [[name, signed.signed]], note: "The signature is stored inside the CBF file." };
    }
    return { name: file.name, card: resultCard(`${file.name} + ${file.name}${SIDECAR_SUFFIX}`, check, null),
             downloads: [[file.name + SIDECAR_SUFFIX, signed.sidecar]],
             note: `The signature is stored in a separate file. ${file.name} itself is unchanged; keep the two files together, and load both into the verifier.` };
  }

  async function signInPython(method, status) {
    const py = method === "convert" ? await pythonWithReaders(status) : await python(status);
    const [stem, ext] = stemAndExt(file.name);
    const name = method === "convert" ? `${stem}-signed.hspy` : `${stem}-signed${ext}`;
    status(method === "convert" ? "Converting and signing..." : "Signing...");
    return inScratch(py, async (dir) => {
      const dp = py.pyimport("dp_web");
      const certs = py.toPy(demoSigner.certificates);
      const outPath = `${dir}/out`;
      let res;
      if (method === "convert") {
        py.FS.writeFile(`${dir}/${file.name}`, file.bytes);
        res = JSON.parse(dp.convert_and_sign(`${dir}/${file.name}`, file.name, outPath, chosenKey(),
                                             demoSigner.pkcs8, certs, ROOT_PEM, NOTE));
      } else {
        py.FS.writeFile(outPath, file.bytes);
        res = JSON.parse(dp.sign_h5(outPath, chosenKey(), demoSigner.pkcs8, certs, ROOT_PEM, NOTE));
      }
      certs.destroy();
      const bytes = py.FS.readFile(outPath);
      return { name, card: resultCard(name, res.result, previewCanvas(res.preview)), downloads: [[name, bytes]],
               note: (res.note ? res.note + " " : "") + "The signature is stored inside the HDF5 file, which opens in HyperSpy and any HDF5 reader." };
    });
  }

  async function sign() {
    out.replaceChildren();
    signBtn.disabled = true;
    const line = statusLine("Signing...");
    out.appendChild(line);
    try {
      const method = methodFor(file).kind;
      const r = method === "cbf" || method === "sidecar"
        ? await signInJs()
        : await signInPython(method, (t) => { line.textContent = t; });
      line.replaceWith(
        r.card,
        h("div", { class: "dpw-row", style: "margin-top:12px" },
          r.downloads.map(([name, bytes]) =>
            h("button", { class: "dpw-btn", type: "button", onclick: () => download(name, bytes) }, `Download ${name}`))),
        h("div", { class: "dpw-small", style: "margin-top:8px" }, r.note));
    } catch (e) {
      line.replaceWith(h("div", { class: "dpw-error" }, `Signing failed: ${e.message}`));
    } finally {
      signBtn.disabled = !file;
    }
  }
  signBtn.addEventListener("click", sign);

  const chip = (s) =>
    h("button", { class: "dpw-chip", type: "button",
                  onclick: () => load({ name: s.file, bytes: fromBase64String(s.bytes) }) },
      h("i", { class: "dpw-dot", style: "background:var(--red)" }), s.file);
  const groups = [
    { label: "CBF", chips: SAMPLES.filter((s) => s.file.endsWith(".cbf")).map(chip) },
    { label: "HyperSpy (.hspy, HDF5)", chips: SAMPLES.filter((s) => s.file.endsWith(".hspy")).map(chip) },
  ];

  root.appendChild(h("div", { class: "dpw-box" },
    split(
      fileLoader({
        label: "Load a file",
        multiple: false,
        onFiles: (files) => load(files[0]),
        hint: "CBF and HDF5 files, such as HyperSpy .hspy, are signed in place. Proprietary formats such as .dm3 are converted to .hspy first. The file never leaves your browser.",
      }),
      "Or try an unsigned sample",
      groups),
    fileLine,
    methodLine,
    keyChoice,
    signBtn));
  root.appendChild(out);
  return cleanup;
}

export default { render };
