# Plot Digitizer

A powerful, modern web-based tool for extracting numerical data from plot images and PDFs. Built with React, Konva, and Tailwind CSS.

![Plot Digitizer](./public/logo.png)

## Features

### 🎯 core Digitization
- **Point Extraction**: Manually place points on data series to extract X/Y coordinates.
- **Auto-Trace Wand**: Automatically trace continuous lines or curves with a magic wand tool.
- **Single Points**: Annotate specific points of interest separate from data series.
- **Selection & Manipulation**: Drag, select, and delete points. Use **Arrow Keys** to nudge selections (hold **Shift** for larger steps).

### 📐 Advanced Calibration
- **Multiple Axes**: Support for multiple Y-axes on the same plot, each with its own scaling and color.
- **Log Scales**: Full support for Logarithmic scales on both X and Y axes.
- **Value Snapping**: Snap digitized points to specific decimal places or significant figures for cleaner data.

### 🛠️ Professional Tools
- **Project Management**: 
  - **Tabbed Workspaces**: Work on multiple plots simultaneously.
  - **Save & Load**: Save your entire workspace state to a local JSON file and resume later.
- **PDF Support**: Import PDF files seamlessly and select specific pages to digitize.
- **Curve Fitting**: Real-time regression analysis (Linear, Polynomial, Exponential) on your digitized data.
- **Clipboard Integration**: 
  - Paste images directly (Ctrl+V) to load them.
  - Copy data table directly to clipboard for Excel/Sheets.

### 🎨 Visual & Export
- **Modern UI**: Polished interface with Dark Mode support and smooth animations.
- **Export Data**: Download as generic CSV or Copy TSV to clipboard.
- **Export Graphics**: Save the annotated plot as an image.
  - **Graphics Only**: Export just the points/lines on a transparent/white background (auto-cropped) for overlay use.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open the shown local URL (usually `http://localhost:5173`) in your browser.

## How to Use

### 1. Load Data
- Click the center dropzone to select an **Image** (PNG, JPG, SVG) or **PDF** file.
- Or, simply **Paste** an image from your clipboard (`Ctrl+V`).

### 2. Calibrate Axes
Before digitizing, the system needs to know the scale.
- **X Axis**: Click **Calibrate X**, then click two known points on the X-axis (e.g., min and max). Enter their values.
- **Y Axis**: Click **Calibrate Y** for the default axis (or add a new one). Click two separate points on the Y-axis and enter values.
- *Toggle 'Log' if the axis uses a logarithmic scale.*

### 3. Digitize Data
- **Manual**: Click **Digitize** and start clicking along the curve. 
- **Auto-Trace**: Select **Wand**, click on a line of the graph, and follow the prompt to generate points.
- **Manage Series**: Create new Series in the sidebar to group data (e.g., "Dataset A", "Dataset B"). Each series can be assigned to a specific Y-Axis.
- **Refine**: Switch to **Select** mode to drag points or delete outliers (`Del` key).

### 4. Export
- **Data**: Use the Copy button (clipboard) or Download button (CSV) in the Points table header.
- **Visuals**: Use the Camera icon to save the workspace as an image, or the "Image Off" icon for a graphics-only export.

## Deployment

The app supports deployment to root paths or subpaths (e.g., GitHub Pages).

- **Root Domain**:
  ```bash
  npm run build
  ```
- **Subpath** (e.g., `/my-app/`):
  ```bash
  BASE_URL=/my-app/ npm run build
  ```

## Tech Stack

- **Framework**: React 19 + Vite
- **Canvas**: Konva.js / React-Konva
- **Styling**: Tailwind CSS
- **State**: Zustand
- **PDF**: pdf.js
- **Icons**: Lucide React

## License

MIT
