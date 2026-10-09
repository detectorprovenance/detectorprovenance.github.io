# Verify Data

:::{anywidget} ../widgets/verify-demo.js
:::

This tool verifies files entirely in your web browser. Files you load are read and processed on your own computer and are never uploaded, so the tool is safe to use with unpublished data. It uses the same JavaScript implementation of the specification that we test against our Python reference implementation.

## Results

The verifier checks each file against the root certificate of a demonstration manufacturer and reports one of four results:

- **Green, hardware signed.** The file is unchanged since it was signed inside a manufacturer-certified instrument during a physical exposure.
- **Yellow, software signed.** The file is unchanged since signing, but the key was held in software, or the detector reported a non-physical acquisition such as a test pattern.
- **Red, unverified.** The file is unsigned, or its signature is valid but the key traces back to no manufacturer, so anyone could have produced it.
- **Violet, modified.** The data or metadata changed after signing, or the signature does not match the signed record.

CBF files, HDF5 files such as HyperSpy `.hspy`, and zipped Zarr stores such as quantEM files and HyperSpy `.zspy` carry their signature inside the file and can be loaded on their own. Any other signed file must be loaded together with its `.framesig` signature file. CBF files are verified by our JavaScript implementation, and HDF5 and Zarr files by our Python reference implementation, which runs inside your browser using Pyodide; the first such file takes about 10 s while Python loads. The trust anchor for this demonstration is a certificate authority that we created for the purpose. Real data would be verified against the root certificate published by the manufacturer of the detector that recorded them.

## Sample files

The sample files cover all four results. The CBF samples are simulated diffraction frames. The other samples contain a real moiré diffraction pattern, recorded on a transmission electron microscope and converted from Digital Micrograph format, saved as HyperSpy `.hspy` (HDF5), as a quantEM Zarr file, and as HyperSpy `.zspy` (Zarr), each zipped where needed so that it is a single file. We signed the hardware-signed samples with a key held in the secure hardware of a laptop computer, which stands in for the secure element of a detector.

All samples and the trust anchor can be downloaded, for example to check them with the command-line verifier:

- **CBF:** {download}`genuine.cbf <../demo/samples/genuine.cbf>`, {download}`software-signed.cbf <../demo/samples/software-signed.cbf>`, {download}`test-pattern.cbf <../demo/samples/test-pattern.cbf>`, {download}`fabricated.cbf <../demo/samples/fabricated.cbf>`, {download}`unsigned.cbf <../demo/samples/unsigned.cbf>`, {download}`tampered.cbf <../demo/samples/tampered.cbf>`, {download}`metadata-modified.cbf <../demo/samples/metadata-modified.cbf>`.
- **HyperSpy `.hspy`:** {download}`moire_diffraction_hardware-signed.hspy <../demo/samples/moire_diffraction_hardware-signed.hspy>`, {download}`moire_diffraction_software-signed.hspy <../demo/samples/moire_diffraction_software-signed.hspy>`, {download}`moire_diffraction_metadata-modified.hspy <../demo/samples/moire_diffraction_metadata-modified.hspy>`, {download}`moire_diffraction_tampered.hspy <../demo/samples/moire_diffraction_tampered.hspy>`, {download}`moire_diffraction_raw.hspy <../demo/samples/moire_diffraction_raw.hspy>`.
- **quantEM and HyperSpy `.zspy`:** {download}`moire_diffraction_quantem_hardware-signed.zip <../demo/samples/moire_diffraction_quantem_hardware-signed.zip>`, {download}`moire_diffraction_quantem_software-signed.zip <../demo/samples/moire_diffraction_quantem_software-signed.zip>`, {download}`moire_diffraction_quantem_tampered.zip <../demo/samples/moire_diffraction_quantem_tampered.zip>`, {download}`moire_diffraction_quantem_raw.zip <../demo/samples/moire_diffraction_quantem_raw.zip>`, {download}`moire_diffraction_zspy_hardware-signed.zip <../demo/samples/moire_diffraction_zspy_hardware-signed.zip>`, {download}`moire_diffraction_zspy_tampered.zip <../demo/samples/moire_diffraction_zspy_tampered.zip>`, {download}`moire_diffraction_zspy_raw.zip <../demo/samples/moire_diffraction_zspy_raw.zip>`.
- **Trust anchor:** {download}`demo-root.pem <../demo/demo-root.pem>`.
