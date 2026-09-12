# Walkthrough - Fix Route Badge Alignment

I have corrected the alignment of the IATA route badge to ensure it aligns with the project's standard right margin for automated annotations.

## Changes

### [PDF Engine]

#### [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

- Updated the `runHL` function's route matching logic.
- Replaced the text-relative positioning (`(lineMaxX + 12) * sx`) with the page-relative positioning standard (`lw - textWidth - 36`).
- This change ensures that the `ICN/MAD` badge (and similar) will now appear perfectly aligned with other right-hand side badges like TAF time annotations.

## Verification Results

### Manual Verification
- The badge `x` coordinate now uses the same calculation as other right-aligned annotations in the codebase.
- The IATA route badge should now appear at a fixed distance from the right edge of the page, regardless of the text length in that line.
