# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2025-12-20

### Refactored
- **Architectural Overhaul**:
  - Split monolithic `store.ts` into modular Zustand slices (`uiSlice`, `workspaceSlice`, `calibrationSlice`, `dataSlice`).
  - Refactored `App.tsx` by extracting core logic into custom hooks (`useFileHandler`, `useGlobalShortcuts`, `useProject`, `useExport`).
  - Created dedicated `MainLayout` component for better separation of concerns.
- **Improved Codebase**:
  - Enhanced type safety and directory structure.
  - Reduced component complexity for better maintainability.

## [0.2.0] - 2025-12-14

### Added
- **Smart Wand**: New guided tracing tool for accurate curve digitization.
- **Fit & Resample**: Curve fitting (Linear, Polynomial, Exponential) with automatic point resampling.
- **Calibration Guides**: Visual crosshairs and snapping when calibrating axes for perfect alignment.
- **Series Customization**:
  - Color picker for individual data series.
  - "Name" label for clear series renaming.
- **Visual Enhancements**:
  - **POI Pins**: Updated style for independent points of interest.
  - **Cursor Coordinates**: Real-time X/Y coordinates displayed next to cursor.
  - **Unique Icons**: Distinct icons for Wand, Smart Wand, and Digitize tools.
  - **Status Indicators**: Green outline on calibration boxes when calibrated.
  - Smooth height animations for sidebar interactions.

### Fixed
- Improved recalibration logic to correctly clear and re-prompt for points.
- Fixed vertical snapping precision for calibration points.
- Enhanced Smart Wand path detection and point generation.
- Corrected various tooltip visibility and text.

## [0.1.0] - 2025-12-13

### Added
- **PDF Support**: Ability to import PDF files and select pages to digitize.
- **Project Management**:
  - Save current workspace state to JSON.
  - Load projects from JSON files.
  - Tabbed workspaces support for managing multiple projects simultaneously.
- **Digitization Tools**:
  - **Single Point Mode**: Place individual points unrelated to data series.
  - **Value Snapping**: Automatically round digitized values to set decimals or significant figures.
  - **Coordinate Labels**: Option to show X/Y values directly on the canvas next to points.
  - **Y-Axis Assignment**: Ability to assign different series to different Y-axes.
- **Export & Integration**:
  - "Export Graphics Only" feature with auto-cropping.
  - **Clipboard Support**: Paste images directly into the workspace; Copy data table to clipboard.
- **UI/UX Polish**:
  - Comprehensive visual overhaul with modern styling, animations, and gradients.
  - Improved "Empty State" with clickable start area.
  - Custom checkbox styling.
  - Moveable/Adjustable series labels.
  - Relocated Help button for better accessibility.

### Fixed
- Fixed GitHub Actions build errors.
- Resolved issues with series label positioning and overlap.

### Changed
- Updated application favicon.
- Integrated logo graphic into the main interface.
