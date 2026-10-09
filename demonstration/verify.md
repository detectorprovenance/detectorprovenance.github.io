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

A CBF file can be loaded on its own; any other signed file must be loaded together with its `.framesig` signature file. The trust anchor for this demonstration is a certificate authority that we created for the purpose. Real data would be verified against the root certificate published by the manufacturer of the detector that recorded them.

## Sample files

The sample files cover all four results. We signed the genuine sample with a key held in the secure hardware of a laptop computer, which stands in for the secure element of a detector. The samples and the trust anchor can also be downloaded, for example to check them with the command-line verifier: {download}`genuine.cbf <../demo/samples/genuine.cbf>`, {download}`software-signed.cbf <../demo/samples/software-signed.cbf>`, {download}`test-pattern.cbf <../demo/samples/test-pattern.cbf>`, {download}`fabricated.cbf <../demo/samples/fabricated.cbf>`, {download}`unsigned.cbf <../demo/samples/unsigned.cbf>`, {download}`tampered.cbf <../demo/samples/tampered.cbf>`, {download}`metadata-modified.cbf <../demo/samples/metadata-modified.cbf>`, and the demo root certificate {download}`demo-root.pem <../demo/demo-root.pem>`.
