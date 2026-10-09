"""Convert a DM3 file into open-format example files for testing.

    python scripts/make_hspy_examples.py IN.dm3 OUT_DIR [--bin 4] [--name NAME] [--index] [--lean]

Reads the file with rosettasciio, bins it, writes it as HyperSpy .hspy (HDF5),
and signs copies in place with framesig:

  <stem>_raw.hspy              unsigned, the open-format conversion only
  <stem>_hardware-signed.hspy  the demo instrument key (Secure Enclave on the
                               machine that ran tools/make_site_demo.py) and
                               its instrument certificate, physical exposure
  <stem>_software-signed.hspy  the website's demo key: custodial
  <stem>_tampered.hspy         the hardware-signed file with a peak added
                               after signing

Verify them against demo/demo-root.pem, which is copied next to them:

  framesig verify OUT_DIR/*.hspy --trust OUT_DIR/demo-root.pem

Needs framesig[hdf5] and rosettasciio; rosettasciio stays out of framesig.
"""

import argparse
import base64
import hashlib
import json
import pathlib
import shutil

import h5py
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent.parent
DEMO = HERE / "demo"
PHYSICAL = {"mode": "physical", "model": "DEMO DETECTOR", "serial": "DEMO-0001", "firmware": "1.0.0"}
HW_KEY_NAME = "framesig-site-demo-detector"


def binned(signal, factor):
    """Sum factor x factor blocks along the last two axes; adjust their calibration."""
    data = np.asarray(signal["data"])
    *lead, ny, nx = data.shape
    ny, nx = ny // factor * factor, nx // factor * factor
    data = data[..., :ny, :nx].reshape(*lead, ny // factor, factor, nx // factor, factor).sum(axis=(-3, -1))
    axes = [dict(a) for a in signal["axes"]]
    for ax, n in zip(axes[-2:], data.shape[-2:]):
        # The new pixel is centred on the block it sums.
        ax["offset"] = float(ax.get("offset", 0.0)) + float(ax.get("scale", 1.0)) * (factor - 1) / 2
        ax["scale"] = float(ax.get("scale", 1.0)) * factor
        ax["size"] = int(n)
    return data.astype(signal["data"].dtype), axes


def instrument_chain():
    """The demo instrument certificate chain, as carried by the genuine CBF sample."""
    from framesig.formats.cbf import BLOCK_MARKER, read_block

    data = (DEMO / "samples" / "genuine.cbf").read_bytes()
    envelope = json.loads(read_block(data[data.rfind(b"\n" + BLOCK_MARKER) + 1:]))
    return [base64.b64decode(c) for c in envelope["certificates"]]


def repack(path):
    """Rewrite an HDF5 file object by object: HDF5 never reclaims the space
    that rewriting a dataset leaves behind."""
    tmp = path.with_suffix(".repack")
    with h5py.File(path, "r") as src, h5py.File(tmp, "w") as dst:
        dst.attrs.update(src.attrs)
        for name in src:
            src.copy(src[name], dst, name=name)
    tmp.replace(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source")
    ap.add_argument("out")
    ap.add_argument("--bin", type=int, default=4)
    ap.add_argument("--name", help="file name stem (default: the input's)")
    ap.add_argument("--index", action="store_true", help="write hdf5.json, the list the demo widgets read")
    ap.add_argument("--lean", action="store_true", help="leave out the original DM tags (smaller files)")
    args = ap.parse_args()

    from cryptography.hazmat.primitives.serialization import load_der_private_key
    from rsciio.digitalmicrograph import file_reader
    from rsciio.hspy import file_writer

    from framesig.api import verify_file
    from framesig.hdf5_tree import sign_hdf5
    from framesig.keys import SoftwareSigner
    from framesig.pki import load_certificates_pem
    from framesig.signers import HardwareSigner

    src = pathlib.Path(args.source)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = args.name or src.stem

    signal = file_reader(str(src), lazy=False)[0]
    data, axes = binned(signal, args.bin)
    raw = src.read_bytes()
    signal.update({
        "data": data, "axes": axes,
        "attributes": {"_lazy": False}, "tmp_parameters": {}, "learning_results": {}, "models": {},
        "package_info": {"name": "detectorprovenance-demo", "version": "0.1"},
    })
    signal["metadata"]["General"]["title"] = f"{src.stem} (binned {args.bin} x {args.bin})"
    signal["metadata"]["General"]["source_sha256"] = hashlib.sha256(raw).hexdigest()
    if args.lean:
        signal["original_metadata"] = {}

    raw_path = out / f"{stem}_raw.hspy"
    file_writer(str(raw_path), signal)

    hw = out / f"{stem}_hardware-signed.hspy"
    shutil.copy(raw_path, hw)
    sign_hdf5(hw, HardwareSigner(HW_KEY_NAME), certificates_der=instrument_chain(), attestation=PHYSICAL,
              claims={"note": "Detector Provenance demonstration file, converted from DM3 and binned"})

    sw = out / f"{stem}_software-signed.hspy"
    shutil.copy(raw_path, sw)
    demo = json.loads((DEMO / "demo-signer.json").read_text())
    sign_hdf5(sw, SoftwareSigner(load_der_private_key(base64.b64decode(demo["pkcs8"]), password=None)),
              certificates_der=[base64.b64decode(c) for c in demo["certificates"]],
              claims={"note": "Detector Provenance demonstration file, signed with the website's demo key"})

    tampered = out / f"{stem}_tampered.hspy"
    shutil.copy(hw, tampered)
    with h5py.File(tampered, "r+") as h:
        name = next(k for k in h["Experiments"])
        ds = h[f"Experiments/{name}/data"]
        img = ds[()]
        y, x = np.mgrid[: img.shape[-2], : img.shape[-1]]
        cy, cx = img.shape[-2] * 0.3, img.shape[-1] * 0.62
        img += (np.percentile(img, 99.9) * np.exp(-((y - cy) ** 2 + (x - cx) ** 2) / 18.0)).astype(img.dtype)
        ds[...] = img
    repack(tampered)

    if args.index:
        (out / "hdf5.json").write_text(json.dumps([
            {"file": hw.name, "light": "green",
             "description": "Real diffraction data in HyperSpy's open HDF5 format, signed in place by the "
                            "demo instrument key held in secure hardware."},
            {"file": sw.name, "light": "yellow",
             "description": "The same data signed in place with the website's demo key, which is held in software."},
            {"file": tampered.name, "light": "violet",
             "description": "The hardware-signed file with an extra diffraction peak added after signing."},
            {"file": raw_path.name, "light": "red", "sign": True,
             "description": "The same data, converted to HDF5 but not signed."},
        ], indent=2) + "\n")
    else:
        shutil.copy(DEMO / "demo-root.pem", out / "demo-root.pem")
    roots = load_certificates_pem((DEMO / "demo-root.pem").read_bytes())
    for p in (raw_path, hw, sw, tampered):
        r = verify_file(p, roots=roots)
        print(f"{p.name:34s} {p.stat().st_size / 1e6:5.1f} MB  {r.status:10s} {r.assurance.level}")


if __name__ == "__main__":
    main()
