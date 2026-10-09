# Project Status

This page describes the state of the project as of October 2026. The reference implementation is under active development and its repository is not yet public.

## Current infrastructure

- **A specification** for signed frames, signed runs, and signed datasets, written so that it can be implemented without reading our code.
- **A reference implementation in Python** that signs and verifies data, with support for CBF/imgCIF files and a generic adapter for any other file. It supports Ed25519 and ECDSA P-256 signatures, test certificate authorities with chain validation, signing of complete runs using Merkle trees, the three-layer key hierarchy, signed dataset bundles, RFC 3161 timestamps, and revocation lists.
- **Hardware-backed signing** with keys that cannot be exported, using the TPM on Windows and Linux and the Secure Enclave on macOS. These computers stand in for the secure element of a detector, and use the same code path.
- **An independent verifier that runs in a web browser** with no dependencies, which reads files locally and never uploads them. It does not yet check timestamps or revocation.
- **A desktop viewer and a browser viewer** that display each frame together with its verification result.
- **Several hundred automated tests**, a shared set of test vectors used by both verifiers, and a collection of deliberately corrupted files, which both verifiers must either reject with a clear error or report as failed.

## Remaining work

- **Detector support.** No detector currently signs data in hardware, and every certificate in our demonstrations comes from a test CA that we create. The scheme provides evidence of origin only once a key is held inside a detector, as described in [Manufacturer requirements](manufacturers.md).
- **A permanent namespace for the policy identifiers.** The identifiers need to be registered by a neutral organization before any detector ships with this capability.
- **A NeXus/HDF5 adapter**, which would extend format-specific support to electron microscopy data such as 4D-STEM datasets and spectrum images.
- **Signatures for processed data.** Processing steps such as integration, reconstruction, or background subtraction should extend the record of provenance instead of breaking it. This is designed but not built.
- **Support for hardware security modules (HSMs) and security keys**, through a PKCS#11 interface, which a facility signing service would need.
- **A transparency log**, without which a timestamp still depends on trusting the timestamping authority not to backdate it.

## Open questions

1. **The scope of a first deployment.** A signing service at a facility can be deployed now and reaches the `custodial` level, while the `instrument` level requires manufacturer support. These two levels make very different claims, and should be presented differently.
2. **The location of the signing key.** The options include the acquisition computer, a TPM in the detector, or a dedicated secure element on the detector board. Signing complete runs removes most of the performance argument against the third option.
3. **The operator of the timestamping authority.** A facility can run one now without waiting for detector firmware. A TSA run by a manufacturer is easier to deploy, but cannot provide independent evidence if that manufacturer is compromised.
4. **The owner of the policy identifiers.** A manufacturer that asserts that a key is held inside an instrument makes a statement that no verifier can check, and the identifier for that statement needs a neutral owner.
5. **The definition of a change in detector state.** A sensor replacement, repair, or firmware update should trigger a new state key, and manufacturers need to decide whether the new key is issued automatically.

## Contributing

Development takes place in the [Detector Provenance organization on GitHub](https://github.com/detectorprovenance). We welcome contributions from researchers, facilities, journals, data repositories, and detector manufacturers.
