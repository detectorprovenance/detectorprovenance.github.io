// Python in the page, for HDF5 files and for converting proprietary formats.
//
// Pyodide runs CPython compiled to WebAssembly in the browser. The packages
// (numpy, h5py, cryptography, and rosettasciio when a file needs converting)
// are downloaded from public package mirrors the first time; the files being
// verified or signed never leave the page. framesig, the reference
// implementation, is bundled into this widget as a wheel.

import WHEEL_B64 from "../py/framesig-0.2.0-py3-none-any.whl";
import DP_WEB from "../py/dp_web.py";
import { fromBase64String } from "./common.js";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs";
const WHEEL = "framesig-0.2.0-py3-none-any.whl";

export const HDF5_MAGIC = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];

/** File extensions rosettasciio can read, for the convert-and-sign path. */
export const CONVERTIBLE = new Set([
  "dm3", "dm4", "ser", "emi", "mrc", "mrcz", "tif", "tiff", "msa", "ems", "mas", "emsa",
  "mib", "blo", "unf", "rpl", "prz", "bcf", "spx", "spc", "spd", "pts", "asw", "map",
  "sur", "pro", "wdf", "img", "dens",
]);

export function isHdf5(bytes) {
  return bytes.length >= 8 && HDF5_MAGIC.every((b, i) => bytes[i] === b);
}

export function extension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

let ready = null;
let readers = null;

/** Start Python once per page; `status(text)` reports progress. */
export function python(status = () => {}) {
  if (!ready) {
    ready = (async () => {
      status("Starting Python in your browser. The first time takes about 10 s; your file stays on your computer.");
      const url = PYODIDE;
      const { loadPyodide } = await import(url);
      const py = await loadPyodide();
      await py.loadPackage(["numpy", "h5py", "cryptography", "micropip"], { messageCallback: () => {} });
      py.FS.writeFile(`/tmp/${WHEEL}`, fromBase64String(WHEEL_B64));
      await py.runPythonAsync(`import micropip\nawait micropip.install("emfs:/tmp/${WHEEL}", deps=False)`);
      py.FS.writeFile("/tmp/dp_web.py", DP_WEB);
      py.runPython("import sys\nsys.path.insert(0, '/tmp')\nimport dp_web");
      return py;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Python plus rosettasciio, for reading proprietary formats. */
export async function pythonWithReaders(status = () => {}) {
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

/** Run `fn(py, dir)` with a scratch directory in Python's in-memory file system. */
export async function inScratch(py, fn) {
  const dir = `/tmp/w${Math.random().toString(36).slice(2, 10)}`;
  py.FS.mkdir(dir);
  try {
    return await fn(dir);
  } finally {
    for (const name of py.FS.readdir(dir)) if (name !== "." && name !== "..") py.FS.unlink(`${dir}/${name}`);
    py.FS.rmdir(dir);
  }
}
