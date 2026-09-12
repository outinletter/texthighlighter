# Walkthrough - Standardize Route Badge Style on COPY OF ATS FPL Page

I have standardized the route information badge on the "COPY OF ATS FPL" page to match the stylistic choices (Bold, Font Size 9) used throughout the document for automated annotations.

## Changes

### [PDF Engine]

#### [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

- **Font Style**: Updated the route badge to use `boldFont` for better visibility and consistency.
- **Font Size**: Adjusted the font size (`rSize`) from `11` to `9` to match other badges like the Fuel difference, TAF time, and IATA route badges.
- **Wrap Logic**: Updated the text wrapping calculation to use `boldFont` for accurate width measurement.

## Verification Results

### Manual Verification
- The route info badge on the "COPY OF ATS FPL" page now correctly reflects the standardized bold style and size 9, ensuring it no longer looks different from the other automated badges in the PDF.
