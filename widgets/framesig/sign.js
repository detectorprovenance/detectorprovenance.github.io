/**
 * SPEC §2, §5, §6, §10.2, §11 -- signing, in the browser.
 *
 * The second signer of the spec, alongside the reference implementation in
 * `src/framesig/api.py`. It produces the same manifest, envelope, embedded
 * block and sidecar, so a frame signed here verifies under the Python
 * verifier and the other way round (see `web/signtest.mjs` and
 * `tests/test_js_signer.py`).
 *
 * Only ECDSA P-256 is offered: it is what TPMs and detector secure elements
 * implement, and WebCrypto supports it in every current browser.
 *
 * Nothing here talks to a network. The data, the key and the signature stay
 * in the page.
 */

import { concat, toBase64, utf8 } from "./bytes.js";
import * as cbf from "./cbf.js";
import { ecdsaDerToRaw, ecdsaRawToDer } from "./der.js";
import { DOMAIN_MANIFEST, sha256Label } from "./digest.js";
import { keyIdOf, parseCertificate } from "./x509.js";

export const SPEC_MANIFEST = "framesig/1";
export const SPEC_ENVELOPE = "framesig-envelope/1";
export const ALG_ECDSA_P256 = "ECDSA-P256-SHA256";
export const PROFILE_RAW = "raw/1";
export const SIDECAR_SUFFIX = ".framesig";

/** Written into every manifest this module signs (SPEC §5 `software`). */
export const SOFTWARE = { name: "framesig-js", version: "0.2.0" };

const SKELETON_MARKER = concat(new Uint8Array([0]), utf8("FRAMESIG-PAYLOAD"), new Uint8Array([0]));
const MAX_SAFE_INT = 9007199254740991;
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SHA256 = { name: "ECDSA", hash: "SHA-256" };

// --------------------------------------------------------------------------
// SPEC §2: canonical JSON (RFC 8785, restricted: no floats, safe integers)
// --------------------------------------------------------------------------

function writeCanonical(value, out) {
  if (value === null) out.push("null");
  else if (value === true) out.push("true");
  else if (value === false) out.push("false");
  else if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("floats are not permitted in a framesig manifest; use an integer with a unit, or a string");
    }
    if (Math.abs(value) > MAX_SAFE_INT) throw new Error(`integer ${value} outside the JSON-safe range`);
    out.push(String(value));
  } else if (typeof value === "string") {
    out.push(JSON.stringify(value));
  } else if (Array.isArray(value)) {
    out.push("[");
    value.forEach((item, i) => {
      if (i) out.push(",");
      writeCanonical(item, out);
    });
    out.push("]");
  } else if (typeof value === "object") {
    // The default string sort compares UTF-16 code units, which is the
    // RFC 8785 member order.
    const keys = Object.keys(value).sort();
    out.push("{");
    keys.forEach((key, i) => {
      if (i) out.push(",");
      out.push(JSON.stringify(key), ":");
      writeCanonical(value[key], out);
    });
    out.push("}");
  } else {
    throw new Error(`cannot canonicalise a value of type ${typeof value}`);
  }
}

export function canonicalize(value) {
  const out = [];
  writeCanonical(value, out);
  return utf8(out.join(""));
}

// --------------------------------------------------------------------------
// keys
// --------------------------------------------------------------------------

/**
 * A signer is `{ algorithm, spki, keyId, sign(message) -> DER signature,
 * certificates: [DER, ...], subject }`. `certificates` is empty for a bare key.
 */
async function makeSigner(privateKey, spki, certificates = [], subject = null) {
  const publicKey = await crypto.subtle.importKey("spki", spki, ECDSA, false, ["verify"]);
  return {
    algorithm: ALG_ECDSA_P256,
    spki,
    keyId: await keyIdOf(spki),
    certificates,
    subject,
    async sign(message) {
      const raw = new Uint8Array(await crypto.subtle.sign(ECDSA_SHA256, privateKey, message));
      return ecdsaRawToDer(raw, 32);
    },
    async verify(signature, message) {
      return crypto.subtle.verify(ECDSA_SHA256, publicKey, ecdsaDerToRaw(signature, 32), message);
    },
  };
}

/** A fresh key that exists only in this page. It chains to nothing (self-attested). */
export async function generateSigner() {
  const pair = await crypto.subtle.generateKey(ECDSA, false, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return makeSigner(pair.privateKey, spki);
}

/**
 * A signer from a PKCS#8 private key and its certificate chain, leaf first.
 * The leaf's public key must belong to the private key; checked by signing a
 * probe, since WebCrypto cannot derive a public key from a private one.
 */
export async function importSigner(pkcs8, certificates, subject = null) {
  if (!certificates || !certificates.length) throw new Error("importSigner needs a certificate chain");
  const leaf = parseCertificate(certificates[0]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, ECDSA, false, ["sign"]);
  const signer = await makeSigner(privateKey, leaf.spkiDer, certificates, subject || leaf.subject);
  const probe = utf8("framesig key check");
  if (!(await signer.verify(await signer.sign(probe), probe))) {
    throw new Error("the private key does not match the leaf certificate");
  }
  return signer;
}

// --------------------------------------------------------------------------
// SPEC §5: digests and the manifest
// --------------------------------------------------------------------------

function rawPayloads(base) {
  return [{ id: "file", start: 0, end: base.length, length: base.length, encoding: "none",
            elementType: "opaque", byteOrder: "little", dimensions: [], nElements: null }];
}

/** `(body, skeleton, payload records)` for the bytes that will be signed. */
export async function computeDigests(base, profile) {
  const payloads = profile === PROFILE_RAW ? rawPayloads(base) : cbf.scanPayloads(base, base.length);
  const body = await sha256Label(base);
  const segments = [];
  let pos = 0;
  for (const p of payloads) {
    segments.push(base.subarray(pos, p.start), SKELETON_MARKER);
    pos = p.end;
  }
  segments.push(base.subarray(pos));
  const skeleton = await sha256Label(...segments);

  const records = [];
  for (const p of payloads) {
    const stored = await sha256Label(base.subarray(p.start, p.end));
    let form, canonical;
    if (profile === PROFILE_RAW) {
      form = "opaque";
      canonical = stored;
    } else {
      try {
        const c = cbf.canonicalPayloadStream(base, p);
        form = c.form;
        canonical = await sha256Label(c.bytes);
      } catch (e) {
        // As in the reference implementation: an undecodable payload does not
        // block signing, and the manifest says so instead of pretending.
        form = "unavailable";
        canonical = "unavailable:" + e.message;
      }
    }
    const rec = {
      id: String(p.id),
      offset: p.start,
      length: p.end - p.start,
      encoding: p.encoding,
      element_type: p.elementType,
      stored,
      canonical_form: form,
      canonical,
    };
    if (p.dimensions && p.dimensions.length) rec.dimensions = p.dimensions.slice();
    if (p.nElements !== null && p.nElements !== undefined) rec.n_elements = p.nElements;
    records.push(rec);
  }
  return { body, skeleton, records };
}

function utcNow() {
  return new Date().toISOString().slice(0, 19) + "Z";
}

// --------------------------------------------------------------------------
// SPEC §10.2: the CBF signature block
// --------------------------------------------------------------------------

/** The bytes that get signed: any old block removed, newline-terminated. */
export function cbfBase(data) {
  const offset = cbf.findBlockOffset(data);
  let base = offset === null ? data : data.subarray(0, offset);
  if (base.length && base[base.length - 1] !== 0x0a) base = concat(base, new Uint8Array([0x0a]));
  return base;
}

export function makeBlock(envelopeJson) {
  const b64 = toBase64(envelopeJson);
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  if (!lines.length) lines.push("");
  return utf8(["###FRAMESIG-BLOCK-V1", "data_framesig", "_framesig.envelope", ";", ...lines, ";", ""].join("\n"));
}

// --------------------------------------------------------------------------
// signing
// --------------------------------------------------------------------------

/**
 * Sign a file's bytes.
 *
 * CBF files get the signature appended as a block (SPEC §10.2) unless
 * `embed: false`; every other file gets a sidecar (SPEC §11) and is left
 * byte-for-byte unchanged.
 *
 * Returns `{ profile, embedded, signed, sidecar, manifest, manifestBytes,
 * envelope }`: `signed` is the file to save (the input itself for a sidecar
 * signature) and `sidecar` is the `.framesig` contents, or null.
 */
export async function signFile(data, signer, { embed = true, claims = null, attestation = null, created = null } = {}) {
  const isCbf = cbf.sniff(data);
  const profile = isCbf ? cbf.PROFILE : PROFILE_RAW;
  const embedded = isCbf && embed;
  const base = isCbf ? cbfBase(data) : data;

  const { body, skeleton, records } = await computeDigests(base, profile);
  const signerInfo = { key_id: signer.keyId, alg: signer.algorithm };
  if (signer.certificates.length && signer.subject) signerInfo.subject = signer.subject;

  const manifest = {
    spec: SPEC_MANIFEST,
    profile,
    created: created || utcNow(),
    signed_length: base.length,
    digests: { body, skeleton },
    payloads: records,
    signer: signerInfo,
    software: { ...SOFTWARE },
  };
  if (attestation) manifest.attestation = attestation;
  if (claims) manifest.claims = claims;

  const manifestBytes = canonicalize(manifest);
  const message = concat(DOMAIN_MANIFEST, manifestBytes);
  const signature = await signer.sign(message);
  // Emitting a signature nobody can verify is worse than failing to sign.
  if (!(await signer.verify(signature, message))) throw new Error("the new signature does not verify");

  const envelope = {
    spec: SPEC_ENVELOPE,
    manifest: toBase64(manifestBytes),
    signature: { alg: signer.algorithm, value: toBase64(signature) },
  };
  if (signer.certificates.length) envelope.certificates = signer.certificates.map(toBase64);
  else envelope.public_key = toBase64(signer.spki);

  if (embedded) {
    return { profile, embedded, signed: concat(base, makeBlock(canonicalize(envelope))), sidecar: null,
             manifest, manifestBytes, envelope };
  }
  // With a sidecar the file to keep is `base`: identical to the input for any
  // non-CBF file, and for a CBF differing only by an old block or a missing
  // final newline, exactly as the reference implementation rewrites it.
  return { profile, embedded, signed: base, sidecar: utf8(JSON.stringify(envelope, null, 2) + "\n"),
           manifest, manifestBytes, envelope };
}
