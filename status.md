# Project Status

This page describes the state of the project as of October 2026. The reference implementation is under active development and its repository is not yet public.

## Current infrastructure

- **A specification** for signed frames, signed runs, and signed datasets, written so that it can be implemented without reading our code.
- **A reference implementation in Python** that signs and verifies data, with support for CBF/imgCIF files and a generic adapter for any other file. It supports Ed25519 and ECDSA P-256 signatures, test certificate authorities with chain validation, signing of complete runs using Merkle trees, runs packed into a single HDF5 file and verified frame by frame, the three-layer key hierarchy, signed dataset bundles, RFC 3161 timestamps, and revocation lists.
- **Runs judged as a whole.** A signed run receives a single label: if one pixel of one frame differs from what was signed, the whole run is reported as tampered, and the report names the frame. The verifier also checks that every frame of a run is present exactly once, both in a packed HDF5 run and in a set of individual frames, and accounts for every file in a bundle, including those that are unsigned, unreadable, or duplicated.
- **Checkpoints for a run in progress.** While a run is being recorded, the detector can sign checkpoints over the frames written so far, so that frames lost or replaced before the run is closed can be detected.
- **HDF5 files signed in place.** HyperSpy, EMD, and NeXus files can be signed without changing their layout. The signature covers the arrays and the metadata tree, so an edited attribute such as a calibration is reported as a metadata change rather than as tampering.
- **Signatures for processed data.** A processed frame can name the signed frames it was made from, so that a chain from the raw data to the result can be verified link by link. A processed frame can never claim more than custodial assurance, whatever key signs it.
- **Audits after a key is withdrawn.** Given a set of signed files and runs, the audit command lists every file that depends on a withdrawn or suspect key.
- **Stricter certificate path validation**, covering the parts of RFC 5280 that a detector certificate chain uses, such as path length, key usage, and name constraints.
- **Hardware-backed signing** with keys that cannot be exported, using the TPM on Windows and Linux and the Secure Enclave on macOS. A TPM key can be bound to a PIN, so that other software on the same computer cannot sign with it. These computers stand in for the secure element of a detector, and use the same code path.
- **An independent verifier that runs in a web browser** with no dependencies, which reads files locally and never uploads them, and a browser-based signer. Both can be tried on the [Verify Data](demonstration/verify.md) and [Sign Data](demonstration/sign.md) pages. The verifier does not yet check timestamps or revocation, and the copy on this site does not yet read runs packed into HDF5.
- **A demonstration manufacturer** with a published root certificate, revocation lists, and two units, one of which has been withdrawn, described on the [demo page](demo.md).
- **A desktop viewer and a browser viewer** that display each frame together with its verification result.
- **More than 800 automated tests**, a shared set of test vectors used by both verifiers, and a collection of deliberately corrupted files, which both verifiers must either reject with a clear error or report as failed.

## Remaining work

- **Detector support.** No detector currently signs data in hardware, and every certificate in our demonstrations comes from a test CA that we create. The scheme provides evidence of origin only once a key is held inside a detector, as described in [Manufacturer requirements](manufacturers.md).
- **A permanent namespace for the policy identifiers.** The identifiers need to be registered by a neutral organization before any detector ships with this capability.
- **HDF5 as a detector writes it.** HDF5 files can be signed in place once they are complete, but not yet while a detector streams frames into them. NeXus master files that point to data in other files through external links cannot be signed this way, and a Zarr binding for HyperSpy and quantEM data is in progress.
- **Processed data beyond single frames.** Processing chains work for individual frames. Runs as inputs or outputs, and reduced data such as reflection lists and CIF files, are not yet supported.
- **Feature parity in the browser.** The browser verifier still lacks revocation, timestamps, processing chains, checkpoints, and the stricter certificate path validation of the Python verifier.
- **Support for hardware security modules (HSMs) and security keys**, through a PKCS#11 interface, which a facility signing service would need.
- **A transparency log**, without which a timestamp still depends on trusting the timestamping authority not to backdate it.

A detailed list of open items is kept in the repository of the reference implementation.

## Open questions

1. **The scope of a first deployment.** A signing service at a facility can be deployed now and reaches the `custodial` level, while the `instrument` level requires manufacturer support. These two levels make very different claims, and should be presented differently.
2. **The location of the signing key.** The options include the acquisition computer, a TPM in the detector, or a dedicated secure element on the detector board. Signing complete runs removes most of the performance argument against the third option.
3. **The operator of the timestamping authority.** A facility can run one now without waiting for detector firmware. A TSA run by a manufacturer is easier to deploy, but cannot provide independent evidence if that manufacturer is compromised.
4. **The owner of the policy identifiers.** A manufacturer that asserts that a key is held inside an instrument makes a statement that no verifier can check, and the identifier for that statement needs a neutral owner.
5. **The definition of a change in detector state.** A sensor replacement, repair, or firmware update should trigger a new state key, and manufacturers need to decide whether the new key is issued automatically.

## Contributing

Development takes place in the [Detector Provenance organization on GitHub](https://github.com/detectorprovenance). We welcome contributions from researchers, facilities, journals, data repositories, and detector manufacturers.
