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
.dpw .dpw-label { font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.dpw .dpw-legend { display:flex; gap:16px; flex-wrap:wrap; font-size:14px; }
.dpw .dpw-legend span { display:inline-flex; gap:7px; align-items:center; }
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
@media (max-width: 560px) { .dpw .dpw-thumb { display:none; } }
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
    h("button", { class: "dpw-btn", type: "button", onclick: () => input.click() }, label),
    h("div", { style: "margin-top:8px" }, hint)
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
function resultCard(name, r, bytes) {
  const c = classify(r);
  const signal = h(
    "div",
    { class: "dpw-signal", title: LIGHTS[c.light].label },
    ["red", "yellow", "green", "violet"].map((color) => h("div", {
      class: "dpw-lamp" + (color === c.light ? " dpw-on" : ""),
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
  const thumb = bytes ? frameThumbnail(bytes) : null;
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
    const [low, high] = quantileWindow(pooled, 0.02, 0.98);
    const span = high - low || 1;
    const lut = colormapLut("viridis");
    const canvas = h("canvas", { class: "dpw-thumb", width: ow, height: oh });
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(ow, oh);
    for (let i = 0; i < pooled.length; i++) {
      const t = Math.max(0, Math.min(1, (pooled[i] - low) / span));
      const k = Math.min(255, t * 255 | 0) * 3;
      img.data.set([lut[k], lut[k + 1], lut[k + 2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
function quantileWindow(values, lo = 0.02, hi = 0.98) {
  const v = Float64Array.from(values).filter((x) => Number.isFinite(x) && x >= 0).sort();
  if (!v.length) return [0, 1];
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  const low = at(lo), high = at(hi);
  return [low, high > low ? high : low + 1];
}
function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e4);
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

// widgets/src/sign-demo.js
var CLAIMS = { note: "Signed in a web browser by the Detector Provenance demo" };
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
  function chosenKey() {
    return keyChoice.querySelector("input:checked").value;
  }
  async function sign() {
    out.replaceChildren();
    signBtn.disabled = true;
    try {
      const signer = chosenKey() === "demo" ? await importSigner(fromBase64(demo_signer_default.pkcs8), demo_signer_default.certificates.map(fromBase64), demo_signer_default.subject) : freshSigner || (freshSigner = await generateSigner());
      const signed = await signFile(file.bytes, signer, { claims: CLAIMS });
      const check = await verifyFrame(signed.signed, { roots: ROOTS, sidecar: signed.sidecar ? signed.envelope : void 0 });
      const buttons = signed.embedded ? [h(
        "button",
        { class: "dpw-btn", type: "button", onclick: () => download(signedName(file.name), signed.signed) },
        `Download ${signedName(file.name)}`
      )] : [h(
        "button",
        { class: "dpw-btn", type: "button", onclick: () => download(file.name + SIDECAR_SUFFIX, signed.sidecar) },
        `Download ${file.name}${SIDECAR_SUFFIX}`
      )];
      const note = signed.embedded ? "The signature is stored inside the CBF file." : `The signature is stored in a separate file. ${file.name} itself is unchanged; keep the two files together, and load both into the verifier above.`;
      out.append(
        resultCard(signed.embedded ? signedName(file.name) : `${file.name} + ${file.name}${SIDECAR_SUFFIX}`, check, signed.signed),
        h("div", { class: "dpw-row", style: "margin-top:12px" }, buttons),
        h("div", { class: "dpw-small", style: "margin-top:8px" }, note)
      );
    } catch (e) {
      out.appendChild(h("div", { class: "dpw-error" }, `Signing failed: ${e.message}`));
    } finally {
      signBtn.disabled = !file;
    }
  }
  signBtn.addEventListener("click", sign);
  root.appendChild(h(
    "div",
    { class: "dpw-box" },
    fileLoader({
      label: "Load a file",
      multiple: false,
      onFiles: (files) => {
        file = files[0];
        fileLine.textContent = `Loaded ${file.name} (${file.bytes.length.toLocaleString()} bytes).`;
        signBtn.disabled = false;
        out.replaceChildren();
      },
      hint: "or drop a file here. CBF files are signed in place; any other file gets a separate .framesig signature file. The file never leaves your browser."
    }),
    fileLine,
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
