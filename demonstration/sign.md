# Sign Data

:::{anywidget} ../widgets/sign-demo.js
:::

This tool adds a signature to a file entirely in your web browser and lets you download the result. Files you load are never uploaded. To check a signed file, load it into the [verifier](verify.md).

## Signing keys

We provide two keys, which show why a valid signature is not sufficient by itself. The website's demo key carries a certificate from the demonstration manufacturer, but because the key is published with this page, anyone can use it to sign any file, and its certificate is therefore custodial. A key generated in your browser produces an equally valid signature that traces back to no manufacturer. Neither key can produce a green light, since a web page has no access to a key held inside a detector.

## File formats

CBF files are signed in place. Every other format receives a separate `.framesig` signature file, and the original file is left unchanged. Support for proprietary formats, which will be converted to open formats such as HDF5 or ZSpy before signing, is in development.
