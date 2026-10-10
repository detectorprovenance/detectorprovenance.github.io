// Built by scripts/build_widgets.sh from widgets/src/sign-demo.js. Do not edit.

// widgets/framesig/bytes.js
var B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fromBase64(text) {
  const clean = String(text).replace(/[\r\n]/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error("not valid base64");
  }
  const out = new Uint8Array(clean.length / 4 * 3 - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = B64_ALPHABET.indexOf(clean[i]) << 18 | B64_ALPHABET.indexOf(clean[i + 1]) << 12 | (clean[i + 2] === "=" ? 0 : B64_ALPHABET.indexOf(clean[i + 2])) << 6 | (clean[i + 3] === "=" ? 0 : B64_ALPHABET.indexOf(clean[i + 3]));
    if (o < out.length) out[o++] = n >> 16 & 255;
    if (o < out.length) out[o++] = n >> 8 & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
function toBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[n >> 12 & 63] + B64_ALPHABET[n >> 6 & 63] + B64_ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[n >> 12 & 63] + B64_ALPHABET[n >> 6 & 63] + "=";
  }
  return out;
}
function toHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function fromHex(text) {
  if (!/^[0-9a-fA-F]*$/.test(text) || text.length % 2 !== 0) {
    throw new Error("not valid hex");
  }
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.substr(i * 2, 2), 16);
  return out;
}
function utf8(text) {
  return new TextEncoder().encode(text);
}
function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function concat(...parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function lastIndexOfBytes(haystack, needle, from = haystack.length) {
  outer: for (let i = Math.min(from, haystack.length - needle.length); i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
function indexOfBytes(haystack, needle, from = 0, limit = haystack.length) {
  outer: for (let i = from; i <= limit - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// widgets/framesig/cbf.js
var BOUNDARY = utf8("--CIF-BINARY-FORMAT-SECTION--");
var END_BOUNDARY = utf8("--CIF-BINARY-FORMAT-SECTION----");
var START_OF_BIN = new Uint8Array([12, 26, 4, 213]);
var BLOCK_MARKER = utf8("###FRAMESIG-BLOCK-V1");
var ELEMENT_TYPES = {
  "signed 8-bit integer": { kind: "int", width: 1, signed: true },
  "unsigned 8-bit integer": { kind: "int", width: 1, signed: false },
  "signed 16-bit integer": { kind: "int", width: 2, signed: true },
  "unsigned 16-bit integer": { kind: "int", width: 2, signed: false },
  "signed 32-bit integer": { kind: "int", width: 4, signed: true },
  "unsigned 32-bit integer": { kind: "int", width: 4, signed: false },
  "signed 64-bit integer": { kind: "int", width: 8, signed: true },
  "unsigned 64-bit integer": { kind: "int", width: 8, signed: false },
  "signed 32-bit real IEEE": { kind: "real", width: 4, signed: true },
  "signed 64-bit real IEEE": { kind: "real", width: 8, signed: true }
};
function sniff(bytes) {
  const head = decodeLatin1(bytes.subarray(0, 64));
  return head.startsWith("###CBF:") || indexOfBytes(bytes, BOUNDARY, 0, Math.min(bytes.length, 1 << 20)) >= 0;
}
function decodeLatin1(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}
function findBlockOffset(bytes) {
  const needle = new Uint8Array(BLOCK_MARKER.length + 1);
  needle[0] = 10;
  needle.set(BLOCK_MARKER, 1);
  const idx = lastIndexOfBytes(bytes, needle);
  if (idx >= 0) return idx + 1;
  if (indexOfBytes(bytes, BLOCK_MARKER, 0, BLOCK_MARKER.length) === 0) return 0;
  return null;
}
function readBlock(blockBytes) {
  const text = decodeLatin1(blockBytes);
  if (!text.startsWith("###FRAMESIG-BLOCK-V1")) {
    throw new Error("signature block does not start with the framesig marker");
  }
  const lines = text.split(/\r?\n/);
  for (const required of ["data_framesig", "_framesig.envelope"]) {
    if (!lines.includes(required)) {
      throw new Error(`signature block is missing its "${required}" line; the block is malformed`);
    }
  }
  const first = lines.indexOf(";");
  if (first < 0) throw new Error("signature block has no delimited envelope field");
  const last = lines.indexOf(";", first + 1);
  if (last < 0) throw new Error("signature block envelope field is not closed");
  const b64 = lines.slice(first + 1, last).map((l) => l.trim()).join("");
  return fromBase64(b64);
}
function parseMimeHeaders(bytes, pos) {
  const headers = /* @__PURE__ */ new Map();
  let currentKey = null;
  for (; ; ) {
    let nl = indexOfBytes(bytes, new Uint8Array([10]), pos);
    if (nl < 0) throw new Error("unterminated MIME header block");
    let line = decodeLatin1(bytes.subarray(pos, nl)).replace(/\r$/, "");
    pos = nl + 1;
    if (line.trim() === "") return { headers, next: pos };
    if (/^[ \t]/.test(line)) {
      if (currentKey === null) throw new Error("MIME continuation line with no header");
      headers.set(currentKey, headers.get(currentKey) + " " + line.trim());
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`malformed MIME header line ${JSON.stringify(line.slice(0, 60))}`);
    currentKey = line.slice(0, colon).trim().toLowerCase();
    headers.set(currentKey, line.slice(colon + 1).trim());
  }
}
function intHeader(headers, key) {
  const raw = headers.get(key);
  if (raw === void 0) return null;
  const m = /-?\d+/.exec(raw);
  return m ? parseInt(m[0], 10) : null;
}
function conversionOf(contentType) {
  const m = /conversions\s*=\s*"?([A-Za-z0-9_-]+)"?/i.exec(contentType || "");
  return m ? m[1].toLowerCase() : "none";
}
function scanPayloads(bytes, limit) {
  const payloads = [];
  let pos = 0;
  let seq = 0;
  while (pos < limit) {
    const i = indexOfBytes(bytes, BOUNDARY, pos, limit);
    if (i < 0) break;
    if (indexOfBytes(bytes, END_BOUNDARY, i, i + END_BOUNDARY.length) === i) {
      pos = i + END_BOUNDARY.length;
      continue;
    }
    const nl = indexOfBytes(bytes, new Uint8Array([10]), i, limit);
    if (nl < 0) throw new Error("binary section boundary is not newline-terminated");
    const { headers, next } = parseMimeHeaders(bytes, nl + 1);
    const sob = indexOfBytes(bytes, START_OF_BIN, next, limit);
    if (sob < 0) throw new Error("binary section has no START_OF_BIN marker");
    const start = sob + START_OF_BIN.length;
    const size = intHeader(headers, "x-binary-size");
    let end;
    let padding = 0;
    if (size === null) {
      const closeNeedle = new Uint8Array(END_BOUNDARY.length + 1);
      closeNeedle[0] = 10;
      closeNeedle.set(END_BOUNDARY, 1);
      const close = indexOfBytes(bytes, closeNeedle, start, limit);
      if (close < 0) throw new Error("binary section has neither X-Binary-Size nor a closing boundary");
      end = close;
    } else {
      if (size < 0) throw new Error(`X-Binary-Size ${size} is negative`);
      end = start + size;
      padding = intHeader(headers, "x-binary-size-padding") || 0;
      if (padding < 0) throw new Error(`X-Binary-Size-Padding ${padding} is negative`);
      if (end > limit) throw new Error(`X-Binary-Size ${size} runs past the end of the file`);
      const closeNeedle = new Uint8Array(END_BOUNDARY.length + 1);
      closeNeedle[0] = 10;
      closeNeedle.set(END_BOUNDARY, 1);
      if (indexOfBytes(bytes, closeNeedle, end, limit) < 0) {
        throw new Error(
          "binary section is not terminated by a closing boundary; the file appears to be truncated"
        );
      }
    }
    seq += 1;
    const nDeclared = intHeader(headers, "x-binary-number-of-elements");
    if (nDeclared !== null) {
      if (nDeclared < 0) {
        throw new Error(`X-Binary-Number-of-Elements ${nDeclared} is negative`);
      }
      if (nDeclared > end - start) {
        throw new Error(
          `X-Binary-Number-of-Elements ${nDeclared} exceeds the ${end - start}-byte payload; no encoding is that dense`
        );
      }
    }
    const dims = [];
    for (const key of [
      "x-binary-size-fastest-dimension",
      "x-binary-size-second-dimension",
      "x-binary-size-third-dimension"
    ]) {
      const v = intHeader(headers, key);
      if (v !== null) dims.push(v);
    }
    payloads.push({
      id: headers.get("x-binary-id") ?? String(seq),
      start,
      end,
      length: end - start,
      encoding: conversionOf(headers.get("content-type")),
      elementType: (headers.get("x-binary-element-type") || "unknown").replace(/^"|"$/g, "").trim(),
      byteOrder: /big/i.test(headers.get("x-binary-element-byte-order") || "") ? "big" : "little",
      dimensions: dims,
      nElements: intHeader(headers, "x-binary-number-of-elements"),
      contentMd5: headers.get("content-md5") ?? null
    });
    pos = end + padding;
  }
  let previous = 0;
  for (const p of payloads) {
    if (p.start < previous || p.end < p.start) {
      throw new Error(`binary payload "${p.id}" has an invalid byte range (${p.start}..${p.end})`);
    }
    previous = p.end;
  }
  return payloads;
}
function decodeByteOffset(buf, nElements) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = nElements !== null ? new Float64Array(nElements) : [];
  let value = 0;
  let i = 0;
  let produced = 0;
  const n = buf.length;
  while (i < n && (nElements === null || produced < nElements)) {
    let delta = dv.getInt8(i);
    i += 1;
    if (delta === -128) {
      delta = dv.getInt16(i, true);
      i += 2;
      if (delta === -32768) {
        delta = dv.getInt32(i, true);
        i += 4;
        if (delta === -2147483648) {
          const big = dv.getBigInt64(i, true);
          i += 8;
          delta = Number(big);
          if (!Number.isSafeInteger(delta)) {
            throw new Error("byte-offset delta exceeds the exactly-representable integer range");
          }
        }
      }
    }
    value += delta;
    if (!Number.isSafeInteger(value)) {
      throw new Error("decoded value exceeds the exactly-representable integer range");
    }
    if (nElements !== null) out[produced] = value;
    else out.push(value);
    produced += 1;
  }
  if (nElements !== null && produced !== nElements) {
    throw new Error(`byte-offset stream decoded ${produced} values, header declares ${nElements}`);
  }
  return out;
}
function decodeRawInts(buf, width, signed, little, nElements) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let total = Math.floor(buf.length / width);
  if (nElements !== null) total = Math.min(total, nElements);
  const out = new Float64Array(total);
  for (let k = 0; k < total; k++) {
    const o = k * width;
    let v;
    if (width === 1) v = signed ? dv.getInt8(o) : dv.getUint8(o);
    else if (width === 2) v = signed ? dv.getInt16(o, little) : dv.getUint16(o, little);
    else if (width === 4) v = signed ? dv.getInt32(o, little) : dv.getUint32(o, little);
    else {
      const big = signed ? dv.getBigInt64(o, little) : dv.getBigUint64(o, little);
      v = Number(big);
      if (!Number.isSafeInteger(v)) throw new Error("64-bit value is not exactly representable");
    }
    out[k] = v;
  }
  return out;
}
function canonicalPayloadStream(bytes, payload) {
  const raw = bytes.subarray(payload.start, payload.end);
  const type = ELEMENT_TYPES[payload.elementType] || { kind: "int", width: 4, signed: true };
  const little = payload.byteOrder === "little";
  let nElements = payload.nElements;
  if (nElements === null && payload.dimensions.length) {
    nElements = payload.dimensions.reduce((a, b) => a * b, 1);
  }
  if (type.kind === "real") {
    if (!["none", "x-cbf_none", ""].includes(payload.encoding)) {
      throw new Error(`cannot decode real-valued array with encoding ${payload.encoding}`);
    }
    const form = `ieee754-${type.width * 8}-le`;
    if (little) return { form, bytes: raw, values: null };
    const swapped = new Uint8Array(raw.length);
    for (let o = 0; o < raw.length; o += type.width) {
      for (let k = 0; k < type.width; k++) swapped[o + k] = raw[o + type.width - 1 - k];
    }
    return { form, bytes: swapped, values: null };
  }
  let values;
  if (["x-cbf_byte_offset", "x-cbf-byte-offset"].includes(payload.encoding)) {
    values = decodeByteOffset(raw, nElements);
  } else if (["none", "x-cbf_none", ""].includes(payload.encoding)) {
    values = decodeRawInts(raw, type.width, type.signed, little, nElements);
  } else {
    throw new Error(`unsupported CBF compression ${payload.encoding}`);
  }
  return { form: "int64-le", bytes: packInt64LE(values), values };
}
function packInt64LE(values) {
  const out = new Uint8Array(values.length * 8);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    const o = k * 8;
    if (v >= -2147483648 && v <= 2147483647) {
      dv.setInt32(o, v, true);
      dv.setInt32(o + 4, v < 0 ? -1 : 0, true);
    } else {
      dv.setBigInt64(o, BigInt(v), true);
    }
  }
  return out;
}
var PROFILE = "cbf/1";

// widgets/framesig/der.js
var CONSTRUCTED = 32;
var TAG_MASK = 31;
var TAG = {
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  UTF8_STRING: 12,
  SEQUENCE: 48,
  SET: 49,
  PRINTABLE_STRING: 19,
  IA5_STRING: 22,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24
};
function readTLV(bytes, offset = 0) {
  if (offset + 2 > bytes.length) throw new Error("DER: truncated at tag");
  let tag = bytes[offset];
  let p = offset + 1;
  if ((tag & TAG_MASK) === TAG_MASK) throw new Error("DER: multi-byte tags unsupported");
  let length = bytes[p++];
  if (length & 128) {
    const n = length & 127;
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
    full: bytes.subarray(offset, end)
  };
}
function* children(contents) {
  let offset = 0;
  while (offset < contents.length) {
    const tlv = readTLV(contents, offset);
    yield tlv;
    offset = tlv.end;
  }
}
function childList(contents) {
  return [...children(contents)];
}
function readOID(contents) {
  if (contents.length === 0) throw new Error("DER: empty OID");
  const parts = [Math.floor(contents[0] / 40), contents[0] % 40];
  let value = 0;
  for (let i = 1; i < contents.length; i++) {
    value = value * 128 + (contents[i] & 127);
    if (!(contents[i] & 128)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}
function bitStringBytes(contents) {
  if (contents.length < 1) throw new Error("DER: empty BIT STRING");
  if (contents[0] !== 0) throw new Error("DER: BIT STRING with unused bits unsupported");
  return contents.subarray(1);
}
function readTime(tlv) {
  const s = new TextDecoder().decode(tlv.contents);
  let year, rest;
  if (tlv.tag === TAG.UTC_TIME) {
    const yy = parseInt(s.slice(0, 2), 10);
    year = yy < 50 ? 2e3 + yy : 1900 + yy;
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
function ecdsaDerToRaw(der, fieldBytes = 32) {
  const seq = readTLV(der, 0);
  if (seq.tag !== TAG.SEQUENCE) throw new Error("ECDSA signature is not a SEQUENCE");
  const [rTLV, sTLV] = childList(seq.contents);
  if (!rTLV || !sTLV || rTLV.tag !== TAG.INTEGER || sTLV.tag !== TAG.INTEGER) {
    throw new Error("ECDSA signature is not SEQUENCE { INTEGER, INTEGER }");
  }
  const out = new Uint8Array(fieldBytes * 2);
  for (const [i, tlv] of [rTLV, sTLV].entries()) {
    let v = tlv.contents;
    let s = 0;
    while (s < v.length - 1 && v[s] === 0) s++;
    v = v.subarray(s);
    if (v.length > fieldBytes) throw new Error("ECDSA signature component too large");
    out.set(v, i * fieldBytes + (fieldBytes - v.length));
  }
  return out;
}
function ecdsaRawToDer(raw, fieldBytes = 32) {
  if (raw.length !== fieldBytes * 2) throw new Error("raw ECDSA signature has the wrong length");
  const ints = [raw.subarray(0, fieldBytes), raw.subarray(fieldBytes)].map((v) => {
    let s = 0;
    while (s < v.length - 1 && v[s] === 0) s++;
    v = v.subarray(s);
    const pad = v[0] & 128 ? 1 : 0;
    const out = new Uint8Array(2 + pad + v.length);
    out[0] = TAG.INTEGER;
    out[1] = pad + v.length;
    out.set(v, 2 + pad);
    return out;
  });
  const body = ints[0].length + ints[1].length;
  const der = new Uint8Array(2 + body);
  der[0] = TAG.SEQUENCE;
  der[1] = body;
  der.set(ints[0], 2);
  der.set(ints[1], 2 + ints[0].length);
  return der;
}

// widgets/framesig/digest.js
var NUL = new Uint8Array([0]);
var DOMAIN_MANIFEST = concat(utf8("framesig/1"), NUL, utf8("manifest"), NUL);
var DOMAIN_SERIES = concat(utf8("framesig/1"), NUL, utf8("series"), NUL);
var LEAF_PREFIX = new Uint8Array([0]);
var NODE_PREFIX = new Uint8Array([1]);
async function sha256(...parts) {
  const buf = await crypto.subtle.digest("SHA-256", concat(...parts));
  return new Uint8Array(buf);
}
async function sha256Label(...parts) {
  return "sha256:" + toHex(await sha256(...parts));
}
function stripLabel(labelled) {
  const s = String(labelled ?? "");
  return s.startsWith("sha256:") ? s.slice(7) : s;
}
async function merkleLeaf(manifestBytes) {
  return sha256(LEAF_PREFIX, manifestBytes);
}
async function merkleNode(left, right) {
  return sha256(NODE_PREFIX, left, right);
}
async function merkleVerify(leaf, index, proof, root) {
  let current = leaf;
  for (const step of proof) {
    if (!step || step.side !== "left" && step.side !== "right") {
      throw new Error("malformed Merkle proof step");
    }
    const sibling = fromHex(step.hash);
    current = step.side === "left" ? await merkleNode(sibling, current) : await merkleNode(current, sibling);
  }
  return equalBytes(current, root);
}

// widgets/framesig/x509.js
var OID = {
  ED25519: "1.3.101.112",
  EC_PUBLIC_KEY: "1.2.840.10045.2.1",
  P256: "1.2.840.10045.3.1.7",
  ECDSA_SHA256: "1.2.840.10045.4.3.2",
  ECDSA_SHA384: "1.2.840.10045.4.3.3",
  ECDSA_SHA512: "1.2.840.10045.4.3.4",
  BASIC_CONSTRAINTS: "2.5.29.19",
  CERTIFICATE_POLICIES: "2.5.29.32"
};
var ATTR_NAMES = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "0.9.2342.19200300.100.1.25": "DC",
  "0.9.2342.19200300.100.1.1": "UID"
};
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
function parseCertificate(der) {
  const cert = readTLV(der, 0);
  if (cert.tag !== TAG.SEQUENCE) throw new Error("certificate is not a SEQUENCE");
  const [tbs, sigAlg, sigValue] = childList(cert.contents);
  const tbsChildren = childList(tbs.contents);
  let i = 0;
  if ((tbsChildren[0].tag & 192) === 128 && (tbsChildren[0].tag & 31) === 0) i = 1;
  i += 1;
  i += 1;
  const issuer = tbsChildren[i++];
  const validity = tbsChildren[i++];
  const subject = tbsChildren[i++];
  const spki = tbsChildren[i++];
  const [notBeforeTLV, notAfterTLV] = childList(validity.contents);
  let isCA = false;
  const policies = [];
  for (const rest of tbsChildren.slice(i)) {
    if ((rest.tag & 192) !== 128 || (rest.tag & 31) !== 3) continue;
    const extensions = childList(readTLV(rest.contents, 0).contents);
    for (const ext of extensions) {
      const parts = childList(ext.contents);
      const extOid = readOID(parts[0].contents);
      const octets = parts[parts.length - 1];
      if (extOid === OID.BASIC_CONSTRAINTS) {
        const bcParts = childList(readTLV(octets.contents, 0).contents);
        isCA = bcParts.length > 0 && bcParts[0].tag === TAG.BOOLEAN && bcParts[0].contents[0] !== 0;
      } else if (extOid === OID.CERTIFICATE_POLICIES) {
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
    policies
  };
}
function describeSpki(spkiDer) {
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
      importParams: { name: "ECDSA", namedCurve: "P-256" }
    };
  }
  throw new Error(`unsupported public key algorithm OID ${algorithm}`);
}
async function keyIdOf(spkiDer) {
  return "sha256:" + toHex(await sha256(spkiDer));
}
async function importSpki(spkiDer) {
  const { kind, importParams } = describeSpki(spkiDer);
  const key = await crypto.subtle.importKey("spki", spkiDer, importParams, true, ["verify"]);
  return { key, kind };
}
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
      [OID.ECDSA_SHA512]: "SHA-512"
    }[cert.signatureAlgorithm];
    if (!hash || imported.kind !== "ECDSA-P256") return false;
    const raw = ecdsaDerToRaw(cert.signature, 32);
    return await crypto.subtle.verify({ name: "ECDSA", hash }, imported.key, raw, cert.tbsBytes);
  } catch {
    return false;
  }
}
function parsePem(text) {
  const out = [];
  const re = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(parseCertificate(fromBase64(m[1].replace(/\s+/g, ""))));
  }
  if (out.length === 0) throw new Error("no PEM certificate found in this file");
  return out;
}
async function verifyChain(leaf, intermediates, roots, atTime = /* @__PURE__ */ new Date()) {
  const bySubject = /* @__PURE__ */ new Map();
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
        reason: `certificate "${current.subject}" not valid at ${atTime.toISOString()} (valid ${current.notBefore.toISOString()} .. ${current.notAfter.toISOString()})`,
        chain: chain.map((c) => c.subject)
      };
    }
    if (rootSet.has(toHex(current.der))) {
      return {
        ok: true,
        reason: null,
        chain: chain.map((c) => c.subject),
        rootSubject: current.subject
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
        chain: chain.map((c) => c.subject)
      };
    }
    chain.push(issuer);
    current = issuer;
  }
  return { ok: false, reason: "certificate chain too long", chain: chain.map((c) => c.subject) };
}

// widgets/framesig/sign.js
var SPEC_MANIFEST = "framesig/1";
var SPEC_ENVELOPE = "framesig-envelope/1";
var ALG_ECDSA_P256 = "ECDSA-P256-SHA256";
var PROFILE_RAW = "raw/1";
var SIDECAR_SUFFIX = ".framesig";
var SOFTWARE = { name: "framesig-js", version: "0.2.0" };
var SKELETON_MARKER = concat(new Uint8Array([0]), utf8("FRAMESIG-PAYLOAD"), new Uint8Array([0]));
var MAX_SAFE_INT = 9007199254740991;
var ECDSA = { name: "ECDSA", namedCurve: "P-256" };
var ECDSA_SHA256 = { name: "ECDSA", hash: "SHA-256" };
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
function canonicalize(value) {
  const out = [];
  writeCanonical(value, out);
  return utf8(out.join(""));
}
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
    }
  };
}
async function generateSigner() {
  const pair = await crypto.subtle.generateKey(ECDSA, false, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return makeSigner(pair.privateKey, spki);
}
async function importSigner(pkcs8, certificates, subject = null) {
  if (!certificates || !certificates.length) throw new Error("importSigner needs a certificate chain");
  const leaf = parseCertificate(certificates[0]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, ECDSA, false, ["sign"]);
  const signer = await makeSigner(privateKey, leaf.spkiDer, certificates, subject || leaf.subject);
  const probe = utf8("framesig key check");
  if (!await signer.verify(await signer.sign(probe), probe)) {
    throw new Error("the private key does not match the leaf certificate");
  }
  return signer;
}
function rawPayloads(base) {
  return [{
    id: "file",
    start: 0,
    end: base.length,
    length: base.length,
    encoding: "none",
    elementType: "opaque",
    byteOrder: "little",
    dimensions: [],
    nElements: null
  }];
}
async function computeDigests(base, profile) {
  const payloads = profile === PROFILE_RAW ? rawPayloads(base) : scanPayloads(base, base.length);
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
        const c = canonicalPayloadStream(base, p);
        form = c.form;
        canonical = await sha256Label(c.bytes);
      } catch (e) {
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
      canonical
    };
    if (p.dimensions && p.dimensions.length) rec.dimensions = p.dimensions.slice();
    if (p.nElements !== null && p.nElements !== void 0) rec.n_elements = p.nElements;
    records.push(rec);
  }
  return { body, skeleton, records };
}
function utcNow() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 19) + "Z";
}
function cbfBase(data) {
  const offset = findBlockOffset(data);
  let base = offset === null ? data : data.subarray(0, offset);
  if (base.length && base[base.length - 1] !== 10) base = concat(base, new Uint8Array([10]));
  return base;
}
function makeBlock(envelopeJson) {
  const b64 = toBase64(envelopeJson);
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  if (!lines.length) lines.push("");
  return utf8(["###FRAMESIG-BLOCK-V1", "data_framesig", "_framesig.envelope", ";", ...lines, ";", ""].join("\n"));
}
async function signFile(data, signer, { embed = true, claims = null, attestation = null, created = null } = {}) {
  const isCbf = sniff(data);
  const profile = isCbf ? PROFILE : PROFILE_RAW;
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
    software: { ...SOFTWARE }
  };
  if (attestation) manifest.attestation = attestation;
  if (claims) manifest.claims = claims;
  const manifestBytes = canonicalize(manifest);
  const message = concat(DOMAIN_MANIFEST, manifestBytes);
  const signature = await signer.sign(message);
  if (!await signer.verify(signature, message)) throw new Error("the new signature does not verify");
  const envelope = {
    spec: SPEC_ENVELOPE,
    manifest: toBase64(manifestBytes),
    signature: { alg: signer.algorithm, value: toBase64(signature) }
  };
  if (signer.certificates.length) envelope.certificates = signer.certificates.map(toBase64);
  else envelope.public_key = toBase64(signer.spki);
  if (embedded) {
    return {
      profile,
      embedded,
      signed: concat(base, makeBlock(canonicalize(envelope))),
      sidecar: null,
      manifest,
      manifestBytes,
      envelope
    };
  }
  return {
    profile,
    embedded,
    signed: base,
    sidecar: utf8(JSON.stringify(envelope, null, 2) + "\n"),
    manifest,
    manifestBytes,
    envelope
  };
}

// widgets/framesig/oids.js
var DOCUMENTATION_PEN = 32473;
var ACTIVE_PEN = DOCUMENTATION_PEN;
var RECOGNISED_PENS = [ACTIVE_PEN];
var PROVISIONAL_WARNING = `the certificate's policy OID is under the RFC 5612 documentation arc (1.3.6.1.4.1.${DOCUMENTATION_PEN}), which is reserved for examples and is not a registered namespace; a production deployment needs its own IANA Private Enterprise Number`;
function arc(pen = ACTIVE_PEN) {
  return `1.3.6.1.4.1.${pen}.1`;
}
function instrumentAttestationOid(pen = ACTIVE_PEN) {
  return `${arc(pen)}.1.1`;
}
function custodialOid(pen = ACTIVE_PEN) {
  return `${arc(pen)}.1.2`;
}
function isProvisional(pen) {
  return pen === DOCUMENTATION_PEN;
}
function classifyPolicies(policyOids) {
  const policies = new Set(policyOids);
  for (const pen of RECOGNISED_PENS) {
    if (policies.has(instrumentAttestationOid(pen))) return { kind: "instrument", pen };
  }
  for (const pen of RECOGNISED_PENS) {
    if (policies.has(custodialOid(pen))) return { kind: "custodial", pen };
  }
  return { kind: null, pen: null };
}
function describePen(pen) {
  return pen !== null && isProvisional(pen) ? PROVISIONAL_WARNING : null;
}

// widgets/framesig/attestation.js
var ASSURANCE_NONE = "none";
var ASSURANCE_SELF = "self-attested";
var ASSURANCE_CUSTODIAL = "custodial";
var ASSURANCE_INSTRUMENT = "instrument";
var ASSURANCE_ORDER = [
  ASSURANCE_NONE,
  ASSURANCE_SELF,
  ASSURANCE_CUSTODIAL,
  ASSURANCE_INSTRUMENT
];
var MODE_PHYSICAL = "physical";
var ACQUISITION_MODES = {
  physical: "photons on the sensor, read out normally",
  "test-pattern": "detector-generated synthetic image",
  calibration: "flat-field, dark, or gain calibration exposure",
  simulated: "data injected into the detector, not measured",
  unknown: "the signer did not state a mode"
};
function weakest(a, b) {
  return ASSURANCE_ORDER.indexOf(a) <= ASSURANCE_ORDER.indexOf(b) ? a : b;
}
function assessAssurance({ signatureValid, trustStatus, certificates, manifest }) {
  if (!signatureValid || !manifest) {
    return { level: ASSURANCE_NONE, mode: null, limits: ["no verified signature"], instrument: {}, policyPen: null };
  }
  const attestation = manifest.attestation;
  const mode = attestation && attestation.mode;
  const limits = [];
  if (trustStatus !== "trusted") {
    limits.push(
      "the signing key chains to no trusted authority, so anyone -- including whoever produced the file -- could have generated it"
    );
    return { level: ASSURANCE_SELF, mode: mode || null, limits, instrument: {}, policyPen: null };
  }
  const policies = certificates[0] && certificates[0].policies || [];
  const { kind, pen } = classifyPolicies(policies);
  let level = ASSURANCE_INSTRUMENT;
  if (kind !== "instrument") {
    level = ASSURANCE_CUSTODIAL;
    limits.push(
      kind === "custodial" ? "the certificate declares a custodial key: software- or facility-held, not inside the instrument" : "the certificate makes no instrument-attestation claim, so the key may be software-held; whoever holds it can sign anything"
    );
  }
  const provisional = describePen(pen);
  if (provisional) limits.push(provisional);
  if (!attestation || typeof attestation !== "object") {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push("the manifest carries no acquisition attestation");
  } else if (!mode) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push("the attestation does not state an acquisition mode");
  } else if (!(mode in ACQUISITION_MODES)) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push(`unrecognised acquisition mode "${mode}"`);
  } else if (mode !== MODE_PHYSICAL) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push(
      `the detector attests this frame was produced in "${mode}" mode (${ACQUISITION_MODES[mode]}) -- it is not a measurement`
    );
  }
  const instrument = {};
  if (attestation) {
    for (const f of ["model", "serial", "firmware", "sensor", "detector_time"]) {
      if (attestation[f]) instrument[f] = attestation[f];
    }
  }
  return { level, mode: mode || null, limits, instrument, policyPen: pen };
}

// widgets/framesig/verify.js
var SPEC_MANIFEST2 = "framesig/1";
var SPEC_ENVELOPE2 = "framesig-envelope/1";
var SPEC_SERIES_ENVELOPE = "framesig-series-envelope/1";
var SKELETON_MARKER2 = concat(new Uint8Array([0]), utf8("FRAMESIG-PAYLOAD"), new Uint8Array([0]));
var STATUS = {
  VALID: "valid",
  REPACKAGED: "repackaged",
  METADATA_MODIFIED: "metadata-modified",
  TAMPERED: "tampered",
  INVALID: "invalid",
  UNSIGNED: "unsigned"
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
    provesInstrumentOrigin: false
  };
}
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
  if (envelope.spec !== SPEC_ENVELOPE2) {
    throw new Error(`unsupported envelope spec ${JSON.stringify(envelope.spec ?? null)}`);
  }
  if (typeof envelope.manifest !== "string") {
    throw new Error("envelope has no manifest");
  }
  return fromBase64(envelope.manifest);
}
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
    `covered by signed series ${JSON.stringify(seriesManifest.series_id)} (${seriesManifest.count} frames), frame index ${index}`
  );
  result.seriesManifest = seriesManifest;
  result.seriesIndex = index;
  return { certs, signingSpki, seriesManifest, index };
}
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
        "chain validated at the manifest's self-declared creation time; without an RFC 3161 timestamp that time is an unverified claim"
      );
    }
  }
  const chain = await verifyChain(leaf, certs.slice(1), roots, when || /* @__PURE__ */ new Date());
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
        problem: `payload count changed: signed ${recorded.length}, file now has ${payloads.length}`
      }
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
      report.canonicalOk = false;
    } else {
      try {
        const { form, bytes } = canonicalPayloadStream(base, p);
        const digest = await sha256Label(bytes);
        report.canonicalOk = form === rec.canonical_form && digest === rec.canonical;
      } catch (e) {
        report.problem = `cannot decode payload to compare values: ${e.message}`;
      }
    }
    if (rec.id !== void 0 && String(rec.id) !== String(p.id)) {
      report.problem = `binary id changed: signed ${JSON.stringify(rec.id)}, now ${JSON.stringify(p.id)}`;
    }
    reports.push(report);
  }
  return reports;
}
async function verifyFrame(bytes, opts = {}) {
  const result = blank();
  const roots = opts.roots || [];
  const pinnedSpkis = opts.pinnedKeys || [];
  let base = bytes;
  let envelope = null;
  try {
    const offset = findBlockOffset(bytes);
    if (offset !== null) {
      envelope = JSON.parse(decodeUtf8(readBlock(bytes.subarray(offset))));
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
  const isSeries = envelope.series && typeof envelope.series === "object" && envelope.signature === void 0;
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
  let manifest;
  try {
    manifest = JSON.parse(decodeUtf8(manifestBytes));
  } catch (e) {
    result.status = STATUS.INVALID;
    result.problems.push(`manifest is not valid JSON: ${e.message}`);
    return result;
  }
  result.manifest = manifest;
  if (manifest.spec !== SPEC_MANIFEST2) {
    result.problems.push(`unsupported manifest spec ${JSON.stringify(manifest.spec ?? null)}`);
  }
  const declared = manifest.signed_length;
  if (declared !== base.length) {
    result.problems.push(
      `signed_length mismatch: manifest says ${declared}, file offers ${base.length} bytes`
    );
  }
  try {
    const payloads = manifest.profile === "raw/1" ? [{ id: "file", start: 0, end: base.length, length: base.length, encoding: "none", elementType: "opaque", byteOrder: "little", dimensions: [], nElements: null }] : scanPayloads(base, base.length);
    const digests = manifest.digests || {};
    result.bodyIntact = declared === base.length && await sha256Label(base) === digests.body;
    const segments = [];
    let pos = 0;
    for (const p of payloads) {
      segments.push(base.subarray(pos, p.start), SKELETON_MARKER2);
      pos = p.end;
    }
    segments.push(base.subarray(pos));
    result.skeletonIntact = await sha256Label(...segments) === digests.skeleton;
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
  if (!result.signatureValid) result.status = STATUS.INVALID;
  else if (result.bodyIntact) result.status = STATUS.VALID;
  else if (result.payloads.length && result.payloads.every((p) => p.canonicalOk)) {
    result.status = result.skeletonIntact ? STATUS.REPACKAGED : STATUS.METADATA_MODIFIED;
  } else result.status = STATUS.TAMPERED;
  finish(result, certs, manifest);
  return result;
}
function finish(result, certs, manifest) {
  result.assurance = assessAssurance({
    signatureValid: result.signatureValid,
    trustStatus: result.trustStatus,
    certificates: certs,
    manifest
  });
  result.provesInstrumentOrigin = (result.status === STATUS.VALID || result.status === STATUS.REPACKAGED) && result.assurance.level === ASSURANCE_INSTRUMENT;
}

// widgets/framesig/display.js
var COLORMAPS = {
  // Detector convention: dark background, bright spots.
  grey: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
  // The look of a diffraction photograph: dark spots on a light ground, as
  // they appear on developed film.
  film: [[0, [255, 255, 255]], [1, [0, 0, 0]]],
  // Black-body ramp: brightness rises monotonically while hue adds resolution.
  hot: [
    [0, [0, 0, 0]],
    [0.35, [178, 24, 0]],
    [0.66, [255, 130, 0]],
    [0.88, [255, 225, 60]],
    [1, [255, 255, 255]]
  ],
  // Perceptually uniform and colour-blind safe; the right choice for figures.
  viridis: [
    [0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1, [253, 231, 37]]
  ],
  ice: [
    [0, [0, 0, 0]],
    [0.4, [0, 60, 130]],
    [0.72, [0, 160, 210]],
    [1, [255, 255, 255]]
  ]
};
var DEFAULT_COLORMAP = "grey";
var LUT_CACHE = /* @__PURE__ */ new Map();
function colormapLut(name) {
  if (LUT_CACHE.has(name)) return LUT_CACHE.get(name);
  const stops = COLORMAPS[name] || COLORMAPS[DEFAULT_COLORMAP];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    for (let j = 0; j < stops.length - 1; j++) {
      const [t0, c0] = stops[j];
      const [t1, c1] = stops[j + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0 || 1);
        lut[i * 3] = Math.round(c0[0] + (c1[0] - c0[0]) * f);
        lut[i * 3 + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * f);
        lut[i * 3 + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * f);
        break;
      }
    }
  }
  LUT_CACHE.set(name, lut);
  return lut;
}

// demo/demo-root.pem
var demo_root_default = "-----BEGIN CERTIFICATE-----\nMIIB2zCCAYGgAwIBAgIUUfiipmHxsYRlukNK3jPp1pNKLfwwCgYIKoZIzj0EAwIw\nSjEpMCcGA1UEAwwgRGV0ZWN0b3IgUHJvdmVuYW5jZSBEZW1vIFJvb3QgQ0ExHTAb\nBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMB4XDTI2MTAwOTE0MzI1MFoXDTQ2\nMTAwNDE0Mzc1MFowSjEpMCcGA1UEAwwgRGV0ZWN0b3IgUHJvdmVuYW5jZSBEZW1v\nIFJvb3QgQ0ExHTAbBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMFkwEwYHKoZI\nzj0CAQYIKoZIzj0DAQcDQgAE5ShZfUzEHFZvQ0CPLCTRtRQeNMAPzida/ClkZbcH\nHgs+0iA0BeOJBjQze4gRp6fGJ80lsa88/lHrOJGrkRo3t6NFMEMwEgYDVR0TAQH/\nBAgwBgEB/wIBAjAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFXIEN8WKuoDRk04\ndV9vG3IsBZu2MAoGCCqGSM49BAMCA0gAMEUCIG6bNz2xMASHpppAmhgCyUKS5Pdz\nUFZpHyQt+G3A9segAiEA4FyK5BaLcQ4tr5ag/9dX6u8vBkGhX5OaSRnVnWylN9w=\n-----END CERTIFICATE-----\n";

// widgets/src/common.js
var ROOT_PEM = demo_root_default;
var ROOTS = parsePem(demo_root_default);
var LIGHTS = {
  green: { label: "Hardware signed" },
  yellow: { label: "Software signed" },
  red: { label: "Unverified" },
  violet: { label: "Modified" }
};
var CSS = `
.dpw { --fg:#1c1917; --muted:#57534e; --panel:#fafaf9; --border:#d6d3d1; --housing:#292524;
  --red:#e03131; --yellow:#fab005; --green:#2f9e44; --violet:#7048e8; --accent:rgb(204,0,0);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--fg);
  margin: 1.25rem 0 2rem 0; }
.dpw.dpw-dark { --fg:#f5f5f4; --muted:#a8a29e; --panel:#24201e; --border:#44403c; --housing:#0c0a09;
  --red:#ff1e1e; --yellow:#ffd43b; --green:#51cf66; --violet:#9775fa; --accent:rgb(255,30,30); }
.dpw * { box-sizing: border-box; }
.dpw .dpw-box { border:1px solid var(--border); border-radius:14px; background:var(--panel); padding:16px; }
.dpw .dpw-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.dpw .dpw-btn { font:inherit; font-size:15px; font-weight:600; padding:8px 16px; border-radius:9px; cursor:pointer;
  border:1px solid var(--accent); background:var(--accent); color:#fff; }
.dpw .dpw-btn:disabled { opacity:0.45; cursor:default; }
.dpw .dpw-btn.dpw-ghost { background:transparent; color:var(--accent); }
.dpw .dpw-drop { border:2px dashed var(--border); border-radius:12px; padding:18px; text-align:center;
  color:var(--muted); font-size:15px; transition:border-color .15s, background .15s; }
.dpw .dpw-drop.dpw-over { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 8%, transparent); }
.dpw .dpw-chip { font:inherit; font-size:13.5px; padding:4px 11px; border-radius:999px; cursor:pointer;
  border:1px solid var(--border); background:transparent; color:var(--fg); display:inline-flex; gap:7px; align-items:center; }
.dpw .dpw-chip:hover { border-color:var(--accent); }
.dpw .dpw-dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex:none; }
.dpw .dpw-small { font-size:13.5px; color:var(--muted); line-height:1.5; }
.dpw .dpw-split { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:stretch; }
.dpw .dpw-split > div { min-width:0; }
.dpw .dpw-split .dpw-drop { height:100%; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.dpw .dpw-list { display:flex; flex-direction:column; gap:6px; align-items:stretch; }
.dpw .dpw-menu-wrap { position:relative; }
.dpw .dpw-menu-btn { font:inherit; font-size:15px; font-weight:600; width:100%; display:flex; justify-content:space-between;
  align-items:center; padding:9px 13px; border-radius:10px; cursor:pointer; border:1px solid var(--border);
  background:var(--panel); color:var(--fg); }
.dpw .dpw-menu-btn:hover { border-color:var(--accent); }
.dpw .dpw-caret { color:var(--muted); }
.dpw .dpw-menu { position:absolute; z-index:20; top:calc(100% + 4px); left:0; right:0; display:flex; flex-direction:column;
  gap:4px; padding:6px; border-radius:10px; border:1px solid var(--border); background:var(--panel);
  box-shadow:0 10px 28px rgba(0,0,0,.22); }
.dpw .dpw-menu[hidden] { display:none; }
.dpw .dpw-menu .dpw-chip { justify-content:flex-start; border:none; border-radius:7px; padding:7px 10px; }
.dpw .dpw-menu .dpw-chip:hover { background:color-mix(in srgb, var(--accent) 10%, transparent); }
.dpw .dpw-list .dpw-chip { justify-content:flex-start; border-radius:9px; padding:6px 11px; }
@media (max-width: 640px) { .dpw .dpw-split { grid-template-columns:minmax(0,1fr); } }
.dpw .dpw-label { font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.dpw .dpw-card { display:flex; gap:16px; align-items:flex-start; border:1px solid var(--border); border-radius:14px;
  padding:14px; margin-top:12px; background:var(--panel); }
.dpw .dpw-signal { flex:none; background:var(--housing); border-radius:14px; padding:8px 7px;
  display:flex; flex-direction:column; gap:7px; }
.dpw .dpw-lamp { width:22px; height:22px; border-radius:50%; opacity:.16; }
.dpw .dpw-lamp.dpw-on { opacity:1; box-shadow:0 0 14px 3px var(--glow); }
.dpw .dpw-body { flex:1 1 260px; min-width:0; }
.dpw .dpw-title { font-size:19px; font-weight:700; margin:0 0 2px 0; }
.dpw .dpw-file { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:13px; color:var(--muted);
  overflow-wrap:anywhere; }
.dpw .dpw-text { font-size:15px; line-height:1.5; margin:6px 0 8px 0; }
.dpw .dpw-details { font-size:13.5px; line-height:1.55; color:var(--muted); margin:0; padding:0; list-style:none; }
.dpw .dpw-details b { color:var(--fg); font-weight:600; }
.dpw .dpw-thumb { flex:none; width:200px; max-width:40%; border-radius:8px; border:1px solid var(--border);
  image-rendering:pixelated; }
.dpw .dpw-choice { display:flex; flex-direction:column; gap:8px; margin:14px 0; }
.dpw .dpw-choice label { display:flex; gap:10px; align-items:flex-start; font-size:15px; line-height:1.45; cursor:pointer; }
.dpw .dpw-choice input { margin-top:4px; accent-color:var(--accent); }
.dpw .dpw-error { color:var(--red); font-size:14.5px; margin-top:10px; }
@media (max-width: 560px) {
  .dpw .dpw-card { flex-wrap:wrap; }
  .dpw .dpw-thumb { width:100%; max-width:100%; order:3; }
}
`;
function mount(el) {
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "dpw";
  const sync = () => root.classList.toggle("dpw-dark", document.documentElement.classList.contains("dark"));
  sync();
  const obs = new MutationObserver(sync);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.appendChild(style);
  el.appendChild(root);
  return { root, cleanup: () => obs.disconnect() };
}
function h(tag, attrs = {}, ...children2) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== void 0) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children2.flat()) {
    if (c === null || c === void 0 || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
function split(left, title, groups) {
  const menus = [];
  const closeAll = () => menus.forEach((m) => {
    m.hidden = true;
  });
  const entries = groups.map((g) => {
    const menu = h("div", { class: "dpw-menu", hidden: true }, g.chips);
    menu.addEventListener("click", closeAll);
    menus.push(menu);
    const button = h(
      "button",
      {
        class: "dpw-menu-btn",
        type: "button",
        "aria-haspopup": "menu",
        onclick: () => {
          const open = menu.hidden;
          closeAll();
          menu.hidden = !open;
        }
      },
      h("span", {}, g.label),
      h("span", { class: "dpw-caret" }, "\u25BE")
    );
    return h("div", { class: "dpw-menu-wrap" }, button, menu);
  });
  const panel = h(
    "div",
    {},
    h("div", { class: "dpw-label", style: "margin-bottom:8px" }, title),
    h("div", { class: "dpw-list" }, entries)
  );
  document.addEventListener("click", (e) => {
    if (!e.composedPath().some((n) => n.classList && n.classList.contains("dpw-menu-wrap"))) closeAll();
  });
  return h("div", { class: "dpw-split" }, h("div", {}, left), panel);
}
function fileLoader({ label, multiple, onFiles, hint }) {
  const input = h("input", { type: "file", multiple, style: "display:none" });
  const read = async (list) => {
    const files = [];
    for (const f of list) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    if (files.length) onFiles(files);
  };
  input.addEventListener("change", () => {
    read(input.files);
    input.value = "";
  });
  const drop = h(
    "div",
    { class: "dpw-drop" },
    h("div", {}, h("button", { class: "dpw-btn", type: "button", onclick: () => input.click() }, label)),
    h("div", {}, "or drop files here"),
    h("div", { class: "dpw-small" }, hint)
  );
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dpw-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dpw-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dpw-over");
    read(e.dataTransfer.files);
  });
  return h("div", {}, input, drop);
}
function classify(r) {
  const mode = r.assurance && r.assurance.mode;
  if (r.status === "invalid") {
    return {
      light: "violet",
      title: "Signature does not verify",
      text: "The file carries a signature, but it does not match the signed record, so the file or its signature was altered."
    };
  }
  if (r.status === "tampered") {
    return {
      light: "violet",
      title: "Data modified after signing",
      text: "The signature is genuine, but the recorded values no longer match the values that were signed."
    };
  }
  if (r.status === "metadata-modified") {
    return {
      light: "violet",
      title: "Metadata modified after signing",
      text: "The recorded values are unchanged, but the metadata, such as the wavelength or detector distance, was edited after signing."
    };
  }
  if (r.status === "unsigned") {
    return {
      light: "red",
      title: "Unsigned",
      text: "No signature was found, so nothing establishes where this file came from. Almost all existing data are unsigned, so this is not evidence of fabrication."
    };
  }
  const level = r.assurance ? r.assurance.level : "none";
  if (level === "instrument") {
    return {
      light: "green",
      title: "Hardware signed",
      text: "Unchanged since it was signed inside a manufacturer-certified instrument, during a physical exposure."
    };
  }
  if (level === "custodial") {
    return {
      light: "yellow",
      title: "Software signed",
      text: mode && mode !== "physical" ? `Unchanged since signing, but the detector reported a ${mode} acquisition instead of a physical exposure.` : "Unchanged since signing by a key that a manufacturer certified, but which is held in software. Anyone with access to that key can sign any file."
    };
  }
  return {
    light: "red",
    title: "Unverified signature",
    text: "The signature is valid, but its key traces back to no trusted manufacturer, so anyone could have produced it."
  };
}
function detailLines(r) {
  const lines = [];
  const m = r.manifest || {};
  lines.push(["Integrity", r.status]);
  lines.push(["Origin", r.assurance ? r.assurance.level : "none"]);
  if (m.signer && m.signer.subject) lines.push(["Signer", m.signer.subject]);
  else if (m.signer && m.signer.key_id) lines.push(["Signing key", m.signer.key_id.slice(0, 23) + "..."]);
  const inst = r.assurance && r.assurance.instrument;
  if (inst && Object.keys(inst).length) {
    lines.push(["Instrument", Object.entries(inst).map(([k, v]) => `${k} ${v}`).join(", ")]);
  }
  if (r.assurance && r.assurance.mode) lines.push(["Acquisition mode", r.assurance.mode]);
  if (m.created) lines.push(["Signed", `${m.created} (stated by the signer)`]);
  for (const p of (r.problems || []).slice(0, 2)) lines.push(["Note", p]);
  return lines;
}
function resultCard(name, r, thumb = null) {
  const c = classify(r);
  const top = c.light === "violet" ? "violet" : "red";
  const signal = h(
    "div",
    { class: "dpw-signal", title: LIGHTS[c.light].label },
    [[top, c.light === top], ["yellow", c.light === "yellow"], ["green", c.light === "green"]].map(([color, on]) => h("div", {
      class: "dpw-lamp" + (on ? " dpw-on" : ""),
      style: `background:var(--${color}); --glow:var(--${color})`
    }))
  );
  const body = h(
    "div",
    { class: "dpw-body" },
    h("div", { class: "dpw-title", style: `color:var(--${c.light})` }, c.title),
    h("div", { class: "dpw-file" }, name),
    h("p", { class: "dpw-text" }, c.text),
    h(
      "ul",
      { class: "dpw-details" },
      detailLines(r).map(([k, v]) => h("li", {}, h("b", {}, k + ": "), String(v)))
    )
  );
  const card = h("div", { class: "dpw-card" }, signal, body);
  if (thumb) card.appendChild(thumb);
  return card;
}
function frameThumbnail(bytes, target = 256) {
  try {
    if (!sniff(bytes)) return null;
    const offset = findBlockOffset(bytes);
    const base = offset === null ? bytes : bytes.subarray(0, offset);
    const payloads = scanPayloads(base, base.length);
    if (!payloads.length || payloads[0].dimensions.length < 2) return null;
    const [width, height] = payloads[0].dimensions;
    const decoded = canonicalPayloadStream(base, payloads[0]);
    if (!decoded.values) return null;
    const step = Math.max(1, Math.ceil(Math.max(width, height) / target));
    const ow = Math.ceil(width / step), oh = Math.ceil(height / step);
    const pooled = new Float64Array(ow * oh).fill(-Infinity);
    for (let y = 0; y < height; y++) {
      const oy = y / step | 0;
      for (let x = 0; x < width; x++) {
        const v = decoded.values[y * width + x];
        const i = oy * ow + (x / step | 0);
        if (v > pooled[i]) pooled[i] = v;
      }
    }
    return imageCanvas(pooled, ow, oh, true);
  } catch {
    return null;
  }
}
function quantileWindow(values, lo = 0.02, hi = 0.98, maskNegative = false) {
  const v = Float64Array.from(values).filter((x) => Number.isFinite(x) && (!maskNegative || x >= 0)).sort();
  if (!v.length) return [0, 1];
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  const low = at(lo), high = at(hi);
  return [low, high > low ? high : low + 1];
}
function imageCanvas(values, width, height, maskNegative = false) {
  const [low, high] = quantileWindow(values, 0.02, 0.98, maskNegative);
  const span = high - low || 1;
  const lut = colormapLut("viridis");
  const canvas = h("canvas", { class: "dpw-thumb", width, height });
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < values.length; i++) {
    const t = Math.max(0, Math.min(1, (values[i] - low) / span));
    const k = Math.min(255, t * 255 | 0) * 3;
    img.data.set([lut[k], lut[k + 1], lut[k + 2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
function previewCanvas(preview) {
  if (!preview) return null;
  const bytes = fromBase64String(preview.values);
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  if (preview.kind === "image") return imageCanvas(values, preview.width, preview.height);
  const width = 400, height = 240;
  const canvas = h("canvas", { class: "dpw-thumb", width, height });
  const ctx = canvas.getContext("2d");
  const [low, high] = quantileWindow(values, 0, 1);
  const span = high - low || 1;
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#51cf66";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = i / Math.max(1, values.length - 1) * (width - 16) + 8;
    const y = height - 8 - (v - low) / span * (height - 16);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
  return canvas;
}
function statusLine(text) {
  return h("div", { class: "dpw-small", style: "margin-top:12px" }, text);
}
var SAMPLE_CACHE = /* @__PURE__ */ new Map();
async function sampleBytes(file) {
  if (!SAMPLE_CACHE.has(file)) {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === file);
    if (!link) throw new Error(`this page has no download link for ${file}`);
    SAMPLE_CACHE.set(file, fetch(link.href).then((r) => {
      if (!r.ok) throw new Error(`could not load ${file} (${r.status})`);
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b)));
  }
  return SAMPLE_CACHE.get(file);
}
function fromBase64String(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e4);
}

// widgets/py/framesig-0.2.0-py3-none-any.whl
var framesig_0_2_0_py3_none_any_default = "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";

// widgets/py/dp_web.py
var dp_web_default = `"""Python side of the demonstration widgets, run in the browser by Pyodide.

Signs and verifies HDF5 files and Zarr zips (quantEM, HyperSpy .zspy) in
place, and converts proprietary files to HyperSpy .hspy (HDF5) with
rosettasciio before signing them. framesig, the
reference implementation, does all signing and verification. Everything
happens in the page's memory; no file leaves the browser.

rosettasciio is used only here, never by framesig itself.
"""

import base64
import hashlib
import json
import os

import numpy as np

from cryptography.hazmat.primitives.serialization import load_der_private_key

from framesig.hdf5_tree import is_signed_hdf5, sign_hdf5, verify_hdf5
from framesig import zarr_tree
from framesig.keys import ALG_ECDSA_P256, SoftwareSigner, generate_private_key
from framesig.pki import load_certificates_pem
from framesig.run_h5 import RUN_SPEC, verify_run

PREVIEW = 256
_FRESH = None


def _result_dict(r):
    """The parts of a VerificationResult the widgets display."""
    a = r.assurance
    return {
        "status": r.status,
        "signatureValid": r.signature_valid,
        "trustStatus": r.trust_status,
        "assurance": {"level": a.level, "mode": a.mode, "instrument": dict(a.instrument or {})},
        "manifest": r.manifest,
        "problems": list(r.problems),
        "notes": list(r.notes),
    }


def _pool(img, target=PREVIEW):
    """Downsample a 2-D array to at most target x target by block means."""
    img = np.asarray(img, dtype="float64")
    step = max(1, int(np.ceil(max(img.shape) / target)))
    if step > 1:
        h, w = (img.shape[0] // step) * step, (img.shape[1] // step) * step
        img = img[:h, :w].reshape(h // step, step, w // step, step).mean(axis=(1, 3))
    return img


def preview(data):
    """An image for 2-D and higher data (the last two axes, at the first
    position along the others), a line for 1-D data."""
    if len(data.shape) == 0 or data.size == 0:
        return None
    if len(data.shape) == 1:
        line = np.asarray(data[:], dtype="float64")
        step = max(1, int(np.ceil(line.size / 1024)))
        if step > 1:
            line = line[: (line.size // step) * step].reshape(-1, step).mean(axis=1)
        return {"kind": "line", "values": base64.b64encode(line.astype("<f4").tobytes()).decode()}
    index = (0,) * (len(data.shape) - 2)
    img = _pool(data[index])
    return {"kind": "image", "height": int(img.shape[0]), "width": int(img.shape[1]),
            "values": base64.b64encode(img.astype("<f4").tobytes()).decode()}


def _main_array(path):
    """The largest numeric dataset in an HDF5 file: the measurement, in practice."""
    import h5py

    best = []

    def visit(name, obj):
        if name.startswith("framesig"):
            return
        if isinstance(obj, h5py.Dataset) and obj.dtype.kind in "biuf" and obj.size > 1:
            best.append((obj.size, name))

    with h5py.File(path, "r") as h:
        h.visititems(visit)
        if not best:
            return None
        return preview(h[max(best)[1]])


def _is_run(path):
    """A Run-HDF5 (SPEC \xA77.2): a whole run signed once, not a file signed in place."""
    import h5py

    try:
        with h5py.File(path, "r") as h:
            return "framesig" in h and h["framesig"].attrs.get("spec") == RUN_SPEC
    except (OSError, KeyError, ValueError, TypeError):
        return False


def _run_result(path, roots):
    """verify_run's report in the shape _result_dict gives the widgets.

    A run carries no assurance level of its own, so a run whose signer is
    trusted shows at most as custodial: never more than the evidence holds.
    """
    r = verify_run(path, roots=roots)
    bad = [f for f in r["frames"] if f["status"] != "repackaged"]
    problems = list(r["problems"])
    if bad:
        problems.insert(0, f"{len(bad)} of {len(r['frames'])} frame(s) differ from what was signed: "
                        + ", ".join(f"frame {f['index']} ({'; '.join(f['problems']) or f['status']})"
                                    for f in bad[:3]))
    trust = r["trust"] or {}
    series = r["series"] or {}
    return {
        "status": r["status"],
        "signatureValid": r["signature_valid"],
        "trustStatus": trust.get("status"),
        "assurance": {"level": "custodial" if r["ok"] else "none", "mode": None, "instrument": {}},
        "manifest": {"signer": series.get("signer") or {}, "created": series.get("created")},
        "problems": problems + list(trust.get("problems", [])),
        "notes": list(trust.get("notes", [])),
    }


def _verify(path, roots_pem):
    roots = load_certificates_pem(roots_pem.encode())
    if _is_run(path):
        r = _run_result(path, roots)
    elif not is_signed_hdf5(path):
        r = {"status": "unsigned", "assurance": {"level": "none"}, "manifest": None,
             "problems": ["no signature found: the file has no /framesig group"]}
    else:
        r = _result_dict(verify_hdf5(path, roots=roots))
    try:
        prev = _main_array(path)
    except Exception:  # noqa: BLE001 - the preview is optional
        prev = None
    return {"result": r, "preview": prev}


def verify_h5(path, roots_pem):
    """Verify an HDF5 file. Returns a JSON string."""
    return json.dumps(_verify(path, roots_pem))


def _zarr_preview(path):
    """Preview of the largest numeric array in a Zarr store."""
    store = zarr_tree._Store(path)
    try:
        nodes, _, _, _ = zarr_tree.walk(np, store)
        arrays = [n for n in nodes if n.kind == "array" and n.dtype.kind in "biuf" and int(np.prod(n.shape)) > 1]
        if not arrays:
            return None
        n = max(arrays, key=lambda n: int(np.prod(n.shape)))
        if len(n.shape) <= 2:
            data = np.concatenate(list(n.slabs()))
        else:
            data = next(iter(n.slabs()))
            while data.ndim > 2:
                data = data[0]
        return preview(data)
    finally:
        store.close()


def verify_zarr(path, roots_pem):
    """Verify a Zarr store (a zip, in the browser). Returns a JSON string."""
    if not zarr_tree.is_zarr(path):
        return json.dumps({"result": {"status": "unsigned", "assurance": {"level": "none"}, "manifest": None,
                                      "problems": ["this zip does not hold a Zarr store"]}, "preview": None})
    r = zarr_tree.verify_zarr(path, roots=load_certificates_pem(roots_pem.encode()))
    try:
        prev = _zarr_preview(path)
    except Exception:  # noqa: BLE001 - the preview is optional
        prev = None
    return json.dumps({"result": _result_dict(r), "preview": prev})


def sign_zarr(path, key_mode, pkcs8_b64, certs_b64, roots_pem, note):
    """Sign a Zarr store in place, then verify it. Returns a JSON string."""
    if not zarr_tree.is_zarr(path):
        raise ValueError("this zip does not hold a Zarr store")
    signer, chain = _signer(key_mode, pkcs8_b64, certs_b64)
    zarr_tree.sign_zarr(path, signer, certificates_der=chain, claims={"note": note})
    return verify_zarr(path, roots_pem)


def _signer(key_mode, pkcs8_b64, certs_b64):
    global _FRESH
    if key_mode == "demo":
        key = load_der_private_key(base64.b64decode(pkcs8_b64), password=None)
        return SoftwareSigner(key), [base64.b64decode(c) for c in certs_b64]
    if _FRESH is None:  # one fresh key per page, like the CBF signer
        _FRESH = SoftwareSigner(generate_private_key(ALG_ECDSA_P256))
    return _FRESH, []


def sign_h5(path, key_mode, pkcs8_b64, certs_b64, roots_pem, note):
    """Sign an HDF5 file in place, then verify it. Returns a JSON string."""
    signer, chain = _signer(key_mode, pkcs8_b64, certs_b64)
    sign_hdf5(path, signer, certificates_der=chain, claims={"note": note})
    return json.dumps(_verify(path, roots_pem))


def _reader_for(filename):
    """The rosettasciio reader module for a file extension, or None."""
    import importlib

    from rsciio import IO_PLUGINS

    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    for plugin in IO_PLUGINS:
        if ext in [e.lower() for e in plugin.get("file_extensions", [])]:
            return importlib.import_module(plugin["api"]), plugin["name"]
    return None, None


def convert_and_sign(in_path, filename, out_path, key_mode, pkcs8_b64, certs_b64, roots_pem, note):
    """Read a file with rosettasciio, write it as HyperSpy .hspy, sign it in place.

    Returns a JSON string with the verification result, a preview, and a note
    on what was converted.
    """
    from rsciio.hspy import file_writer

    module, reader = _reader_for(filename)
    if module is None:
        raise ValueError(f"no rosettasciio reader for {filename}")
    signals = module.file_reader(in_path, lazy=False)
    if not signals:
        raise ValueError(f"{filename} contains no data")
    # A file can hold several signals (an image and its spectrum, say); the
    # largest is the measurement in almost every case.
    sig = max(signals, key=lambda s: np.asarray(s["data"]).size)
    sig["data"] = np.asarray(sig["data"])
    with open(in_path, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    sig.setdefault("metadata", {}).setdefault("General", {})["source_sha256"] = digest
    sig.update({"attributes": {"_lazy": False}, "tmp_parameters": {}, "learning_results": {},
                "models": {}, "package_info": {"name": "detectorprovenance-demo", "version": "0.1"}})
    sig.setdefault("original_metadata", {})
    file_writer(out_path, sig)
    out = json.loads(sign_h5(out_path, key_mode, pkcs8_b64, certs_b64, roots_pem, note))
    out["note"] = (f"Converted with the rosettasciio {reader} reader to HyperSpy .hspy: "
                   f"{sig['data'].dtype} array of shape {list(sig['data'].shape)}"
                   + (f", the largest of {len(signals)} signals in the file" if len(signals) > 1 else "") + ".")
    return json.dumps(out)
`;

// widgets/src/python.js
var PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs";
var WHEEL = "framesig-0.2.0-py3-none-any.whl";
var HDF5_MAGIC = [137, 72, 68, 70, 13, 10, 26, 10];
var CONVERTIBLE = /* @__PURE__ */ new Set([
  "dm3",
  "dm4",
  "ser",
  "emi",
  "mrc",
  "mrcz",
  "tif",
  "tiff",
  "msa",
  "ems",
  "mas",
  "emsa",
  "mib",
  "blo",
  "unf",
  "rpl",
  "prz",
  "bcf",
  "spx",
  "spc",
  "spd",
  "pts",
  "asw",
  "map",
  "sur",
  "pro",
  "wdf",
  "img",
  "dens"
]);
function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
}
function isHdf5(bytes) {
  return bytes.length >= 8 && HDF5_MAGIC.every((b, i) => bytes[i] === b);
}
function extension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
var ready = null;
var readers = null;
function python(status = () => {
}) {
  if (!ready) {
    ready = (async () => {
      status("Starting Python in your browser. The first time takes about 10 s; your file stays on your computer.");
      const url = PYODIDE;
      const { loadPyodide } = await import(url);
      const py = await loadPyodide();
      await py.loadPackage(["numpy", "h5py", "numcodecs", "cryptography", "micropip"], { messageCallback: () => {
      } });
      py.FS.writeFile(`/tmp/${WHEEL}`, fromBase64String(framesig_0_2_0_py3_none_any_default));
      await py.runPythonAsync(`import micropip
await micropip.install("emfs:/tmp/${WHEEL}", deps=False)`);
      py.FS.writeFile("/tmp/dp_web.py", dp_web_default);
      py.runPython("import sys\nsys.path.insert(0, '/tmp')\nimport dp_web");
      return py;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}
async function pythonWithReaders(status = () => {
}) {
  const py = await python(status);
  if (!readers) {
    readers = (async () => {
      status("Loading the rosettasciio file readers (first time only).");
      await py.runPythonAsync('import micropip\nawait micropip.install("rosettasciio")');
    })().catch((e) => {
      readers = null;
      throw e;
    });
  }
  await readers;
  return py;
}
async function inScratch(py, fn) {
  const dir = `/tmp/w${Math.random().toString(36).slice(2, 10)}`;
  py.FS.mkdir(dir);
  try {
    return await fn(dir);
  } finally {
    for (const name of py.FS.readdir(dir)) if (name !== "." && name !== "..") py.FS.unlink(`${dir}/${name}`);
    py.FS.rmdir(dir);
  }
}

// demo/demo-signer.json
var demo_signer_default = {
  note: "The website's demo signing key. It is public on purpose: a key a web page can use is a key anyone can use, so its certificate is custodial and never instrument.",
  pkcs8: "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg3LJ1jhAlT3eRh0AsEjGQqOS1sFxs5WO8g6Q9/KikgcWhRANCAAQlu6lqYOv6RwinPxY7g42fCkn/kCdiGUhDr6MLVEGTPLLZfQMCtswxwcKg7DsPo9+bzy/84wzpBTSDL28l7S2Y",
  certificates: [
    "MIIB+zCCAaGgAwIBAgIUDEVrhp8/spip07O0l2JjDcrglowwCgYIKoZIzj0EAwIwTTEsMCoGA1UEAwwjRGV0ZWN0b3IgUHJvdmVuYW5jZSBEZW1vIElzc3VpbmcgQ0ExHTAbBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMB4XDTI2MTAwOTE0MzI1MFoXDTM2MTAwNjE0Mzc1MFowUzEUMBIGA1UEAwwLV0VCLURFTU8tMDExHTAbBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMRwwGgYDVQQLDBNXRUJTSVRFIERFTU8gU0lHTkVSMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJbupamDr+kcIpz8WO4ONnwpJ/5AnYhlIQ6+jC1RBkzyy2X0DArbMMcHCoOw7D6Pfm88v/OMM6QU0gy9vJe0tmKNZMFcwDAYDVR0TAQH/BAIwADAYBgNVHSAEETAPMA0GCysGAQQBgf1ZAQECMA4GA1UdDwEB/wQEAwIGwDAdBgNVHQ4EFgQUjnek+osZ69ea8KRf8wcEcZ60vJQwCgYIKoZIzj0EAwIDSAAwRQIhAKBTuEaatMk7z21LHbLCGBYooRnUD7UwDZLu/FLtfqMaAiBu0Gv+DrSr5I0C3vG/NCwbmI+4BjOHgrLgO0kWZISrHA==",
    "MIIB3jCCAYSgAwIBAgIUZRsBcpK+ul2Y1CXuZYpf2Kya/hwwCgYIKoZIzj0EAwIwSjEpMCcGA1UEAwwgRGV0ZWN0b3IgUHJvdmVuYW5jZSBEZW1vIFJvb3QgQ0ExHTAbBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMB4XDTI2MTAwOTE0MzI1MFoXDTM2MTAwNjE0Mzc1MFowTTEsMCoGA1UEAwwjRGV0ZWN0b3IgUHJvdmVuYW5jZSBEZW1vIElzc3VpbmcgQ0ExHTAbBgNVBAoMFERlbW8gRGV0ZWN0b3IgVmVuZG9yMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0IFvG6etfPlzusaRO0D1fpXD8MN5vVByx1rPAjR2ei9GWc4X88Mf+dzqFbc2k2SagIDzftbxmozTdQx4lmSpMaNFMEMwEgYDVR0TAQH/BAgwBgEB/wIBATAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFLoEmn986OFCYEt2LA0AZhzrs5gtMAoGCCqGSM49BAMCA0gAMEUCIHgn8CrtYlNN/DGJmZEfGnMlrY6FrR8gB71/H4P7TKxFAiEArE1O5dnnaUddzDGt/cRIGtKsA8VluXt5Un6cldLKzEs="
  ],
  subject: "OU=WEBSITE DEMO SIGNER,O=Demo Detector Vendor,CN=WEB-DEMO-01"
};

// demo/samples/hdf5.json
var hdf5_default = [
  {
    file: "moire_diffraction_hardware-signed.hspy",
    light: "green",
    description: "Real diffraction data in HyperSpy's open HDF5 format, signed in place by the demo instrument key held in secure hardware."
  },
  {
    file: "moire_diffraction_software-signed.hspy",
    light: "yellow",
    description: "The same data signed in place with the website's demo key, which is held in software."
  },
  {
    file: "moire_diffraction_metadata-modified.hspy",
    light: "violet",
    description: "The hardware-signed file with its pixel size edited by 5% after signing; the values are unchanged."
  },
  {
    file: "moire_diffraction_tampered.hspy",
    light: "violet",
    description: "The hardware-signed file with an extra diffraction peak added after signing."
  },
  {
    file: "moire_diffraction_raw.hspy",
    light: "red",
    sign: true,
    description: "The same data, converted to HDF5 but not signed."
  }
];

// demo/samples/zarr.json
var zarr_default = [
  {
    file: "moire_diffraction_quantem_hardware-signed.zip",
    light: "green",
    description: "The diffraction pattern saved by quantEM as a Zarr zip, signed in place by the demo instrument key held in secure hardware."
  },
  {
    file: "moire_diffraction_quantem_software-signed.zip",
    light: "yellow",
    description: "The same quantEM file signed with the website's demo key."
  },
  {
    file: "moire_diffraction_quantem_tampered.zip",
    light: "violet",
    description: "The hardware-signed quantEM file with a diffraction peak added after signing."
  },
  {
    file: "moire_diffraction_quantem_raw.zip",
    light: "red",
    sign: true,
    description: "The quantEM file, unsigned."
  },
  {
    file: "moire_diffraction_zspy_hardware-signed.zip",
    light: "green",
    description: "The pattern as HyperSpy .zspy (Zarr format 2), zipped and signed in place by the demo instrument key."
  },
  {
    file: "moire_diffraction_zspy_tampered.zip",
    light: "violet",
    description: "The hardware-signed .zspy file with a diffraction peak added after signing."
  },
  {
    file: "moire_diffraction_zspy_raw.zip",
    light: "red",
    sign: true,
    description: "The .zspy file, zipped, unsigned."
  }
];

// widgets/src/sign-demo.js
var NOTE = "Signed in a web browser by the Detector Provenance demo";
var UNSIGNED = ["unsigned.cbf", ...[...hdf5_default, ...zarr_default].filter((s) => s.sign).map((s) => s.file)];
function stemAndExt(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}
function methodFor(file) {
  if (sniff(file.bytes)) return { kind: "cbf", text: "CBF file: the signature is added inside the file." };
  if (isHdf5(file.bytes)) {
    return { kind: "hdf5", text: "HDF5 file: the signature is added inside the file, as a /framesig group." };
  }
  if (isZip(file.bytes)) {
    return {
      kind: "zarr",
      text: "Zip file: if it holds a Zarr store, such as a quantEM file or a zipped HyperSpy .zspy, the signature is added as an attribute of its root group."
    };
  }
  if (CONVERTIBLE.has(extension(file.name))) {
    return {
      kind: "convert",
      text: "Proprietary format: the data and metadata are converted to HyperSpy's open HDF5 format (.hspy) with rosettasciio, and the signature is added inside the new file."
    };
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
  const keyChoice = h(
    "div",
    { class: "dpw-choice" },
    h(
      "label",
      {},
      h("input", { type: "radio", name: "dpw-key", value: "demo", checked: true }),
      h(
        "span",
        {},
        h("b", {}, "Website demo key. "),
        "A key certified by the demo manufacturer as custodial. It is published with this page, so anyone can use it, and files it signs show a yellow light."
      )
    ),
    h(
      "label",
      {},
      h("input", { type: "radio", name: "dpw-key", value: "fresh" }),
      h(
        "span",
        {},
        h("b", {}, "New key generated in this browser. "),
        "A key that exists only in this page and traces back to no manufacturer. The signature is valid, but files it signs show a red light."
      )
    )
  );
  const chosenKey = () => keyChoice.querySelector("input:checked").value;
  function load(f) {
    file = f;
    fileLine.textContent = `Loaded ${file.name} (${file.bytes.length.toLocaleString()} bytes).`;
    methodLine.textContent = methodFor(file).text;
    signBtn.disabled = false;
    out.replaceChildren();
  }
  async function signInJs() {
    const signer = chosenKey() === "demo" ? await importSigner(fromBase64(demo_signer_default.pkcs8), demo_signer_default.certificates.map(fromBase64), demo_signer_default.subject) : freshSigner || (freshSigner = await generateSigner());
    const signed = await signFile(file.bytes, signer, { claims: { note: NOTE } });
    const check = await verifyFrame(signed.signed, { roots: ROOTS, sidecar: signed.sidecar ? signed.envelope : void 0 });
    const [stem, ext] = stemAndExt(file.name);
    if (signed.embedded) {
      const name = `${stem}-signed${ext}`;
      return {
        name,
        card: resultCard(name, check, frameThumbnail(signed.signed)),
        downloads: [[name, signed.signed]],
        note: "The signature is stored inside the CBF file."
      };
    }
    return {
      name: file.name,
      card: resultCard(`${file.name} + ${file.name}${SIDECAR_SUFFIX}`, check, null),
      downloads: [[file.name + SIDECAR_SUFFIX, signed.sidecar]],
      note: `The signature is stored in a separate file. ${file.name} itself is unchanged; keep the two files together, and load both into the verifier.`
    };
  }
  async function signInPython(method, status) {
    const py = method === "convert" ? await pythonWithReaders(status) : await python(status);
    const [stem, ext] = stemAndExt(file.name);
    const name = method === "convert" ? `${stem}-signed.hspy` : `${stem}-signed${ext}`;
    status(method === "convert" ? "Converting and signing..." : "Signing...");
    const container = method === "zarr" ? "Zarr store, which opens in quantEM, HyperSpy and zarr" : "HDF5 file, which opens in HyperSpy and any HDF5 reader";
    return inScratch(py, async (dir) => {
      const dp = py.pyimport("dp_web");
      const certs = py.toPy(demo_signer_default.certificates);
      const outPath = `${dir}/out`;
      let res;
      if (method === "convert") {
        py.FS.writeFile(`${dir}/${file.name}`, file.bytes);
        res = JSON.parse(dp.convert_and_sign(
          `${dir}/${file.name}`,
          file.name,
          outPath,
          chosenKey(),
          demo_signer_default.pkcs8,
          certs,
          ROOT_PEM,
          NOTE
        ));
      } else if (method === "zarr") {
        py.FS.writeFile(outPath, file.bytes);
        res = JSON.parse(dp.sign_zarr(outPath, chosenKey(), demo_signer_default.pkcs8, certs, ROOT_PEM, NOTE));
      } else {
        py.FS.writeFile(outPath, file.bytes);
        res = JSON.parse(dp.sign_h5(outPath, chosenKey(), demo_signer_default.pkcs8, certs, ROOT_PEM, NOTE));
      }
      certs.destroy();
      const bytes = py.FS.readFile(outPath);
      return {
        name,
        card: resultCard(name, res.result, previewCanvas(res.preview)),
        downloads: [[name, bytes]],
        note: (res.note ? res.note + " " : "") + `The signature is stored inside the ${container}.`
      };
    });
  }
  async function sign() {
    out.replaceChildren();
    signBtn.disabled = true;
    const line = statusLine("Signing...");
    out.appendChild(line);
    try {
      const method = methodFor(file).kind;
      const r = method === "cbf" || method === "sidecar" ? await signInJs() : await signInPython(method, (t) => {
        line.textContent = t;
      });
      line.replaceWith(
        r.card,
        h(
          "div",
          { class: "dpw-row", style: "margin-top:12px" },
          r.downloads.map(([name, bytes]) => h("button", { class: "dpw-btn", type: "button", onclick: () => download(name, bytes) }, `Download ${name}`))
        ),
        h("div", { class: "dpw-small", style: "margin-top:8px" }, r.note)
      );
    } catch (e) {
      line.replaceWith(h("div", { class: "dpw-error" }, `Signing failed: ${e.message}`));
    } finally {
      signBtn.disabled = !file;
    }
  }
  signBtn.addEventListener("click", sign);
  async function loadSample(name) {
    fileLine.textContent = `Loading ${name}...`;
    try {
      load({ name, bytes: await sampleBytes(name) });
    } catch (e) {
      fileLine.textContent = e.message;
    }
  }
  const chip = (name) => h(
    "button",
    { class: "dpw-chip", type: "button", onclick: () => loadSample(name) },
    h("i", { class: "dpw-dot", style: "background:var(--red)" }),
    name
  );
  const groups = [
    { label: "CBF", chips: UNSIGNED.filter((f) => f.endsWith(".cbf")).map(chip) },
    { label: "HyperSpy (.hspy, HDF5)", chips: UNSIGNED.filter((f) => f.endsWith(".hspy")).map(chip) },
    { label: "quantEM (Zarr)", chips: UNSIGNED.filter((f) => f.includes("_quantem_")).map(chip) },
    { label: "HyperSpy (.zspy, Zarr)", chips: UNSIGNED.filter((f) => f.includes("_zspy_")).map(chip) }
  ];
  root.appendChild(h(
    "div",
    { class: "dpw-box" },
    split(
      fileLoader({
        label: "Load a file",
        multiple: false,
        onFiles: (files) => load(files[0]),
        hint: "CBF, HDF5 (such as HyperSpy .hspy) and zipped Zarr files (quantEM, HyperSpy .zspy) are signed in place. Proprietary formats such as .dm3 are converted to .hspy first. The file never leaves your browser."
      }),
      "Or try an unsigned sample",
      groups
    ),
    fileLine,
    methodLine,
    keyChoice,
    signBtn
  ));
  root.appendChild(out);
  return cleanup;
}
var sign_demo_default = { render };
export {
  sign_demo_default as default
};
