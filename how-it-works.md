# Signing and Verification

The system has four components: a private key held inside the detector, a manufacturer certificate for that key, a signature over the recorded data, and a verifier that anyone can run.

:::{image} assets/figures/trust-chain-light.svg
:class: dp-light-only
:alt: Trust chain for signed detector data. At manufacture, the root CA certifies each device key through an issuing CA, and the device certificate binds the key to the detector serial number. During acquisition, the detector computes a digest of every frame and its secure element signs the Merkle root once per run. Anyone can then verify the signed run offline, using the published root certificate, and obtain the integrity and assurance results.
:::

:::{image} assets/figures/trust-chain-dark.svg
:class: dp-dark-only
:alt: Trust chain for signed detector data. At manufacture, the root CA certifies each device key through an issuing CA, and the device certificate binds the key to the detector serial number. During acquisition, the detector computes a digest of every frame and its secure element signs the Merkle root once per run. Anyone can then verify the signed run offline, using the published root certificate, and obtain the integrity and assurance results.
:::

## Keys and certificates

Each detector generates its own key pair inside a secure element, such as a Trusted Platform Module (TPM) or a dedicated security chip on the detector board. The private key never leaves this chip, and the only operation available to other software is a request to sign. The expected algorithm is ECDSA over the NIST P-256 curve, because this is the algorithm these chips implement. Every unit has its own key, so extracting the key from one detector compromises that detector and no others.

At manufacture, the vendor signs a certificate that binds the detector's public key to its serial number. The vendor's root CA is kept offline and signs an issuing CA, which in turn signs the certificate for each device. The vendor publishes the root certificate, and this root is the only thing a verifier needs to trust. The device certificate also carries a policy identifier, which is the manufacturer's statement that the key was generated inside a secure element that is part of this instrument, cannot be exported, and can only be reached from the sensor readout path. A verifier cannot check this statement cryptographically, and the policy identifier therefore makes the manufacturer accountable for it.

We use three layers of keys. The manufacturer's key signs certificates and never leaves the manufacturer. Each device has a permanent key tied to its serial number. A third key identifies the current state of the device, and is replaced whenever the detector is repaired, its sensor is replaced, or its firmware changes. The state key allows each signed dataset to be attributed to a specific detector configuration, and limits the damage from a leaked state key to one configuration period.

## Signing a frame

For each frame, the signer records a manifest that contains:

- a digest of the complete file;
- a digest of the metadata, such as wavelength, detector distance, and beam center;
- digests of the pixel data, both as stored and as decoded values;
- optional claims, such as the beamline or proposal number;
- an acquisition attestation from the detector, which records the serial number, model, firmware, sensor, and acquisition mode;
- the name, version, and source revision of the software that signed the frame, so that every frame signed by a given build can be found later.

The acquisition mode is one of `physical`, `test-pattern`, `calibration`, or `simulated`. Frames from non-physical modes can still be signed, but they cannot reach the highest assurance level, which prevents a detector from being used to sign a test pattern that is later presented as a measurement.

Separate digests for the metadata and the pixel data allow a verifier to report which part of a file has changed. For example, if someone edits the wavelength in a header, the verifier reports that the metadata was modified and the pixel values were not. The digest of the decoded pixel values remains valid after lossless recompression, so a signature survives a format conversion that does not change the measured values.

Signing the metadata together with the pixel data also protects against ordinary errors, which are far more common than fraud. Calibration values such as the pixel size, wavelength, or detector distance that were recorded at acquisition cannot later be changed, or separated from the data they describe, without the change being detected.

## Signing complete runs

A secure element requires tens of milliseconds per signature, which limits per-frame signing to approximately 10 frames per second, while modern detectors record hundreds to thousands of frames per second. We therefore compute a digest for every frame as it is written, combine the digests into a Merkle tree, and sign only the root of the tree, once per run. During a long run, the signer also folds each frame into a running hash and can sign its current value every few seconds as a checkpoint, so a run that is interrupted still has signed segments, and the checkpoints show where a gap or change occurred. Each frame stores a short proof of its position in the tree, with a size that grows logarithmically with the number of frames, so each frame remains individually verifiable offline. Because the tree records the order of the frames, a verifier can also detect frames that were removed, duplicated, or reordered, which per-frame signatures cannot detect.

We measured the effect of this design using a TPM on a standard Windows computer. Signing six frames individually took 8.1 s, while signing the same six frames as one run took 2.3 s, because the run required a single TPM operation regardless of the number of frames.

A run can also be stored as a single HDF5 file in the layout that NeXus readers expect, a stack of frames together with the signed frame records and the one run signature. HDF5 files are not byte-for-byte reproducible, so the signature covers the decoded pixel values and metadata of each frame rather than the bytes of the file, and the verifier still reports each frame separately. Before reading any pixel, the verifier rejects any content that the signature does not cover, such as an additional dataset, a link to another file, or a compression filter that would load external code. Because the work for each frame is independent, it runs on all processor cores while the run is still signed once. For frames from a 6-megapixel detector, packing a run on one workstation took 0.36 s per frame on one core and 0.08 s per frame on twelve cores, so a run of 3600 frames takes about five minutes. A run in this form is checked against the manufacturer certificate chain, revocation lists, and timestamps in the same way as a single frame, and a facility can add a timestamp to a packed run later without access to the detector key.

## Verification

Verification requires only the manufacturer's published root certificate. It requires no vendor software, no license, and no network connection. We maintain two independent verifiers, one written in Python and one that runs entirely in a web browser, and test them against a shared set of test vectors. The browser verifier reads files locally and never uploads them, which is important for unpublished data. Writing the second verifier directly from the specification exposed eight defects in the specification, and cross-checking the two verifiers exposed three implementation bugs that the tests of a single implementation had not caught.

The verifier checks the signature over the bytes exactly as received before parsing any content, and treats a malformed file as a verification result instead of an error. Each file receives the integrity and assurance results described in [Assurance levels](assurance.md).

## Signing a dataset

A frame signature establishes that a frame is genuine, but says nothing about which frames belong to a dataset. A signed bundle records the members of a dataset together with its metadata, such as the operator, ORCID, facility, beamline, proposal, and DOI. Bundle members are identified by the digest of their signed manifests instead of by filename, so renaming a file does not change its membership while substituting different data does. A verifier reports missing and unexpected files separately, so that a substituted file appears as one of each. A bundle can never raise the assurance level of its members, and the bundle's overall level is the lowest level of any member. A bundle can be stored as a single ZIP file that contains the frames, and both of our viewers can open it directly.

## Timestamps and revocation

A detector's internal clock is a claim made by the signer, and a compromised key could sign data with any date. A trusted timestamp from an independent timestamping authority (TSA), following RFC 3161, establishes that a signature existed no later than a specific time. Timestamps allow a key withdrawal to be limited to signatures made after a given date, so that a routine key replacement after a repair leaves earlier data valid, while a stolen key invalidates all of its signatures. Timestamps also keep archived data verifiable after a device certificate expires, since scientific data are kept much longer than certificates remain valid.

## Chain of custody

A detector signature anchors the first link in a longer chain of custody, which continues through calibration, reconstruction or data reduction, analysis, and the figures in a publication. Each processing step can record the content hashes of its inputs together with its code version and parameters, and sign its own output, so that a published figure can be traced back to signed detector output. Producing a convincing individual image is becoming easier, while producing a complete and internally consistent signed chain would require compromising the recording hardware. Signatures for processed data are designed but not yet implemented.

:::{image} assets/artwork/chain-of-custody-light.png
:class: dp-light-only
:alt: Six linked stages from detector output to a published figure, with a hashing motif running beneath the chain
:::

:::{image} assets/artwork/chain-of-custody-dark.png
:class: dp-dark-only
:alt: Six linked stages from detector output to a published figure, with a hashing motif running beneath the chain
:::
