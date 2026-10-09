/**
 * SPEC §4, §6, §7, §9 -- the verification state machine.
 *
 * Every failure path here returns a result object. Nothing throws out of
 * `verifyFrame`: a malformed file is a verification outcome, not a crash, and a
 * viewer that dies on one bad frame in a folder of three thousand is useless.
 */

import { concat, decodeUtf8, equalBytes, fromBase64, utf8 } from "./bytes.js";
import * as cbf from "./cbf.js";
import { DOMAIN_MANIFEST, DOMAIN_SERIES, merkleLeaf, merkleVerify, sha256Label, stripLabel } from "./digest.js";
import { fromHex } from "./bytes.js";
import { describeSpki, importSpki, keyIdOf, parseCertificate, verifyChain } from "./x509.js";
import { ecdsaDerToRaw } from "./der.js";
import { assessAssurance, ASSURANCE_NONE, ASSURANCE_INSTRUMENT } from "./attestation.js";

export const SPEC_MANIFEST = "framesig/1";
export const SPEC_ENVELOPE = "framesig-envelope/1";
export const SPEC_SERIES = "framesig-series/1";
export const SPEC_SERIES_ENVELOPE = "framesig-series-envelope/1";

/**
 * SPEC §5.1 skeleton marker.
 *
 * SPEC-GAP 8 (an actual error, not an ambiguity): §5.1 calls this "the 19-byte
 * marker". It is 18 bytes -- one NUL, sixteen characters, one NUL. An
 * implementer who trusts the stated count and pads to 19 gets a skeleton digest
 * that never matches, on a file that is completely intact.
 */
const SKELETON_MARKER = concat(new Uint8Array([0]), utf8("FRAMESIG-PAYLOAD"), new Uint8Array([0]));

export const STATUS = {
  VALID: "valid",
  REPACKAGED: "repackaged",
  METADATA_MODIFIED: "metadata-modified",
  TAMPERED: "tampered",
  INVALID: "invalid",
  UNSIGNED: "unsigned",
};

function blank() {
  return {
    status: STATUS.UNSIGNED,
    signatureValid: false,
    bodyIntact: false,
    skeletonIntact: false,
    payloads: [],
    trustStatus: "unknown",
    trust: null,
    manifest: null,
    problems: [],
    notes: [],
    // What the signature proves about *origin*, as opposed to integrity.
    assurance: { level: ASSURANCE_NONE, mode: null, limits: [], instrument: {}, policyPen: null },
    // Intact AND instrument-attested. Integrity alone is not a pass: a
    // fabricated frame signed with a self-generated key is byte-perfect.
    provesInstrumentOrigin: false,
  };
}

/** SPEC §6.1. A verifier must not infer the algorithm from the key. */
async function verifySignature(spkiDer, algorithm, signature, message) {
  let imported;
  try {
    imported = await importSpki(spkiDer);
  } catch {
    return false;
  }
  try {
    if (algorithm === "Ed25519") {
      if (imported.kind !== "Ed25519") return false;
      return await crypto.subtle.verify("Ed25519", imported.key, signature, message);
    }
    if (algorithm === "ECDSA-P256-SHA256") {
      if (imported.kind !== "ECDSA-P256") return false;
      // SPEC-GAP 3: spec mandates DER, WebCrypto accepts only raw r‖s.
      const raw = ecdsaDerToRaw(signature, 32);
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        imported.key,
        raw,
        message
      );
    }
    return false;
  } catch {
    return false;
  }
}

function decodeEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("envelope is not an object");
  }
  if (envelope.spec !== SPEC_ENVELOPE) {
    throw new Error(`unsupported envelope spec ${JSON.stringify(envelope.spec ?? null)}`);
  }
  if (typeof envelope.manifest !== "string") {
    throw new Error("envelope has no manifest");
  }
  return fromBase64(envelope.manifest);
}

/**
 * Candidate keys, in the order the report should prefer them.
 *
 * SPEC-GAP 4: the spec describes `public_key` as making a file self-contained,
 * but never says what happens when the verifier also supplies a key. Treating
 * a supplied key as a *pin* -- verify under it and nothing else -- is the only
 * reading that makes supplying one a security control at all, since a forger
 * who re-signs also rewrites the file's embedded copy.
 */
async function candidateKeys(envelopeOrSeries, certs, pinnedSpkis, result) {
  if (pinnedSpkis.length) return pinnedSpkis.slice();
  if (certs.length) return [certs[0].spkiDer];
  if (typeof envelopeOrSeries.public_key === "string") {
    try {
      return [fromBase64(envelopeOrSeries.public_key)];
    } catch (e) {
      result.problems.push(`envelope carries an unreadable public key: ${e.message}`);
      return [];
    }
  }
  result.problems.push(
    "no public key available: the envelope carries neither a certificate nor a public key, and none was supplied"
  );
  return [];
}

function parseCerts(list, result) {
  const out = [];
  for (const b64 of list || []) {
    try {
      out.push(parseCertificate(fromBase64(b64)));
    } catch (e) {
      result.problems.push(`unreadable certificate in envelope: ${e.message}`);
    }
  }
  return out;
}

/** SPEC §7: series signature first, then the inclusion proof under its root. */
async function authenticateSeries(envelope, manifestBytes, pinnedSpkis, result) {
  const block = envelope.series;
  const seriesEnv = block && block.envelope;
  if (!seriesEnv || seriesEnv.spec !== SPEC_SERIES_ENVELOPE) {
    result.problems.push("frame carries no valid series envelope");
    return { certs: [], signingSpki: null };
  }
  const certs = parseCerts(seriesEnv.certificates, result);
  const keys = await candidateKeys(seriesEnv, certs, pinnedSpkis, result);

  let seriesBytes, signature, algorithm;
  try {
    seriesBytes = fromBase64(seriesEnv.manifest);
    signature = fromBase64(seriesEnv.signature.value);
    algorithm = seriesEnv.signature.alg;
  } catch (e) {
    result.problems.push(`malformed series envelope: ${e.message}`);
    return { certs, signingSpki: null };
  }

  const message = concat(DOMAIN_SERIES, seriesBytes);
  let signingSpki = null;
  for (const spki of keys) {
    if (await verifySignature(spki, algorithm, signature, message)) {
      signingSpki = spki;
      break;
    }
  }
  if (!signingSpki) {
    if (keys.length) result.problems.push("series signature does not verify");
    return { certs, signingSpki: null };
  }

  let seriesManifest;
  try {
    seriesManifest = JSON.parse(decodeUtf8(seriesBytes));
  } catch (e) {
    result.problems.push(`series manifest is not valid JSON: ${e.message}`);
    return { certs, signingSpki: null };
  }

  let root;
  try {
    root = fromHex(stripLabel(seriesManifest.merkle_root));
  } catch {
    result.problems.push("series manifest has a malformed Merkle root");
    return { certs, signingSpki: null };
  }

  const index = block.index;
  if (!Number.isInteger(index)) {
    result.problems.push("series block has no integer frame index");
    return { certs, signingSpki: null };
  }

  let included = false;
  try {
    included = await merkleVerify(await merkleLeaf(manifestBytes), index, block.proof || [], root);
  } catch (e) {
    result.problems.push(`malformed inclusion proof: ${e.message}`);
    return { certs, signingSpki: null };
  }
  if (!included) {
    result.problems.push(`frame does not prove membership at index ${index} of the signed series`);
    return { certs, signingSpki: null };
  }

  result.signatureValid = true;
  result.notes.push(
    `covered by signed series ${JSON.stringify(seriesManifest.series_id)} ` +
      `(${seriesManifest.count} frames), frame index ${index}`
  );
  result.seriesManifest = seriesManifest;
  result.seriesIndex = index;
  return { certs, signingSpki, seriesManifest, index };
}

/** SPEC §9: the trust axis, kept separate from the integrity axis. */
async function assessTrust(certs, roots, signingSpki, manifest, result, atTime) {
  if (!certs.length) {
    if (signingSpki) {
      const kid = await keyIdOf(signingSpki);
      if (kid === manifest?.signer?.key_id) return { status: "bare-key", chain: null };
      result.problems.push("signer.key_id does not match the verifying key");
      return { status: "key-mismatch", chain: null };
    }
    return { status: "unknown", chain: null };
  }
  const leaf = certs[0];
  if (signingSpki && !equalBytes(leaf.spkiDer, signingSpki)) {
    result.problems.push("leaf certificate does not hold the signing key");
    return { status: "key-mismatch", chain: null };
  }
  if (!roots.length) {
    result.notes.push("no trust anchor supplied; the certificate chain was not validated");
    return { status: "unvalidated", chain: null };
  }
  let when = atTime;
  if (!when && manifest?.created) {
    const parsed = new Date(manifest.created);
    if (!Number.isNaN(parsed.getTime())) {
      when = parsed;
      result.notes.push(
        "chain validated at the manifest's self-declared creation time; " +
          "without an RFC 3161 timestamp that time is an unverified claim"
      );
    }
  }
  const chain = await verifyChain(leaf, certs.slice(1), roots, when || new Date());
  if (chain.ok) return { status: "trusted", chain };
  result.problems.push(chain.reason || "certificate chain did not validate");
  return { status: "untrusted", chain };
}

async function comparePayloads(base, payloads, recorded, result) {
  const reports = [];
  if (recorded.length !== payloads.length) {
    return [
      {
        id: "*",
        storedOk: false,
        canonicalOk: false,
        problem: `payload count changed: signed ${recorded.length}, file now has ${payloads.length}`,
      },
    ];
  }
  for (let k = 0; k < payloads.length; k++) {
    const p = payloads[k];
    const rec = recorded[k] || {};
    const stored = await sha256Label(base.subarray(p.start, p.end));
    const report = { id: rec.id ?? p.id, storedOk: stored === rec.stored, canonicalOk: false };
    if (report.storedOk) {
      report.canonicalOk = true;
    } else if (rec.canonical_form === "opaque") {
      report.canonicalOk = false; // an opaque payload has no value-level fallback
    } else {
      try {
        const { form, bytes } = cbf.canonicalPayloadStream(base, p);
        const digest = await sha256Label(bytes);
        report.canonicalOk = form === rec.canonical_form && digest === rec.canonical;
      } catch (e) {
        report.problem = `cannot decode payload to compare values: ${e.message}`;
      }
    }
    if (rec.id !== undefined && String(rec.id) !== String(p.id)) {
      report.problem = `binary id changed: signed ${JSON.stringify(rec.id)}, now ${JSON.stringify(p.id)}`;
    }
    reports.push(report);
  }
  return reports;
}

/**
 * Verify one frame.
 *
 * @param {Uint8Array} bytes         the file as stored
 * @param {object}   opts
 * @param {object}   [opts.sidecar]  parsed sidecar envelope, if the file has one
 * @param {Array}    [opts.roots]    parsed trust anchors
 * @param {Array}    [opts.pinnedKeys] DER SPKIs supplied by the verifier
 * @param {Date}     [opts.atTime]   instant to validate the chain at
 */
export async function verifyFrame(bytes, opts = {}) {
  const result = blank();
  const roots = opts.roots || [];
  const pinnedSpkis = opts.pinnedKeys || [];

  // -- locate the envelope ------------------------------------------------
  let base = bytes;
  let envelope = null;
  try {
    const offset = cbf.findBlockOffset(bytes);
    if (offset !== null) {
      // A block that is present but unreadable is a failure, not an absence.
      envelope = JSON.parse(decodeUtf8(cbf.readBlock(bytes.subarray(offset))));
      base = bytes.subarray(0, offset);
      result.notes.push("signature source: embedded");
    } else if (opts.sidecar) {
      envelope = opts.sidecar;
      result.notes.push("signature source: sidecar");
    }
  } catch (e) {
    result.status = STATUS.INVALID;
    result.problems.push(`the embedded signature block is malformed: ${e.message}`);
    return result;
  }
  if (!envelope) {
    result.problems.push("no signature found: no embedded framesig block and no sidecar");
    return result;
  }

  // -- authenticate -------------------------------------------------------
  let manifestBytes;
  try {
    manifestBytes = decodeEnvelope(envelope);
  } catch (e) {
    result.status = STATUS.INVALID;
    result.problems.push(e.message);
    return result;
  }

  let certs = [];
  let signingSpki = null;
  const isSeries =
    envelope.series && typeof envelope.series === "object" && envelope.signature === undefined;
  try {
    if (isSeries) {
      ({ certs, signingSpki } = await authenticateSeries(envelope, manifestBytes, pinnedSpkis, result));
    } else {
      certs = parseCerts(envelope.certificates, result);
      const keys = await candidateKeys(envelope, certs, pinnedSpkis, result);
      let signature, algorithm;
      try {
        signature = fromBase64(envelope.signature.value);
        algorithm = envelope.signature.alg;
      } catch (e) {
        result.status = STATUS.INVALID;
        result.problems.push(`malformed envelope signature: ${e.message}`);
        return result;
      }
      const message = concat(DOMAIN_MANIFEST, manifestBytes);
      for (const spki of keys) {
        if (await verifySignature(spki, algorithm, signature, message)) {
          result.signatureValid = true;
          signingSpki = spki;
          break;
        }
      }
      if (!result.signatureValid && keys.length) {
        result.problems.push("signature does not verify under any available public key");
      }
    }
  } catch (e) {
    result.status = STATUS.INVALID;
    result.problems.push(`could not authenticate: ${e.message}`);
    return result;
  }

  // -- parse the manifest, only after the signature has been checked ------
  let manifest;
  try {
    manifest = JSON.parse(decodeUtf8(manifestBytes));
  } catch (e) {
    result.status = STATUS.INVALID;
    result.problems.push(`manifest is not valid JSON: ${e.message}`);
    return result;
  }
  result.manifest = manifest;
  if (manifest.spec !== SPEC_MANIFEST) {
    result.problems.push(`unsupported manifest spec ${JSON.stringify(manifest.spec ?? null)}`);
  }

  // -- integrity ----------------------------------------------------------
  const declared = manifest.signed_length;
  if (declared !== base.length) {
    result.problems.push(
      `signed_length mismatch: manifest says ${declared}, file offers ${base.length} bytes`
    );
  }

  try {
    // SPEC §5: `profile` selects how payloads are discovered. `raw/1` (SPEC §11)
    // treats the whole file as one opaque payload; `cbf/1` scans binary
    // sections. Choosing by profile rather than by sniffing matters: a CBF
    // signed under the raw profile must be checked the way it was signed.
    const payloads =
      manifest.profile === "raw/1"
        ? [{ id: "file", start: 0, end: base.length, length: base.length, encoding: "none", elementType: "opaque", byteOrder: "little", dimensions: [], nElements: null }]
        : cbf.scanPayloads(base, base.length);
    const digests = manifest.digests || {};
    result.bodyIntact = declared === base.length && (await sha256Label(base)) === digests.body;

    const segments = [];
    let pos = 0;
    for (const p of payloads) {
      segments.push(base.subarray(pos, p.start), SKELETON_MARKER);
      pos = p.end;
    }
    segments.push(base.subarray(pos));
    result.skeletonIntact = (await sha256Label(...segments)) === digests.skeleton;
    result.payloads = await comparePayloads(base, payloads, manifest.payloads || [], result);
  } catch (e) {
    result.problems.push(`file no longer parses as CBF: ${e.message}`);
    result.status = result.signatureValid ? STATUS.TAMPERED : STATUS.INVALID;
    const trustFailed = await assessTrust(certs, roots, signingSpki, manifest, result, opts.atTime);
    result.trustStatus = trustFailed.status;
    result.trust = trustFailed.chain;
    finish(result, certs, manifest);
    return result;
  }

  const trust = await assessTrust(certs, roots, signingSpki, manifest, result, opts.atTime);
  result.trustStatus = trust.status;
  result.trust = trust.chain;

  /**
   * SPEC-GAP 5: §9 lists the axes a verifier must report and names the six
   * statuses the reference implementation collapses them into, but never gives
   * the mapping. Two conforming verifiers could disagree about whether a
   * recompressed frame is `repackaged` or `valid`. Derived here as below, and
   * cross-checked against the reference vectors.
   */
  if (!result.signatureValid) result.status = STATUS.INVALID;
  else if (result.bodyIntact) result.status = STATUS.VALID;
  else if (result.payloads.length && result.payloads.every((p) => p.canonicalOk)) {
    result.status = result.skeletonIntact ? STATUS.REPACKAGED : STATUS.METADATA_MODIFIED;
  } else result.status = STATUS.TAMPERED;

  finish(result, certs, manifest);
  return result;
}

/**
 * SPEC §9.1: origin is assessed separately from integrity, and only once the
 * signature itself has been checked. A perfectly intact frame can still be
 * worth nothing as evidence of where it came from.
 */
function finish(result, certs, manifest) {
  result.assurance = assessAssurance({
    signatureValid: result.signatureValid,
    trustStatus: result.trustStatus,
    certificates: certs,
    manifest,
  });
  result.provesInstrumentOrigin =
    (result.status === STATUS.VALID || result.status === STATUS.REPACKAGED) &&
    result.assurance.level === ASSURANCE_INSTRUMENT;
}

export { cbf };
