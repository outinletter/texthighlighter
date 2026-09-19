# Centralize Badge Style Configuration

Consolidate all badge styling (background color, font size, opacity) into a single configuration object to ensure consistency and ease of maintenance.

## Proposed Changes

### [PDF Engine]

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

- Define a global `BADGE_CONFIG` constant at the top of the file containing the project's standard badge styles:
  - `fontSize: 9`
  - `bgColor: [0.88, 0.90, 0.93]`
  - `textColor: [0.15, 0.20, 0.25]`
  - `bgOpacity: 0.85`
- Update `drawDutyTimeStyleBadge` to use these values as default parameters.
- Refactor all call sites (approx. 10 locations) to remove redundant style properties, only passing essential parameters like `text`, `x`, `centerY`, and `font`.

## Verification Plan

### Automated Verification
- No automated tests available, but manual verification will ensure no visual regressions.

### Manual Verification
- Run the engine and verify that all badges (Fuel, Route, TAF, FIR, etc.) look identical in style and are consistent with the project's design.
- Change the `BADGE_CONFIG.bgColor` once and verify that all badges in the resulting PDF change color simultaneously.
