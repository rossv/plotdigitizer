# Plot Digitizer

Web app for extracting numeric data from plot images and PDFs.

![Plot Digitizer](./public/logo.png)

## Features

- Manual digitizing, selection/editing, and point nudging.
- Tracing tools: `Wand` (color-based auto-trace) and `Smart Wand` (beta guided tracing for dashed/intersection-heavy paths).
- Multi-series support with per-series color, naming, and Y-axis assignment.
- Multiple Y-axes with linear/log scaling and named axes.
- Axis auto-detection helper plus guided two-point calibration.
- Save/load full project JSON.
- Multiple workspace tabs per session.
- Fit and resample workflow.
- Export options: CSV download, clipboard copy (tab-delimited table), annotated image export, and graphics-only transparent overlay export.
- PDF import with page selection.
- Light/dark theme and built-in Help/Changelog modal.

## Requirements

- Node.js 18+
- npm 9+ (or compatible)

## Quick Start

```bash
npm install
npm run dev
```

Vite is configured with `strictPort: true` on port `5174`, so local dev runs at:

- `http://localhost:5174`

## Common Commands

```bash
npm run dev      # start local dev server
npm run build    # type-check + production build
npm run preview  # preview built output
npm run lint     # eslint
npm run test     # vitest
```

## Usage Flow

1. Load an image or PDF (`Load Image / PDF`, drag-and-drop, or paste from clipboard).
2. Calibrate X and Y axes with two known points each.
3. Digitize with `Digitize`, `Wand`, `Smart Wand`, or `Point`.
4. Refine selections, manage series/axes, and optionally resample points.
5. Export data (copy/CSV) or graphics (image/graphics-only).

## Deployment

```bash
npm run build
```

Base path is resolved in this order:

1. `VITE_BASE_PATH`
2. `BASE_URL`
3. Auto-derived from `GITHUB_REPOSITORY` (project page or user/org page fallback)

For GitHub Pages:

```bash
npm run deploy
```

`predeploy` runs the production build and publishes `dist` to `gh-pages`.

## Tech Stack

- React 19 + Vite
- TypeScript
- Zustand
- Konva / React-Konva
- Tailwind CSS
- pdf.js

## License

MIT
