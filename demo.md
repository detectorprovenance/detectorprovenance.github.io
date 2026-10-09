# Demo Vendor

This site hosts a demonstration detector vendor. It is not a real company, and its keys exist only to show how withdrawing a detector's key works. The vendor has two detector units:

- `DEMO-0001` (`good/`) is in good standing.
- `DEMO-0002` (`withdrawn/`) is listed as withdrawn, because the vendor treats its key as stolen.

Each unit recorded a rotation run of 1024 x 1024 frames and signed it as one Run-HDF5 file: 20 frames for `DEMO-0001`, 6 for `DEMO-0002`. The first three frames of each run are also published as individually signed CBF files. A third folder, `tampered/`, holds a copy of the good run in which a single pixel of one frame was raised by one count. The vendor publishes two signed revocation lists, one for each certificate authority that issues certificates. Every certificate names the list that covers it, and these are the URLs a verifier fetches with `--online`.

| File | Content |
| --- | --- |
| [`root.cert.pem`](https://detectorprovenance.github.io/demo-vendor/root.cert.pem) | The vendor's root certificate. This is the trust anchor you pass to `--trust`. |
| [`issuing.cert.pem`](https://detectorprovenance.github.io/demo-vendor/issuing.cert.pem) | The issuing certificate authority, which signs the unit certificates. |
| [`root.list.json`](https://detectorprovenance.github.io/demo-vendor/root.list.json) | The root's revocation list. It withdraws nothing. |
| [`issuing.list.json`](https://detectorprovenance.github.io/demo-vendor/issuing.list.json) | The issuing authority's revocation list. It withdraws `DEMO-0002`. |
| `good/`, `withdrawn/` | Per unit: `chain.pem`, the whole run as `run.h5`, and its first three frames as signed `frame_000N.cbf`. |
| `tampered/` | `run.h5`: the good run with one pixel of frame 7 changed. |

## Try it

The reference implementation `framesig` is not yet public (see [Project status](status.md)). Once it is installed, the following commands download the demo and check it.

```bash
base=https://detectorprovenance.github.io/demo-vendor
curl -O $base/root.cert.pem
for unit in good withdrawn; do
  mkdir -p $unit
  for f in run.h5 chain.pem frame_0000.cbf frame_0001.cbf frame_0002.cbf; do
    curl -o $unit/$f $base/$unit/$f
  done
done
mkdir -p tampered && curl -o tampered/run.h5 $base/tampered/run.h5

framesig verify-run good/run.h5 --trust root.cert.pem --online
framesig verify-run tampered/run.h5 --trust root.cert.pem
framesig verify-run withdrawn/run.h5 --trust root.cert.pem --online
framesig audit good --trust root.cert.pem --online
framesig audit withdrawn --trust root.cert.pem --online
```

Verification works offline by default, and only `--online` makes the verifier fetch the two revocation lists. A list is accepted only when its signature verifies under the key of the certificate authority that issued the certificate, and that authority traces back to `root.cert.pem`. A list that cannot be fetched, or has expired, makes the result `suspect`. It is never treated as `clean`.

## What you will see

For the good unit, all 20 frames verify and both certificates are reported as not revoked. The command exits with status 0:

```text
run: intact
OK   repackaged         frame 0
...
signer: trusted
.../issuing.list.json: revocation list from Demo Detector Vendor (not a real company), dated ..., signature valid against a pinned key
.../root.list.json: revocation list from Demo Detector Vendor (not a real company), dated ..., signature valid against a pinned key
  clean    leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0001: not revoked
  clean    intermediate O=Demo Detector Vendor (not a real company),CN=Demo Detector Issuing CA: not revoked
```

The tampered copy is signed by the same unit in good standing, and 19 of its 20 frames are untouched. The one changed count cannot be seen in any viewer, but the run as a whole is labelled tampered, and the command exits with status 1:

```text
run: tampered (1 of 20 frame(s) differ from what was signed)
FAIL tampered           frame 7  (pixel values differ from the signed frame)
signer: trusted
```

Who signed the run and whether its pixels are as signed are separate questions. The signer is still trusted, but the data are no longer what was signed.

The withdrawn unit's frames are still byte-for-byte intact. The verifier nevertheless fails the run, with exit status 1, because the key that signed it is listed as compromised:

```text
  revoked  leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0002: revoked (keyCompromise since ...)
```

`framesig audit` answers the question a repository or journal asks after a withdrawal: which files in this dataset depend on the withdrawn identity? For `good/` the answer is `nothing in this dataset depends on a withdrawn identity.` For `withdrawn/` the run and every loose frame are listed:

```text
GONE leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0002
     revoked (keyCompromise since ...)
       - no trustworthy signing time is available, so it cannot be shown that this signature predates the compromise

4 file(s) depend on a withdrawn or suspect identity:
  revoked  run.h5 (run of 6 frames)
  revoked  frame_0000.cbf
  ...
```

These frames carry no timestamp from a trusted authority. The verifier therefore cannot show that they were signed before the key was stolen, and treats them as signed afterwards. A withdrawal removes the evidence of where data came from. It does not show that the data are wrong.

## Limitations of the demo

- A real vendor's revocation lists would be valid for a few days and re-signed continuously. The demo lists are valid for one year so that the demo keeps working without a signing service. They are regenerated before they expire.
- Every certificate in the demo is a test certificate, and the demo private keys are kept outside this repository. Data signed by this vendor reaches the `custodial` assurance level at most, and never `instrument`.
- The [browser verifier](demonstration/verify.md) does not yet check revocation, so it reports the signed frames of both units identically. The copy on this site does not yet read runs packed into HDF5, so the runs, including the tampered one, need the command-line verifier.
