/**
 * Minimal DER reader.
 *
 * WebCrypto does not parse X.509 at all -- it will import a SubjectPublicKeyInfo
 * and verify a signature, and that is the whole of its help. Everything between
 * "here is a certificate chain" and "here is a public key to verify with" has to
 * be done by hand. This file is that, kept to the smallest surface that SPEC §6
 * and §10 need, rather than a general ASN.1 library.
 */

const CLASS_MASK = 0xc0;
const CONSTRUCTED = 0x20;
const TAG_MASK = 0x1f;

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
};

/**
 * Parse one TLV at `offset`.
 * Returns {tag, headerLength, length, start, end, contents, full}.
 * `full` spans the tag through the last content byte -- needed because a
 * certificate's signature is computed over the *encoded* tbsCertificate,
 * header included, not over its contents.
 */
export function readTLV(bytes, offset = 0) {
  if (offset + 2 > bytes.length) throw new Error("DER: truncated at tag");
  let tag = bytes[offset];
  let p = offset + 1;
  if ((tag & TAG_MASK) === TAG_MASK) throw new Error("DER: multi-byte tags unsupported");

  let length = bytes[p++];
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0) throw new Error("DER: indefinite length is not valid DER");
    if (n > 4) throw new Error("DER: length too large");
    length = 0;
    for (let i = 0; i < n; i++) {
      if (p >= bytes.length) throw new Error("DER: truncated length");
      length = length * 256 + bytes[p++];
    }
  }
  const start = p;
  const end = start + length;
  if (end > bytes.length) throw new Error("DER: truncated contents");
  return {
    tag,
    constructed: (tag & CONSTRUCTED) !== 0,
    headerLength: start - offset,
    length,
    start,
    end,
    contents: bytes.subarray(start, end),
    full: bytes.subarray(offset, end),
  };
}

/** Iterate the direct children of a constructed TLV's contents. */
export function* children(contents) {
  let offset = 0;
  while (offset < contents.length) {
    const tlv = readTLV(contents, offset);
    yield tlv;
    offset = tlv.end;
  }
}

export function childList(contents) {
  return [...children(contents)];
}

/** Decode an OBJECT IDENTIFIER's contents to dotted-decimal. */
export function readOID(contents) {
  if (contents.length === 0) throw new Error("DER: empty OID");
  const parts = [Math.floor(contents[0] / 40), contents[0] % 40];
  let value = 0;
  for (let i = 1; i < contents.length; i++) {
    value = value * 128 + (contents[i] & 0x7f);
    if (!(contents[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

/** BIT STRING contents minus the leading "unused bits" octet. */
export function bitStringBytes(contents) {
  if (contents.length < 1) throw new Error("DER: empty BIT STRING");
  if (contents[0] !== 0) throw new Error("DER: BIT STRING with unused bits unsupported");
  return contents.subarray(1);
}

/**
 * Decode UTCTime / GeneralizedTime to a JS Date.
 *
 * UTCTime's two-digit year uses the RFC 5280 sliding window: 00-49 is 20xx,
 * 50-99 is 19xx. Getting this wrong silently shifts certificate validity by a
 * century, which then reads as "not valid at this time" on a good chain.
 */
export function readTime(tlv) {
  const s = new TextDecoder().decode(tlv.contents);
  let year, rest;
  if (tlv.tag === TAG.UTC_TIME) {
    const yy = parseInt(s.slice(0, 2), 10);
    year = yy < 50 ? 2000 + yy : 1900 + yy;
    rest = s.slice(2);
  } else if (tlv.tag === TAG.GENERALIZED_TIME) {
    year = parseInt(s.slice(0, 4), 10);
    rest = s.slice(4);
  } else {
    throw new Error(`DER: not a time type (tag 0x${tlv.tag.toString(16)})`);
  }
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(rest);
  if (!m) throw new Error(`DER: unparseable time ${JSON.stringify(s)}`);
  return new Date(
    Date.UTC(year, +m[1] - 1, +m[2], +m[3], +m[4], m[5] ? +m[5] : 0)
  );
}

/**
 * Convert an ECDSA signature from DER SEQUENCE {r, s} to raw r‖s (P1363).
 *
 * SPEC-GAP 3: SPEC §6.1 mandates DER, which is what OpenSSL and pyca produce.
 * WebCrypto's ECDSA verify accepts *only* fixed-width r‖s. Neither is wrong,
 * but the spec never mentions that a converter is needed, and the failure mode
 * is a silent `false` from `subtle.verify` -- indistinguishable from a forged
 * signature. Every non-OpenSSL verifier will hit this.
 */
export function ecdsaDerToRaw(der, fieldBytes = 32) {
  const seq = readTLV(der, 0);
  if (seq.tag !== TAG.SEQUENCE) throw new Error("ECDSA signature is not a SEQUENCE");
  const [rTLV, sTLV] = childList(seq.contents);
  if (!rTLV || !sTLV || rTLV.tag !== TAG.INTEGER || sTLV.tag !== TAG.INTEGER) {
    throw new Error("ECDSA signature is not SEQUENCE { INTEGER, INTEGER }");
  }
  const out = new Uint8Array(fieldBytes * 2);
  for (const [i, tlv] of [rTLV, sTLV].entries()) {
    let v = tlv.contents;
    // DER INTEGERs are signed, so a high bit forces a leading 0x00 pad.
    let s = 0;
    while (s < v.length - 1 && v[s] === 0) s++;
    v = v.subarray(s);
    if (v.length > fieldBytes) throw new Error("ECDSA signature component too large");
    out.set(v, i * fieldBytes + (fieldBytes - v.length));
  }
  return out;
}

/**
 * The inverse of `ecdsaDerToRaw`: WebCrypto's `subtle.sign` returns fixed-width
 * r‖s (P1363), and SPEC §6.1 puts DER on the wire. Each component is stripped
 * of leading zeros, then given one 0x00 back if its high bit is set, because
 * DER INTEGERs are signed.
 */
export function ecdsaRawToDer(raw, fieldBytes = 32) {
  if (raw.length !== fieldBytes * 2) throw new Error("raw ECDSA signature has the wrong length");
  const ints = [raw.subarray(0, fieldBytes), raw.subarray(fieldBytes)].map((v) => {
    let s = 0;
    while (s < v.length - 1 && v[s] === 0) s++;
    v = v.subarray(s);
    const pad = v[0] & 0x80 ? 1 : 0;
    const out = new Uint8Array(2 + pad + v.length);
    out[0] = TAG.INTEGER;
    out[1] = pad + v.length;
    out.set(v, 2 + pad);
    return out;
  });
  const body = ints[0].length + ints[1].length;
  const der = new Uint8Array(2 + body);
  der[0] = TAG.SEQUENCE;
  der[1] = body; // at most 2 * (2 + 1 + 32) = 70 bytes, so the short length form always applies
  der.set(ints[0], 2);
  der.set(ints[1], 2 + ints[0].length);
  return der;
}
