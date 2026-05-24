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
- `assets/mesh/gallery-web/**/*.ply.gz` contains compressed web chunks of the same scene set;
  large meshes are edge-cropped and deterministically random-sampled to fit GitHub Pages.
- `assets/mesh/gallery-web/dl3dv/additional/*.ply.gz` contains the individually processed web meshes
  from `/Users/bytedance/Downloads/scale0.75` and `/Users/bytedance/Downloads/scale0.5`; each
  file is centered, scaled, gzip-compressed, and kept below GitHub's single-file upload limit.
- `assets/figures/web/*.png` are size-optimized web renderings of the paper figures.
- The paper button points to a placeholder arXiv URL until the public preprint is available.

## Rebuilding Mesh Display Assets

The page keeps full-resolution originals in `assets/mesh/gallery/` and uses edge-cropped,
deterministically random-sampled web chunks from `assets/mesh/gallery-web/` for GitHub Pages
delivery. Regenerate the chunks after replacing any PLY:

```bash
node scripts/build-web-meshes.mjs
```

Downloaded high-density meshes are processed one file at a time by the dedicated script:

```bash
node --max-old-space-size=4096 scripts/process-downloaded-meshes.mjs \
  /Users/bytedance/Downloads/scale0.75 \
  /Users/bytedance/Downloads/scale0.5
```

## QA

With the local server running, this command checks responsive layout, text overflow, key overlap,
lazy-loading boundaries, and hero video loading behavior:

```bash
node qa-layout.mjs
```
