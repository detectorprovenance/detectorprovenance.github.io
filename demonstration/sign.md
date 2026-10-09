# Sign Data

:::{anywidget} ../widgets/sign-demo.js
:::

This tool adds a signature to a file entirely in your web browser and lets you download the result. Files you load are never uploaded. To check a signed file, load it into the [verifier](verify.md).

## Signing keys

We provide two keys, which show why a valid signature is not sufficient by itself. The website's demo key carries a certificate from the demonstration manufacturer, but because the key is published with this page, anyone can use it to sign any file, and its certificate is therefore custodial. A key generated in your browser produces an equally valid signature that traces back to no manufacturer. Neither key can produce a green light, since a web page has no access to a key held inside a detector.

## File formats

CBF files and HDF5 files, such as HyperSpy `.hspy`, EMD and NeXus files, are signed in place: the signature is added inside the file, which still opens in its usual software. Proprietary formats that rosettasciio can read, such as Digital Micrograph `.dm3` and `.dm4` files, are first converted to HyperSpy's open `.hspy` format, with their data and metadata, and the converted file is signed. Zarr stores, such as quantEM files and HyperSpy `.zspy`, are signed in place when loaded as a `.zip`: the signature is added as an attribute of the root group, and quantEM, HyperSpy and zarr open the signed store as before. Every other format receives a separate `.framesig` signature file, and the original file is left unchanged. HDF5 and Zarr signing and format conversion use our Python reference implementation and rosettasciio, which run inside your browser using Pyodide, so the first such file takes 10 to 20 s while they load.

## Sample files

The unsigned samples in the tool above can also be downloaded: {download}`unsigned.cbf <../demo/samples/unsigned.cbf>`, {download}`moire_diffraction_raw.hspy <../demo/samples/moire_diffraction_raw.hspy>`, {download}`moire_diffraction_quantem_raw.zip <../demo/samples/moire_diffraction_quantem_raw.zip>`, {download}`moire_diffraction_zspy_raw.zip <../demo/samples/moire_diffraction_zspy_raw.zip>`.
