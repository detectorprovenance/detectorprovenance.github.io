# Detector Provenance

Overview and documentation site for **Detector Provenance**, an open specification and set of tools for verifying the provenance of scientific detector data, including images, movies, and spectra.

Live site: <https://detectorprovenance.github.io/>

## Building the site

The site is built with [MyST Markdown](https://mystmd.org/):

```bash
npm install -g mystmd   # or: pip install mystmd
myst start              # local dev server with live reload
myst build --html       # static site in _build/html
```

The theme's search opens a pop-up dialog by default. To replace it with a flat search bar in the top bar, run the theme patch once after the template has been downloaded (any `myst build` or `myst start` downloads it), then restart the dev server:

```bash
myst build && python3 scripts/patch_theme.py && myst start
```

Re-run the patch whenever `_build/` is cleared.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow in `.github/workflows/deploy.yml`, which fetches the theme, applies `scripts/patch_theme.py`, builds the site, and publishes it to GitHub Pages. One-time setup on GitHub: repository **Settings → Pages → Source → GitHub Actions**.

The workflow serves the site from the domain root if the repository is named `detectorprovenance.github.io`, and from `/<repository name>/` otherwise.

## Layout

- `index.md`: landing page
- `threat-model.md`, `how-it-works.md`, `assurance.md`, `manufacturers.md`, `status.md`: overview pages
- `demo.md`, `demo-vendor/`: the demo vendor page and the files it serves (certificates, signed revocation lists, signed frames and runs). The deploy workflow copies `demo-vendor/` into the built site, because MyST publishes only pages and the files they reference. The lists expire in October 2027; regenerate before then with `tools/make_demo_vendor.py` from the reference implementation. The certificates name `https://detectorprovenance.github.io/demo-vendor/`, so the demo works only from the domain root
- `myst.yml`: site config, abbreviations, and table of contents
- `style.css`: theme overrides for the MyST book-theme, including the search bar in light and dark mode
- `scripts/patch_theme.py`: theme patch (flat top-bar search)
- `assets/figures/`: figures, in light and dark variants; `scripts/figures/make_trust_chain.py` regenerates the trust-chain figure
- `assets/artwork/`: artwork, in light and dark variants

## License

BSD 3-Clause, see [LICENSE](LICENSE).
