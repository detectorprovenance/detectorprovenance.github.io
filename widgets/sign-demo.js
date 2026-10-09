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


def _verify(path, roots_pem):
    roots = load_certificates_pem(roots_pem.encode())
    if not is_signed_hdf5(path):
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
