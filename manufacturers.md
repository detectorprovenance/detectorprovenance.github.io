# Manufacturer Requirements

Data from a detector can only be distinguished from fabricated data if the detector manufacturer implements the seven requirements below. None of them requires new research, and several follow existing standards that manufacturers of network equipment already use. These requirements allow an instrument to certify that it recorded a dataset, in a form that anyone can verify using only the manufacturer's public key.

## Requirements

1. **Key generation inside the detector.** The detector generates its key pair inside a secure element, such as a TPM 2.0 or a dedicated security chip with a certified guarantee that keys cannot be exported. The private key must never exist outside that chip, including in firmware, provisioning databases, service laptops, or escrow. Each unit needs its own key, because a key shared across a product line means that one extraction compromises every instrument ever sold.

2. **Manufacturer certificates.** At manufacture, the vendor signs a certificate that binds the unit's public key to its serial number, through a chain from an offline root CA to an issuing CA to the unit certificate. This is the device identity (IDevID) defined by IEEE 802.1AR, and manufacturers that already ship 802.1AR certificates can reuse the same process and tools. The certificate carries a policy identifier stating that the key is held inside the instrument and can only be reached from the sensor readout path. The root certificate should be published at a stable URL.

3. **Isolation of the signing function.** The signing function must be reachable only from the sensor readout path, and not from the control interface, the file-writing software, service or debug commands, or the firmware update mechanism. If any command can submit an arbitrary buffer for signing, an author can upload a fabricated frame and receive a valid instrument signature for it. We expect this requirement to be the most difficult to meet, because it constrains the detector architecture and must be designed in from the start.

4. **Labeling of non-physical modes.** Test patterns, dark and flat-field calibrations, software triggers, and simulation modes must still produce signed data, but the signed record must state the acquisition mode, so that these frames cannot reach the `instrument` assurance level. Using a separate key for non-physical modes is preferable, because the distinction then survives errors in handling the signed record.

5. **Signing complete runs.** A secure element can produce approximately 10 signatures per second, while detectors record hundreds to thousands of frames per second, so per-frame signing is not feasible. The detector should compute a digest for every frame as it is written, which is a natural task for the field-programmable gate array (FPGA) that already processes every frame, combine the digests into a Merkle tree, and sign the root once per run or every few seconds during a long run.

6. **Trusted timestamps.** The detector's internal clock is set by the signer, and cannot be used as evidence of when data were recorded. The detector should either embed an RFC 3161 timestamp from a timestamping authority, or expose the Merkle root of each run so that a facility can timestamp it.

7. **Open format and independent verification.** Anyone must be able to verify data without vendor software, a license, or a network connection to the vendor. The specification is public, and we maintain two independent verifiers that are tested against shared test vectors.

## Estimated effort

For a manufacturer that already uses a secure element in its detectors, we estimate:

| Requirement | Estimated effort |
| --- | --- |
| 1. Key generation and provisioning | days |
| 2. CA and certificate issuance during manufacturing | weeks, mostly process changes |
| 3. Isolating the signing function to the readout path | days to weeks, depending on the architecture |
| 4. Attesting the acquisition mode | days |
| 5. Merkle tree accumulation in the FPGA or firmware | weeks |
| 6. Timestamping | days |
| 7. Open format and verifier | already available |

Requirements 2 and 3 require the most effort. Requirement 2 changes the manufacturing process and commits the manufacturer to operating a CA, and requirement 3 must be part of the detector architecture.

## Vendor neutrality

This scheme must work for every detector manufacturer, and must not become a feature of any single vendor. Each manufacturer runs its own root CA, issuing CA, and device provisioning, because each vendor vouches only for its own hardware, and no vendor should be able to certify another vendor's detectors. The shared components are the file format, the signed record, the assurance levels, and the policy identifier that states that a key is held inside an instrument. With these shared components, a single verifier can check data from every manufacturer, in the same way that the CA/Browser Forum defines shared certificate policies for the web while every certificate authority operates independently.

The policy identifiers currently use a namespace that is reserved for documentation examples. Before any detector ships with this capability, the identifiers need a permanent namespace, ideally held by a neutral organization instead of by a single manufacturer or research group.
