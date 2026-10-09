// Sign widget: load a file in the browser, sign it with the website's demo key
// or with a key generated in this page, and download the result. Nothing is
// uploaded.
//
//   :::{anywidget} ./widgets/sign-demo.js
//   :::

import { fromBase64 } from "../framesig/bytes.js";
import { generateSigner, importSigner, signFile, SIDECAR_SUFFIX } from "../framesig/sign.js";
import { verifyFrame } from "../framesig/verify.js";
import { ROOTS, download, fileLoader, h, mount, resultCard } from "./common.js";
import demoSigner from "../../demo/demo-signer.json";

const CLAIMS = { note: "Signed in a web browser by the Detector Provenance demo" };

function signedName(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-signed${name.slice(dot)}` : `${name}-signed`;
}

function render({ el }) {
  const { root, cleanup } = mount(el);
  let file = null;
  let freshSigner = null;

  const fileLine = h("div", { class: "dpw-small", style: "margin-top:10px" }, "No file loaded.");
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

  function chosenKey() {
    return keyChoice.querySelector("input:checked").value;
  }

  async function sign() {
    out.replaceChildren();
    signBtn.disabled = true;
    try {
      const signer = chosenKey() === "demo"
        ? await importSigner(fromBase64(demoSigner.pkcs8), demoSigner.certificates.map(fromBase64), demoSigner.subject)
        : (freshSigner ||= await generateSigner());
      const signed = await signFile(file.bytes, signer, { claims: CLAIMS });
      const check = await verifyFrame(signed.signed, { roots: ROOTS, sidecar: signed.sidecar ? signed.envelope : undefined });

      const buttons = signed.embedded
        ? [h("button", { class: "dpw-btn", type: "button", onclick: () => download(signedName(file.name), signed.signed) },
             `Download ${signedName(file.name)}`)]
        : [h("button", { class: "dpw-btn", type: "button", onclick: () => download(file.name + SIDECAR_SUFFIX, signed.sidecar) },
             `Download ${file.name}${SIDECAR_SUFFIX}`)];
      const note = signed.embedded
        ? "The signature is stored inside the CBF file."
        : `The signature is stored in a separate file. ${file.name} itself is unchanged; keep the two files together, and load both into the verifier above.`;
      out.append(
        resultCard(signed.embedded ? signedName(file.name) : `${file.name} + ${file.name}${SIDECAR_SUFFIX}`, check, signed.signed),
        h("div", { class: "dpw-row", style: "margin-top:12px" }, buttons),
        h("div", { class: "dpw-small", style: "margin-top:8px" }, note));
    } catch (e) {
      out.appendChild(h("div", { class: "dpw-error" }, `Signing failed: ${e.message}`));
    } finally {
      signBtn.disabled = !file;
    }
  }
  signBtn.addEventListener("click", sign);

  root.appendChild(h("div", { class: "dpw-box" },
    fileLoader({
      label: "Load a file",
      multiple: false,
      onFiles: (files) => {
        file = files[0];
        fileLine.textContent = `Loaded ${file.name} (${file.bytes.length.toLocaleString()} bytes).`;
        signBtn.disabled = false;
        out.replaceChildren();
      },
      hint: "or drop a file here. CBF files are signed in place; any other file gets a separate .framesig signature file. The file never leaves your browser.",
    }),
    fileLine,
    keyChoice,
    signBtn));
  root.appendChild(out);
  return cleanup;
}

export default { render };
