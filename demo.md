# Demo Vendor

This site hosts a demonstration detector vendor. It is not a real company, and its keys exist only to show how withdrawing a detector's key works. The vendor has two detector units:

- `DEMO-0001` (`good/`) is in good standing.
- `DEMO-0002` (`withdrawn/`) is listed as withdrawn, because the vendor treats its key as stolen.

Each unit has signed three frames and packed them into one Run-HDF5 file. The vendor publishes two signed revocation lists, one for each certificate authority that issues certificates. Every certificate names the list that covers it, and these are the URLs a verifier fetches with `--online`.

| File | Content |
| --- | --- |
| [`root.cert.pem`](https://detectorprovenance.github.io/demo-vendor/root.cert.pem) | The vendor's root certificate. This is the trust anchor you pass to `--trust`. |
| [`issuing.cert.pem`](https://detectorprovenance.github.io/demo-vendor/issuing.cert.pem) | The issuing certificate authority, which signs the unit certificates. |
| [`root.list.json`](https://detectorprovenance.github.io/demo-vendor/root.list.json) | The root's revocation list. It withdraws nothing. |
| [`issuing.list.json`](https://detectorprovenance.github.io/demo-vendor/issuing.list.json) | The issuing authority's revocation list. It withdraws `DEMO-0002`. |
| `good/`, `withdrawn/` | Per unit: `chain.pem`, three signed frames `frame_000N.cbf`, and `run.h5`. |

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

framesig verify-run good/run.h5 --trust root.cert.pem --online
framesig verify-run withdrawn/run.h5 --trust root.cert.pem --online
framesig audit good --trust root.cert.pem --online
framesig audit withdrawn --trust root.cert.pem --online
```

Verification works offline by default, and only `--online` makes the verifier fetch the two revocation lists. A list is accepted only when its signature verifies under the key of the certificate authority that issued the certificate, and that authority traces back to `root.cert.pem`. A list that cannot be fetched, or has expired, makes the result `suspect`. It is never treated as `clean`.

## What you will see

For the good unit, all three frames verify and both certificates are reported as not revoked. The command exits with status 0:

```text
OK   repackaged         frame 0
...
signer: trusted
.../issuing.list.json: revocation list from Demo Detector Vendor (not a real company), dated ..., signature valid against a pinned key
.../root.list.json: revocation list from Demo Detector Vendor (not a real company), dated ..., signature valid against a pinned key
  clean    leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0001: not revoked
  clean    intermediate O=Demo Detector Vendor (not a real company),CN=Demo Detector Issuing CA: not revoked
```

The withdrawn unit's frames are still byte-for-byte intact. The verifier nevertheless fails the run, with exit status 1, because the key that signed it is listed as compromised:

```text
  revoked  leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0002: revoked (keyCompromise since ...)
```

`framesig audit` answers the question a repository or journal asks after a withdrawal: which files in this dataset depend on the withdrawn identity? For `good/` the answer is `nothing in this dataset depends on a withdrawn identity.` For `withdrawn/` every frame is listed:

```text
GONE leaf         OU=DEMO 1M,O=Demo Detector Vendor (not a real company),CN=DEMO-0002
     revoked (keyCompromise since ...)
       - no trustworthy signing time is available, so it cannot be shown that this signature predates the compromise

3 file(s) depend on a withdrawn or suspect identity:
```

These frames carry no timestamp from a trusted authority. The verifier therefore cannot show that they were signed before the key was stolen, and treats them as signed afterwards. A withdrawal removes the evidence of where data came from. It does not show that the data are wrong.

## Limitations of the demo

- A real vendor's revocation lists would be valid for a few days and re-signed continuously. The demo lists are valid for one year so that the demo keeps working without a signing service. They are regenerated before they expire.
- Every certificate in the demo is a test certificate, and the demo private keys are kept outside this repository. Data signed by this vendor reaches the `custodial` assurance level at most, and never `instrument`.
- The [browser verifier](how-it-works.md) does not yet check revocation, so it reports both units identically.
