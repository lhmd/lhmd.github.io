# TriSplat Project Page

Static project page for **TriSplat: Simulation-Ready Feed-Forward 3D Scene Reconstruction**.

## Run Locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

The page is self-contained and does not require a build step. A local web server is needed because the interactive Three.js scenes load ES modules and binary PLY mesh assets.

## Assets

- The hero demo is embedded from YouTube: `https://youtu.be/2j8wUN6b9eA`.
- `assets/videos/` is kept local-only and ignored for GitHub Pages deployment.
- `teaser-sim.js` is the lightweight loader for the teaser playground; `teaser-playground.js`
  contains the Three.js scene with agent spawning, drive controls, mesh-ground contact, and an
  inset first-person camera.
- `assets/mesh/gallery/**/*.ply` contains the original RE10K PLY meshes and the cropped DL3DV
  meshes from `/Users/bytedance/Downloads/dl3dv_prune.zip`.
- `assets/mesh/gallery-web/**/*.ply` contains browser-friendly versions of the same scene set;
  very large meshes are face-sampled for interactive viewing while preserving the supplied scenes.
- `assets/figures/web/*.png` are size-optimized web renderings of the paper figures.
- The paper button points to a placeholder arXiv URL until the public preprint is available.

## Rebuilding Mesh Display Assets

The page keeps full-resolution originals in `assets/mesh/gallery/` and uses smaller display copies
from `assets/mesh/gallery-web/` to avoid browser stalls. Regenerate the display copies after
replacing any PLY:

```bash
node scripts/build-web-meshes.mjs
```

## QA

With the local server running, this command checks responsive layout, text overflow, key overlap,
lazy-loading boundaries, and hero video loading behavior:

```bash
node qa-layout.mjs
```
