"""Python side of the demonstration widgets, run in the browser by Pyodide.

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
    """A Run-HDF5 (SPEC §7.2): a whole run signed once, not a file signed in place."""
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
