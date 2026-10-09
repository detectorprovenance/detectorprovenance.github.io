---
title: Detector Provenance
site:
  hide_outline: true
  hide_title_block: true
---

# Provenance for Scientific Detector Data

:::{div}
:class: dp-tagline
We are developing an open specification and software tools that allow images, movies, and spectra recorded by scientific detectors to carry a cryptographic record of where they came from. Data signed inside the detector can be verified by anyone, offline, using only the detector manufacturer's published public key.
:::

## Motivation

Generative models, together with the accurate simulation codes developed for microscopy and crystallography, can now produce diffraction patterns, micrographs, and spectra that are very difficult to distinguish from real measurements. Zecca et al. found that researchers identified real electron micrographs 63% of the time and generated micrographs 78% of the time, but that their accuracy fell to 50% once real and generated images were mixed together ([Zecca et al., *Microsc. Microanal.* 2023](https://doi.org/10.1093/micmic/ozad093)). A survey of more than 250 scientists reached the same conclusion across six imaging modalities ([Davydiuk et al., *Nat. Nanotechnol.* 2025](https://doi.org/10.1038/s41565-025-02009-9)). Image manipulation also occurs without generative models, and Bik et al. found problematic image duplication in 3.8% of more than 20,000 biomedical papers ([Bik et al., *mBio* 2016](https://doi.org/10.1128/mBio.00809-16)).

A raw data file today is an unsigned sequence of bytes, and the scientific community relies on institutional trust when it assumes that a file came from a real measurement. Detecting fabricated data statistically is an arms race, because anyone producing fake data can train their generative model against the detection method. We propose signing measurements inside the detector, so that genuine data carry evidence that cannot be produced without physical access to the instrument. The [threat model](threat-model.md) describes the reasoning behind this choice.

## Detector signatures

The detector holds a private signing key inside a secure element, which is a tamper-resistant chip that generates the key and never allows it to be exported. The manufacturer issues a certificate that binds this key to the detector's serial number, using the same public key infrastructure (PKI) that secures web traffic. During acquisition, the detector computes a cryptographic digest of every frame and signs the complete run with a single signature. Anyone can then check that each file is unmodified, and that it was signed by a specific instrument certified by its manufacturer. [Signing and verification](how-it-works.md) describes the keys, certificates, signatures, and verification steps.

## Integrity and assurance

A valid signature by itself establishes very little, because anyone can generate a key and use it to sign a fabricated file. We therefore report two separate results for every file: **integrity**, which states whether the bytes have changed since signing, and **assurance**, which states what the signature establishes about the origin of the file. Only data signed during a physical exposure by a manufacturer-certified key inside the instrument passes verification. A signature cannot establish that the experiment itself was honest, since a real detector recording a fabricated sample produces genuine frames. [Assurance levels](assurance.md) defines each level.

## Users

- **Researchers** who want their published data to be verifiable by anyone.
- **Referees, journals, and data repositories** who need to check that deposited data are unmodified and were recorded by a real instrument.
- **Detector manufacturers**, who need to implement [seven requirements](manufacturers.md), none of which require new research.
- **Facilities and beamlines**, which can operate signing and timestamping services now, before any detector supports signing in hardware.

## Data formats

The specification keeps the signing and verification machinery separate from the file format, so that the same approach applies to diffraction frames, images, movies, and spectra. The current implementation supports X-ray diffraction frames stored in the Crystallographic Binary File (CBF/imgCIF) format, and can sign any other file byte for byte. A format-specific adapter such as the CBF adapter also records digests of the decoded pixel values, so that a signature remains verifiable after lossless recompression. A NeXus/HDF5 adapter is planned, which will extend this support to electron microscopy data such as 4D-STEM datasets and spectrum images.

## Project status

This project is at an early stage. We have a working reference implementation in Python, an independent verifier that runs entirely in a web browser, and hardware-backed signing using the Trusted Platform Module (TPM) or Secure Enclave built into standard computers. No detector currently signs data in hardware. [Project status](status.md) describes the current infrastructure, remaining work, and open questions.
