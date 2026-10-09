/**
 * X.509 certificate parsing and linear chain validation.
 *
 * Deliberately the same reduced scope as the Python `pki.py`, so that the two
 * implementations agree on what they refuse as well as what they accept:
 * no name constraints, no policies, no path-length beyond basicConstraints
 * CA:TRUE, no alternative-path search, no revocation.
 */

import { equalBytes, fromBase64, toHex } from "./bytes.js";
import { bitStringBytes, childList, readOID, readTime, readTLV, TAG, ecdsaDerToRaw } from "./der.js";
import { sha256 } from "./digest.js";

const OID = {
  ED25519: "1.3.101.112",
  EC_PUBLIC_KEY: "1.2.840.10045.2.1",
  P256: "1.2.840.10045.3.1.7",
  ECDSA_SHA256: "1.2.840.10045.4.3.2",
  ECDSA_SHA384: "1.2.840.10045.4.3.3",
  ECDSA_SHA512: "1.2.840.10045.4.3.4",
  BASIC_CONSTRAINTS: "2.5.29.19",
  CERTIFICATE_POLICIES: "2.5.29.32",
};

const ATTR_NAMES = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "0.9.2342.19200300.100.1.25": "DC",
  "0.9.2342.19200300.100.1.1": "UID",
};

/** Render a Name as an RFC 4514 string (most specific first). */
function nameToString(nameTLV) {
  const rdns = [];
  for (const rdn of childList(nameTLV.contents)) {
    for (const attr of childList(rdn.contents)) {
      const [typeTLV, valueTLV] = childList(attr.contents);
      const oid = readOID(typeTLV.contents);
      const key = ATTR_NAMES[oid] || oid;
      const value = new TextDecoder().decode(valueTLV.contents).replace(/([,+"\\<>;])/g, "\\$1");
      rdns.push(`${key}=${value}`);
    }
  }
  return rdns.reverse().join(",");
}

export function parseCertificate(der) {
  const cert = readTLV(der, 0);
  if (cert.tag !== TAG.SEQUENCE) throw new Error("certificate is not a SEQUENCE");
  const [tbs, sigAlg, sigValue] = childList(cert.contents);

  const tbsChildren = childList(tbs.contents);
  let i = 0;
  // Optional [0] EXPLICIT version.
  if ((tbsChildren[0].tag & 0xc0) === 0x80 && (tbsChildren[0].tag & 0x1f) === 0) i = 1;
  i += 1; // serialNumber
  i += 1; // signature AlgorithmIdentifier
  const issuer = tbsChildren[i++];
  const validity = tbsChildren[i++];
  const subject = tbsChildren[i++];
  const spki = tbsChildren[i++];

  const [notBeforeTLV, notAfterTLV] = childList(validity.contents);

  let isCA = false;
  const policies = [];
  for (const rest of tbsChildren.slice(i)) {
    if ((rest.tag & 0xc0) !== 0x80 || (rest.tag & 0x1f) !== 3) continue;
    const extensions = childList(readTLV(rest.contents, 0).contents);
    for (const ext of extensions) {
      const parts = childList(ext.contents);
      const extOid = readOID(parts[0].contents);
      const octets = parts[parts.length - 1];
      if (extOid === OID.BASIC_CONSTRAINTS) {
        const bcParts = childList(readTLV(octets.contents, 0).contents);
        isCA = bcParts.length > 0 && bcParts[0].tag === TAG.BOOLEAN && bcParts[0].contents[0] !== 0;
      } else if (extOid === OID.CERTIFICATE_POLICIES) {
        // Each PolicyInformation is SEQUENCE { policyIdentifier OID, qualifiers? }.
        // The policy OID is what carries the manufacturer's instrument
        // attestation, so it decides whether a signature proves origin at all.
        for (const info of childList(readTLV(octets.contents, 0).contents)) {
          const idTLV = childList(info.contents)[0];
          if (idTLV && idTLV.tag === TAG.OID) policies.push(readOID(idTLV.contents));
        }
      }
    }
  }

  const [algOidTLV] = childList(sigAlg.contents);

  return {
    der,
    tbsBytes: tbs.full,
    issuerDer: issuer.full,
    subjectDer: subject.full,
    issuer: nameToString(issuer),
    subject: nameToString(subject),
    notBefore: readTime(notBeforeTLV),
    notAfter: readTime(notAfterTLV),
    spkiDer: spki.full,
    signatureAlgorithm: readOID(algOidTLV.contents),
    signature: bitStringBytes(sigValue.contents),
    isCA,
    policies,
  };
}

/** What kind of key does this SPKI hold? Returns {kind, importParams}. */
export function describeSpki(spkiDer) {
  const spki = readTLV(spkiDer, 0);
  const [algSeq] = childList(spki.contents);
  const algParts = childList(algSeq.contents);
  const algorithm = readOID(algParts[0].contents);
  if (algorithm === OID.ED25519) {
    return { kind: "Ed25519", importParams: { name: "Ed25519" } };
  }
  if (algorithm === OID.EC_PUBLIC_KEY) {
    const curve = algParts[1] ? readOID(algParts[1].contents) : null;
    if (curve !== OID.P256) throw new Error(`unsupported EC curve OID ${curve}`);
    return {
      kind: "ECDSA-P256",
      importParams: { name: "ECDSA", namedCurve: "P-256" },
    };
  }
  throw new Error(`unsupported public key algorithm OID ${algorithm}`);
}

/** SPEC §5: key_id is sha256 over the DER SubjectPublicKeyInfo. */
export async function keyIdOf(spkiDer) {
  return "sha256:" + toHex(await sha256(spkiDer));
}

export async function importSpki(spkiDer) {
  const { kind, importParams } = describeSpki(spkiDer);
  const key = await crypto.subtle.importKey("spki", spkiDer, importParams, true, ["verify"]);
  return { key, kind };
}

/** Verify one certificate's signature under its issuer's public key. */
async function certificateSignatureOk(cert, issuerSpkiDer) {
  let imported;
  try {
    imported = await importSpki(issuerSpkiDer);
  } catch {
    return false;
  }
  try {
    if (cert.signatureAlgorithm === OID.ED25519) {
      if (imported.kind !== "Ed25519") return false;
      return await crypto.subtle.verify("Ed25519", imported.key, cert.signature, cert.tbsBytes);
    }
    const hash = {
      [OID.ECDSA_SHA256]: "SHA-256",
      [OID.ECDSA_SHA384]: "SHA-384",
      [OID.ECDSA_SHA512]: "SHA-512",
    }[cert.signatureAlgorithm];
    if (!hash || imported.kind !== "ECDSA-P256") return false;
    const raw = ecdsaDerToRaw(cert.signature, 32);
    return await crypto.subtle.verify({ name: "ECDSA", hash }, imported.key, raw, cert.tbsBytes);
  } catch {
    return false;
  }
}

/** Read one or more PEM certificates out of a text blob. */
export function parsePem(text) {
  const out = [];
  const re = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(parseCertificate(fromBase64(m[1].replace(/\s+/g, ""))));
  }
  if (out.length === 0) throw new Error("no PEM certificate found in this file");
  return out;
}

/**
 * Walk from `leaf` to any certificate in `roots`.
 *
 * `atTime` is the instant the chain must have been valid at. Passing the
 * signature's claimed time rather than "now" is what keeps an archived frame
 * verifiable after the detector certificate expires -- with the caveat, which
 * the report states, that without an RFC 3161 token that time is unverified.
 */
export async function verifyChain(leaf, intermediates, roots, atTime = new Date()) {
  const bySubject = new Map();
  for (const c of [...intermediates, ...roots]) {
    const key = toHex(c.subjectDer);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(c);
  }
  const rootSet = new Set(roots.map((c) => toHex(c.der)));

  const chain = [leaf];
  let current = leaf;
  for (let depth = 0; depth < 8; depth++) {
    if (!(current.notBefore <= atTime && atTime <= current.notAfter)) {
      return {
        ok: false,
        reason:
          `certificate "${current.subject}" not valid at ${atTime.toISOString()} ` +
          `(valid ${current.notBefore.toISOString()} .. ${current.notAfter.toISOString()})`,
        chain: chain.map((c) => c.subject),
      };
    }
    if (rootSet.has(toHex(current.der))) {
      return {
        ok: true,
        reason: null,
        chain: chain.map((c) => c.subject),
        rootSubject: current.subject,
      };
    }
    let issuer = null;
    for (const candidate of bySubject.get(toHex(current.issuerDer)) || []) {
      if (!candidate.isCA) continue;
      if (await certificateSignatureOk(current, candidate.spkiDer)) {
        issuer = candidate;
        break;
      }
    }
    if (!issuer) {
      return {
        ok: false,
        reason: `no trusted issuer found for "${current.subject}" (issuer "${current.issuer}")`,
        chain: chain.map((c) => c.subject),
      };
    }
    chain.push(issuer);
    current = issuer;
  }
  return { ok: false, reason: "certificate chain too long", chain: chain.map((c) => c.subject) };
}

export function spkiEqual(a, b) {
  return equalBytes(a, b);
}
