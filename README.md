# Plot Digitizer (React)

A simple web-based digitizer that lets you load a plot image, calibrate the axes, and record multiple series of digitized data points.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Deployment

The app's asset base path is configurable so it works on both root-domain and subpath deployments.

- By default, builds use the root path `/`.
- To deploy under a subpath (for example GitHub Pages at `/plotdigitizer/`), set either `VITE_BASE_PATH` or `BASE_URL` before building:

```bash
BASE_URL=/plotdigitizer/ npm run build
```

The GitHub Pages workflow in this repo sets the value automatically when building for that environment.

## How to use

1. **Load an image** of your chart using the file picker.
2. **Calibrate the X axis** by selecting two points on the image and entering their real-world values.
3. **Calibrate the Y axis** (per series) the same way. Toggle linear/log scaling as needed.
4. Use the **Digitize** toggle to start/stop capturing points; each click while it’s on records pixel and calibrated data coordinates for the active series.
5. Add more series from the sidebar; each series maintains its own Y-axis calibration and color.

Mouse wheel zoom and drag-to-pan make it easy to focus on your plot while digitizing.
