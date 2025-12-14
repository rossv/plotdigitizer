# Changelog

All notable changes to this project will be documented in this file.

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
