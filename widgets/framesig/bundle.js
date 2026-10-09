/**
 * SPEC §12 -- bundles: one signed statement about a set of already-signed frames.
 *
 * This is the referee's view. Given a deposition and its bundle, the questions
 * are: is this the set the authors signed, are any frames missing or added, and
 * what is the weakest thing any member proves.
 *
 * The property that keeps this from becoming a laundering tool: **a bundle can
 * never raise the assurance of its members.** A beautifully signed bundle from
 * a reputable operator wrapped around fabricated, self-attested frames must
 * still report those frames as self-attested. So two floors are reported: the
 * one the bundle claims, and the one actually observed from the frames on hand.
 */

import { concat, decodeUtf8, fromBase64, fromHex, toHex, utf8 } from "./bytes.js";
import { sha256 } from "./digest.js";
import { ASSURANCE_NONE, ASSURANCE_ORDER } from "./attestation.js";
import { importSpki, parseCertificate } from "./x509.js";
import { ecdsaDerToRaw } from "./der.js";

export const BUNDLE_SPEC = "framesig-bundle/1";
export const BUNDLE_ENVELOPE_SPEC = "framesig-bundle-envelope/1";

const NUL = new Uint8Array([0x00]);
/** Distinct from the frame and series prefixes: no signature is replayable. */
export const DOMAIN_BUNDLE = concat(utf8("framesig/1"), NUL, utf8("bundle"), NUL);

const LEAF = new Uint8Array([0x00]);
const NODE = new Uint8Array([0x01]);

/** A frame's identity within a bundle: the digest of its signed manifest. */
export async function memberOf(manifestBytes) {
  return "sha256:" + toHex(await sha256(manifestBytes));
}

async function merkleRoot(leaves) {
  if (!leaves.length) throw new Error("a Merkle tree needs at least one leaf");
  let level = [];
  for (const leaf of leaves) level.push(await sha256(LEAF, leaf));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(await sha256(NODE, level[i], level[i + 1]));
    }
    // Odd node promoted unchanged, never duplicated (CVE-2012-2459).
    if (level.length % 2) next.push(level[level.length - 1]);
    level = next;
  }
  return level[0];
}

async function membersRoot(digests) {
  const sorted = [...digests].sort();
  return "sha256:" + toHex(await merkleRoot(sorted.map((d) => fromHex(d.split(":")[1]))));
}

function weakest(levels) {
  const list = [...levels];
  if (!list.length) return ASSURANCE_NONE;
  return list.reduce((a, b) => (ASSURANCE_ORDER.indexOf(a) <= ASSURANCE_ORDER.indexOf(b) ? a : b));
}

async function verifyOver(spkiDer, algorithm, signature, message) {
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
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        imported.key,
        ecdsaDerToRaw(signature, 32),
        message
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {object} envelope  the parsed bundle file
 * @param {Map<string,{name:string,assurance:string}>|null} found
 *        manifest digest -> what the caller actually verified
 * @param {Uint8Array[]} pinnedKeys  DER SPKIs supplied out of band
 */
export async function verifyBundle(envelope, { found = null, pinnedKeys = [] } = {}) {
  const report = {
    signatureValid: false,
    bundle: null,
    problems: [],
    notes: [],
    present: [],
    missing: [],
    unexpected: [],
    renamed: [],
    memberAssuranceFloor: ASSURANCE_NONE,
    observedAssuranceFloor: null,
    complete: false,
  };

  if (!envelope || typeof envelope !== "object" || envelope.spec !== BUNDLE_ENVELOPE_SPEC) {
    report.problems.push("not a bundle envelope");
    return report;
  }

  let bundleBytes, signature, algorithm;
  try {
    bundleBytes = fromBase64(envelope.manifest);
    signature = fromBase64(envelope.signature.value);
    algorithm = envelope.signature.alg;
  } catch (e) {
    report.problems.push(`malformed bundle envelope: ${e.message}`);
    return report;
  }

  // Pinning beats the file's own key, for the same reason as for frames: a
  // forger who re-signs also rewrites the copy the file carries.
  let keys = [...pinnedKeys];
  if (!keys.length && envelope.certificates && envelope.certificates.length) {
    try {
      keys.push(parseCertificate(fromBase64(envelope.certificates[0])).spkiDer);
    } catch (e) {
      report.problems.push(`unreadable certificate in bundle: ${e.message}`);
    }
  } else if (!keys.length && envelope.public_key) {
    try {
      keys.push(fromBase64(envelope.public_key));
    } catch (e) {
      report.problems.push(`unreadable public key in bundle: ${e.message}`);
    }
  }

  const message = concat(DOMAIN_BUNDLE, bundleBytes);
  for (const spki of keys) {
    if (await verifyOver(spki, algorithm, signature, message)) {
      report.signatureValid = true;
      break;
    }
  }
  if (!report.signatureValid) report.problems.push("bundle signature does not verify");

  let bundle;
  try {
    bundle = JSON.parse(decodeUtf8(bundleBytes));
  } catch (e) {
    report.problems.push(`bundle manifest is not valid JSON: ${e.message}`);
    return report;
  }
  report.bundle = bundle;
  if (bundle.spec !== BUNDLE_SPEC) {
    report.problems.push(`unsupported bundle spec ${JSON.stringify(bundle.spec ?? null)}`);
  }

  const entries = bundle.members || [];
  const digests = entries.map((e) => e.m).filter(Boolean);
  if (digests.length && bundle.members_root !== (await membersRoot(digests))) {
    report.problems.push(
      "members_root does not match the member list; the bundle is internally inconsistent"
    );
  }
  if ((bundle.counts || {}).frames !== entries.length) {
    report.problems.push(
      `counts.frames says ${(bundle.counts || {}).frames} but the member list holds ${entries.length}`
    );
  }
  report.memberAssuranceFloor = bundle.member_assurance_floor || ASSURANCE_NONE;

  if (!found) {
    report.notes.push("no frames supplied; membership was not checked");
    return report;
  }

  const byDigest = new Map(entries.filter((e) => e.m).map((e) => [e.m, e]));
  for (const [digest, entry] of byDigest) {
    const actual = found.get(digest);
    if (!actual) {
      report.missing.push({ name: entry.n, digest });
      continue;
    }
    report.present.push({ name: actual.name, digest });
    if (entry.n && actual.name && entry.n !== actual.name) {
      report.renamed.push({ signedAs: entry.n, foundAs: actual.name });
    }
  }
  for (const [digest, actual] of found) {
    if (!byDigest.has(digest)) report.unexpected.push({ name: actual.name, digest });
  }

  // Recomputed from the frames on hand, never taken from the bundle: what the
  // bundle says about its members is a claim by whoever signed the bundle.
  report.observedAssuranceFloor = weakest([...found.values()].map((v) => v.assurance));
  report.complete =
    report.signatureValid &&
    !report.missing.length &&
    !report.unexpected.length &&
    !report.problems.length;
  return report;
}
