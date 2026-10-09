# Threat Model

Most data integrity systems protect against a third party who alters someone else's data, for example during network transfer or in an archive. In this project, we assume that the person publishing the data may have fabricated it. This person controls the acquisition computer, the data files, the processing software, and the description of the experiment, and can present simulated or generated data as a real measurement.

## Alternative approaches

This assumption rules out four common approaches.

1. **Checking whether a signature is valid.** A generative model can produce a fabricated frame, a fabricated key pair, a signature of the frame made with that key, and a copy of the public key embedded in the file. The result verifies correctly, so a tool that treats a valid signature as a pass would certify the fabrication.
2. **Signing data on a facility computer.** A signing service running on the acquisition computer signs whatever data it receives, and the author often controls that computer. This approach protects against later modification of an archive, but provides no protection against fabrication.
3. **Detecting fabricated data statistically.** Any test that looks for signs of simulation can be used to train the next generative model, so its accuracy decreases over time.
4. **Watermarking data.** A watermark hides a signal inside the data, for example in the low-order bits of each pixel or as a pattern in the frequency domain. Modifying the low-order bits of counted data corrupts the Poisson statistics that quantitative analysis depends on, and routine processing such as cropping, binning, drift correction, and denoising removes the mark. A watermark also only identifies data from a generator that adds it, and most of the simulation codes used in microscopy and crystallography are open source.

## Hardware-held keys

An author cannot produce a valid signature with a key they have never had access to. Our design therefore depends on two conditions: the signing key must be impossible to extract from the detector, and the detector must only sign data that came from its own sensor. If both conditions hold, producing a signed fabrication requires physical possession of a specific instrument and the ability to extract a key from a certified secure element. The [manufacturer requirements](manufacturers.md) describe how to meet both conditions.

TLS certificates for web servers use the same approach, where a certificate authority (CA) vouches for each server's key, as do C2PA Content Credentials, which several camera manufacturers now use to sign photographs inside the camera. The device identity follows IEEE 802.1AR, a standard that manufacturers of network equipment already use to install a unique certificate in each device at manufacture.

## Limitations

- **Dishonest experiments.** A real detector recording a fabricated physical setup, such as a printed mask, a modulated beam, or the wrong sample, produces genuine signed frames, because the signature covers only the path from the sensor to the file. This attack requires an instrument and laboratory work, which makes it orders of magnitude more expensive than generating data with software.
- **Extracted private keys.** A key extracted from a secure element can sign fabricated data that cannot be distinguished from genuine data. Per-device keys limit the damage to one instrument, and revocation together with trusted timestamps limits it to a time window.
- **Selective reporting.** A signature cannot show whether a published image is representative of the sample, since an author can select one field of view from hundreds of genuine measurements, or record a genuine image of a mislabeled specimen. The provenance of the sample itself remains the responsibility of the researchers.
- **Data injected before signing.** If the signing function receives data from a compromised acquisition chain, it signs that data. This gap becomes smaller as the signing step moves closer to the sensor, so a secure element on the detector board is preferable to a signing service on the acquisition computer.
- **Unsigned data.** Almost every dataset ever recorded is unsigned, so the absence of a signature is not evidence of fabrication.
