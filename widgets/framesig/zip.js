/**
 * Minimal ZIP reader, enough to open a `.framebundle` in the browser.
 *
 * Reads the central directory rather than scanning local headers, so a frame
 * can be pulled out of a multi-gigabyte archive without touching the rest --
 * which is the whole reason the container is a ZIP and not a tar.
 *
 * **None of this metadata is trusted.** Names, ordering and entry counts in a
 * file someone sends you are attacker-controlled. Membership in a bundle is
 * decided by the digest of each frame's signed manifest, exactly as it is for a
 * loose folder; the central directory only says where the bytes are.
 *
 * Stored (method 0) and deflated (method 8) entries are supported; deflate goes
 * through the platform's DecompressionStream, so there is still no dependency.
 */

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;

export class ZipError extends Error {}

function findEOCD(view, bytes) {
  // The end-of-central-directory record is at the end, but a trailing comment
  // of up to 64 KiB can follow it, so scan backwards for the signature.
  const maxBack = Math.min(bytes.length, 0xffff + 22);
  for (let i = 22; i <= maxBack; i++) {
    const at = bytes.length - i;
    if (view.getUint32(at, true) === EOCD_SIG) return at;
  }
  throw new ZipError("not a ZIP file: no end-of-central-directory record");
}

/** Parse an archive's central directory. Returns a Map of name -> entry. */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEOCD(view, bytes);

  let entryCount = view.getUint16(eocd + 10, true);
  let directoryOffset = view.getUint32(eocd + 16, true);

  // ZIP64: a 3600-frame dataset passes 4 GiB easily, and the 32-bit fields then
  // hold sentinel values pointing at a 64-bit record.
  if (directoryOffset === 0xffffffff || entryCount === 0xffff) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== EOCD64_LOCATOR_SIG) {
      throw new ZipError("ZIP64 archive without a locator record");
    }
    const eocd64 = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(eocd64, true) !== EOCD64_SIG) {
      throw new ZipError("ZIP64 end-of-central-directory record not found");
    }
    entryCount = Number(view.getBigUint64(eocd64 + 32, true));
    directoryOffset = Number(view.getBigUint64(eocd64 + 48, true));
  }

  const entries = new Map();
  let pos = directoryOffset;
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pos, true) !== CENTRAL_SIG) {
      throw new ZipError(`corrupt central directory at entry ${i}`);
    }
    const method = view.getUint16(pos + 10, true);
    let compressedSize = view.getUint32(pos + 20, true);
    let uncompressedSize = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    let localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));

    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      // ZIP64 extended information extra field (id 0x0001), in a fixed order,
      // present only for the fields that overflowed.
      let extraPos = pos + 46 + nameLength;
      const extraEnd = extraPos + extraLength;
      while (extraPos + 4 <= extraEnd) {
        const id = view.getUint16(extraPos, true);
        const size = view.getUint16(extraPos + 2, true);
        let field = extraPos + 4;
        if (id === 0x0001) {
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(view.getBigUint64(field, true));
            field += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(view.getBigUint64(field, true));
            field += 8;
          }
          if (localOffset === 0xffffffff) {
            localOffset = Number(view.getBigUint64(field, true));
          }
          break;
        }
        extraPos += 4 + size;
      }
    }

    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Entries are written stored, so a legitimate bundle never expands at all. */
export const MAX_ENTRY_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_EXPANSION_RATIO = 200;

/** Extract one entry's bytes. */
export async function readEntry(bytes, entry) {
  // A declared size must not size an allocation: 1 GB of zeros deflates to
  // about a megabyte, and a verifier that believes the header allocates
  // whatever it is told.
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new ZipError(
      `"${entry.name}" declares ${entry.uncompressedSize} bytes, beyond the limit for one entry`
    );
  }
  if (
    entry.compressedSize &&
    entry.uncompressedSize / entry.compressedSize > MAX_EXPANSION_RATIO
  ) {
    throw new ZipError(
      `"${entry.name}" expands ${Math.round(entry.uncompressedSize / entry.compressedSize)}x, ` +
      "far beyond anything a detector frame does; refusing to decompress it"
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The local header repeats the name and extra field, and its lengths are the
  // ones that describe the actual layout here -- the central directory's may
  // differ, which is a classic ZIP ambiguity.
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw;
  if (entry.method !== 8) {
    throw new ZipError(`unsupported ZIP compression method ${entry.method}`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new ZipError("this browser cannot inflate; ask for a stored (uncompressed) bundle");
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const BUNDLE_ENTRY = "bundle.json";
export const FRAME_PREFIX = "frames/";

/** Is this a framesig single-file bundle? Decided by content. */
export function isContainer(entries) {
  return entries.has(BUNDLE_ENTRY);
}

export function frameNames(entries) {
  return [...entries.keys()]
    .filter((n) => n.startsWith(FRAME_PREFIX) && !n.endsWith("/"))
    .map((n) => n.slice(FRAME_PREFIX.length));
}
