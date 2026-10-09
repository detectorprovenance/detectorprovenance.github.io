/**
 * SPEC §10 -- the CBF / imgCIF binding.
 *
 * Byte scanning only. Same discipline as the reference implementation and for
 * the same reason: a CIF parser normalises whitespace and reorders items, and
 * every such normalisation is a place where "the bytes that were signed" and
 * "the bytes on disk" quietly stop being the same thing.
 */

import { decodeUtf8, fromBase64, indexOfBytes, lastIndexOfBytes, utf8 } from "./bytes.js";

const BOUNDARY = utf8("--CIF-BINARY-FORMAT-SECTION--");
const END_BOUNDARY = utf8("--CIF-BINARY-FORMAT-SECTION----");
const START_OF_BIN = new Uint8Array([0x0c, 0x1a, 0x04, 0xd5]);
export const BLOCK_MARKER = utf8("###FRAMESIG-BLOCK-V1");

/**
 * SPEC-GAP 6: SPEC §10.1 lists `X-Binary-Element-Type` among the headers to
 * read but never gives the mapping from its string values to width and
 * signedness. That mapping is needed to decode an uncompressed payload at all,
 * so it cannot be left to the CBF specification by reference -- an implementer
 * has to guess the exact spelling, including the capitalisation of "IEEE".
 */
const ELEMENT_TYPES = {
  "signed 8-bit integer": { kind: "int", width: 1, signed: true },
  "unsigned 8-bit integer": { kind: "int", width: 1, signed: false },
  "signed 16-bit integer": { kind: "int", width: 2, signed: true },
  "unsigned 16-bit integer": { kind: "int", width: 2, signed: false },
  "signed 32-bit integer": { kind: "int", width: 4, signed: true },
  "unsigned 32-bit integer": { kind: "int", width: 4, signed: false },
  "signed 64-bit integer": { kind: "int", width: 8, signed: true },
  "unsigned 64-bit integer": { kind: "int", width: 8, signed: false },
  "signed 32-bit real IEEE": { kind: "real", width: 4, signed: true },
  "signed 64-bit real IEEE": { kind: "real", width: 8, signed: true },
};

export function sniff(bytes) {
  const head = decodeLatin1(bytes.subarray(0, 64));
  return head.startsWith("###CBF:") || indexOfBytes(bytes, BOUNDARY, 0, Math.min(bytes.length, 1 << 20)) >= 0;
}

function decodeLatin1(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** SPEC §10.2: the block is the file's suffix, found by its last marker. */
export function findBlockOffset(bytes) {
  const needle = new Uint8Array(BLOCK_MARKER.length + 1);
  needle[0] = 0x0a;
  needle.set(BLOCK_MARKER, 1);
  const idx = lastIndexOfBytes(bytes, needle);
  if (idx >= 0) return idx + 1;
  if (indexOfBytes(bytes, BLOCK_MARKER, 0, BLOCK_MARKER.length) === 0) return 0;
  return null;
}

/** SPEC §10.2: unwrap the base64 envelope out of the appended block. */
export function readBlock(blockBytes) {
  const text = decodeLatin1(blockBytes);
  if (!text.startsWith("###FRAMESIG-BLOCK-V1")) {
    throw new Error("signature block does not start with the framesig marker");
  }
  const lines = text.split(/\r?\n/);
  // SPEC §10.2 fixes these two lines verbatim. They are not covered by the
  // signature -- the envelope is found by its ';' delimiters -- so corrupting
  // them would otherwise pass unnoticed. It is still corruption.
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

/**
 * SPEC §10.1: RFC 822 headers with folding.
 *
 * Continuation lines matter more than they look: `Content-Type` carries the
 * `conversions=` parameter and is almost always folded, so an implementation
 * that ignores folding never sees the compression type and then silently
 * treats byte-offset data as uncompressed.
 */
function parseMimeHeaders(bytes, pos) {
  const headers = new Map();
  let currentKey = null;
  for (;;) {
    let nl = indexOfBytes(bytes, new Uint8Array([0x0a]), pos);
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
  if (raw === undefined) return null;
  const m = /-?\d+/.exec(raw);
  return m ? parseInt(m[0], 10) : null;
}

function conversionOf(contentType) {
  const m = /conversions\s*=\s*"?([A-Za-z0-9_-]+)"?/i.exec(contentType || "");
  return m ? m[1].toLowerCase() : "none";
}

/** SPEC §10.1: locate every binary section within `[0, limit)`. */
export function scanPayloads(bytes, limit) {
  const payloads = [];
  let pos = 0;
  let seq = 0;
  while (pos < limit) {
    const i = indexOfBytes(bytes, BOUNDARY, pos, limit);
    if (i < 0) break;
    // The closing boundary is the opening boundary plus "--"; a scan that does
    // not check this finds both and then mis-parses the section after it.
    if (indexOfBytes(bytes, END_BOUNDARY, i, i + END_BOUNDARY.length) === i) {
      pos = i + END_BOUNDARY.length;
      continue;
    }
    const nl = indexOfBytes(bytes, new Uint8Array([0x0a]), i, limit);
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
      closeNeedle[0] = 0x0a;
      closeNeedle.set(END_BOUNDARY, 1);
      const close = indexOfBytes(bytes, closeNeedle, start, limit);
      if (close < 0) throw new Error("binary section has neither X-Binary-Size nor a closing boundary");
      end = close;
    } else {
      // Without the negative check the payload range comes out inverted; a
      // subarray then silently clamps to empty and a corrupt file reports as
      // merely "metadata modified" instead of damaged.
      if (size < 0) throw new Error(`X-Binary-Size ${size} is negative`);
      end = start + size;
      padding = intHeader(headers, "x-binary-size-padding") || 0;
      if (padding < 0) throw new Error(`X-Binary-Size-Padding ${padding} is negative`);
      if (end > limit) throw new Error(`X-Binary-Size ${size} runs past the end of the file`);
      // A missing closing boundary means the file was truncated after the
      // payload. Without this a truncated frame parses as complete.
      const closeNeedle = new Uint8Array(END_BOUNDARY.length + 1);
      closeNeedle[0] = 0x0a;
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
      // A header field must not size an allocation. decodeByteOffset allocates
      // a Float64Array of this length up front, so an inflated count is a
      // one-line denial of service against the browser verifier; and no
      // encoding spends less than a byte per element, so a count larger than
      // the payload is a lie regardless.
      if (nDeclared > end - start) {
        throw new Error(
          `X-Binary-Number-of-Elements ${nDeclared} exceeds the ${end - start}-byte ` +
          "payload; no encoding is that dense"
        );
      }
    }
    const dims = [];
    for (const key of [
      "x-binary-size-fastest-dimension",
      "x-binary-size-second-dimension",
      "x-binary-size-third-dimension",
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
      contentMd5: headers.get("content-md5") ?? null,
    });
    pos = end + padding;
  }
  // The skeleton digest elides payload ranges in order, so anything other than
  // strictly ascending, non-overlapping ranges would corrupt it.
  let previous = 0;
  for (const p of payloads) {
    if (p.start < previous || p.end < p.start) {
      throw new Error(`binary payload "${p.id}" has an invalid byte range (${p.start}..${p.end})`);
    }
    previous = p.end;
  }
  return payloads;
}

/**
 * CBF byte-offset decompression.
 *
 * SPEC-GAP 7: SPEC §10.1 names `X-CBF_BYTE_OFFSET` as supported but never
 * defines it, leaving an implementer to find the escape ladder in the CBF
 * specification. Since the value digest depends on decoding it exactly, and
 * the ladder is four lines to state, the spec should state it:
 *
 *   read int8 delta; if it is -128, read int16; if that is -32768, read int32;
 *   if that is -2**31, read int64. Deltas accumulate from a starting value of 0.
 */
export function decodeByteOffset(buf, nElements) {
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

/**
 * SPEC §5.2: produce the container-independent canonical byte stream.
 *
 * Integers become signed 64-bit little-endian regardless of stored width, so
 * the digest survives recompression and format conversion.
 */
export function canonicalPayloadStream(bytes, payload) {
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
    return { form: form, bytes: swapped, values: null };
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

/**
 * Pack to int64 little-endian without touching BigInt per element.
 *
 * A 6-megapixel frame means six million values; a BigInt conversion each is
 * roughly two orders of magnitude slower than two Int32 stores and would make
 * the page feel broken. Values inside the Int32 range are written as a low word
 * plus a sign-extension high word; only the rare out-of-range value pays for a
 * BigInt.
 */
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

export const PROFILE = "cbf/1";
