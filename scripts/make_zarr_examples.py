"""Make Zarr example files: quantEM and HyperSpy .zspy, signed in place.

    python scripts/make_zarr_examples.py RAW.hspy ZSPY_DIR OUT_DIR [--index]

RAW.hspy is the unsigned HyperSpy file from make_hspy_examples.py; its array
and calibration become a quantEM Dataset2d, saved with quantEM's own save().
ZSPY_DIR is the same data written as .zspy by rosettasciio, which needs the
zarr 2 package, so it is made separately:

    from rsciio.zspy import file_writer; file_writer("moire_diffraction_raw.zspy", signal)

Writes, each a single .zip so a browser can load it:

  moire_diffraction_quantem_{raw,hardware-signed,software-signed,tampered}.zip
  moire_diffraction_zspy_{raw,hardware-signed,tampered}.zip

Needs framesig[zarr], quantem, zarr>=3 and rosettasciio.
"""

import argparse
import base64
import json
import os
import pathlib
import shutil
import sys
import tempfile
import zipfile

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_hspy_examples import DEMO, HW_KEY_NAME, PHYSICAL, instrument_chain  # noqa: E402


def zip_dir(directory, target):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as zf:
        for root, _, files in sorted(os.walk(directory)):
            for f in sorted(files):
                full = os.path.join(root, f)
                zf.write(full, os.path.relpath(full, directory))


def tamper(signed_zip, target, array_path):
    """Copy a signed zip, then change values inside its main array with zarr."""
    import zarr

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(signed_zip) as zf:
            zf.extractall(tmp)
        arr = zarr.open_array(zarr.storage.LocalStore(tmp), path=array_path, mode="r+")
        img = arr[:]
        y, x = np.mgrid[: img.shape[-2], : img.shape[-1]]
        cy, cx = img.shape[-2] * 0.3, img.shape[-1] * 0.62
        img = img + (np.percentile(img, 99.9) * np.exp(-((y - cy) ** 2 + (x - cx) ** 2) / 2.0)).astype(img.dtype)
        arr[:] = img
        zip_dir(tmp, target)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("raw_hspy")
    ap.add_argument("zspy_dir")
    ap.add_argument("out")
    ap.add_argument("--index", action="store_true", help="write zarr.json, the list the demo widgets read")
    args = ap.parse_args()

    from cryptography.hazmat.primitives.serialization import load_der_private_key
    from quantem.core.datastructures.dataset2d import Dataset2d
    from rsciio.hspy import file_reader

    from framesig.api import verify_file
    from framesig.keys import SoftwareSigner
    from framesig.pki import load_certificates_pem
    from framesig.signers import HardwareSigner
    from framesig.zarr_tree import sign_zarr

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    hardware = (HardwareSigner(HW_KEY_NAME), instrument_chain(), PHYSICAL)
    demo = json.loads((DEMO / "demo-signer.json").read_text())
    software = (SoftwareSigner(load_der_private_key(base64.b64decode(demo["pkcs8"]), password=None)),
                [base64.b64decode(c) for c in demo["certificates"]], None)

    def signed_copy(raw, target, how):
        shutil.copy(raw, target)
        signer, chain, attestation = how
        sign_zarr(target, signer, certificates_der=chain, attestation=attestation,
                  claims={"note": "Detector Provenance demonstration file"})
        return target

    # quantEM: a Dataset2d saved with quantEM's own save()
    sig = file_reader(args.raw_hspy)[0]
    axes = sig["axes"][-2:]
    ds = Dataset2d.from_array(np.asarray(sig["data"]), name="moire_diffraction",
                              origin=tuple(float(a["offset"]) for a in axes),
                              sampling=tuple(float(a["scale"]) for a in axes),
                              units=tuple(str(a["units"]) for a in axes))
    q_raw = out / "moire_diffraction_quantem_raw.zip"
    ds.save(str(q_raw), mode="o")
    q_hw = signed_copy(q_raw, out / "moire_diffraction_quantem_hardware-signed.zip", hardware)
    q_sw = signed_copy(q_raw, out / "moire_diffraction_quantem_software-signed.zip", software)
    q_tam = out / "moire_diffraction_quantem_tampered.zip"
    tamper(q_hw, q_tam, "_array")

    # HyperSpy .zspy (Zarr format 2, consolidated metadata), zipped
    z_raw = out / "moire_diffraction_zspy_raw.zip"
    zip_dir(args.zspy_dir, z_raw)
    z_hw = signed_copy(z_raw, out / "moire_diffraction_zspy_hardware-signed.zip", hardware)
    z_tam = out / "moire_diffraction_zspy_tampered.zip"
    with zipfile.ZipFile(z_hw) as zf:
        data_key = next(n for n in zf.namelist() if n.endswith("/data/.zarray"))
    tamper(z_hw, z_tam, data_key[: -len("/.zarray")])

    if args.index:
        (out / "zarr.json").write_text(json.dumps([
            {"file": q_hw.name, "light": "green",
             "description": "The diffraction pattern saved by quantEM as a Zarr zip, signed in place by the "
                            "demo instrument key held in secure hardware."},
            {"file": q_sw.name, "light": "yellow",
             "description": "The same quantEM file signed with the website's demo key."},
            {"file": q_tam.name, "light": "violet",
             "description": "The hardware-signed quantEM file with a diffraction peak added after signing."},
            {"file": q_raw.name, "light": "red", "sign": True,
             "description": "The quantEM file, unsigned."},
            {"file": z_hw.name, "light": "green",
             "description": "The pattern as HyperSpy .zspy (Zarr format 2), zipped and signed in place by the "
                            "demo instrument key."},
            {"file": z_tam.name, "light": "violet",
             "description": "The hardware-signed .zspy file with a diffraction peak added after signing."},
            {"file": z_raw.name, "light": "red", "sign": True,
             "description": "The .zspy file, zipped, unsigned."},
        ], indent=2) + "\n")

    roots = load_certificates_pem((DEMO / "demo-root.pem").read_bytes())
    for p in (q_raw, q_hw, q_sw, q_tam, z_raw, z_hw, z_tam):
        r = verify_file(p, roots=roots)
        print(f"{p.name:46s} {p.stat().st_size / 1e6:5.2f} MB  {r.status:10s} {r.assurance.level}")


if __name__ == "__main__":
    main()
