# Fix Route Badge Alignment

Correct the alignment of the IATA route badge to follow the project's standard for right-aligned badges (using the page margin).

## Proposed Changes

### [PDF Engine]

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

- Change the `x` coordinate calculation for the route badge from text-relative (`lineMaxX + 12`) to page-relative (`lw - textWidth - 36`).
- This ensures all badges are vertically aligned to the right margin of the page, matching the TAF and FIR entry badges.

## Verification Plan

### Manual Verification
- Run the engine on a flight package.
- Verify that the `ICN/MAD` badge is now perfectly aligned with other right-aligned badges (like TAF times) at the right margin of the page.
