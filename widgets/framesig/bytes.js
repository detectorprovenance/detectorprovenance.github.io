/**
 * Byte helpers.
 *
 * Written against docs/SPEC.md, not against the Python implementation.  Where
 * the spec was ambiguous the choice made here is marked `SPEC-GAP` and listed
 * in web/SPEC-NOTES.md.
 */

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Strict base64 decode. Rejects anything the spec would not have produced. */
export function fromBase64(text) {
  const clean = String(text).replace(/[\r\n]/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error("not valid base64");
  }
  const out = new Uint8Array((clean.length / 4) * 3 - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64_ALPHABET.indexOf(clean[i]) << 18) |
      (B64_ALPHABET.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] === "=" ? 0 : B64_ALPHABET.indexOf(clean[i + 2])) << 6) |
      (clean[i + 3] === "=" ? 0 : B64_ALPHABET.indexOf(clean[i + 3]));
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

/** Standard base64 with padding, no line breaks (the inverse of `fromBase64`). */
export function toBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + B64_ALPHABET[(n >> 6) & 63] + B64_ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + B64_ALPHABET[(n >> 6) & 63] + "=";
  }
  return out;
}

export function toHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(text) {
  if (!/^[0-9a-fA-F]*$/.test(text) || text.length % 2 !== 0) {
    throw new Error("not valid hex");
  }
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.substr(i * 2, 2), 16);
  return out;
}

export function utf8(text) {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function concat(...parts) {
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

/** Constant-time-ish equality. Digests are public, but the habit is cheap. */
export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Find the last occurrence of `needle` in `haystack`, or -1. */
export function lastIndexOfBytes(haystack, needle, from = haystack.length) {
  outer: for (let i = Math.min(from, haystack.length - needle.length); i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Find the first occurrence of `needle` at or after `from`, within `limit`. */
export function indexOfBytes(haystack, needle, from = 0, limit = haystack.length) {
  outer: for (let i = from; i <= limit - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
