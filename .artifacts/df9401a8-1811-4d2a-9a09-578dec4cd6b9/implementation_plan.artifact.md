# Standardize Route Badge Style on COPY OF ATS FPL Page

Ensure the route information badge on the "COPY OF ATS FPL" page matches the text style (Bold, Font Size 9) used by other automated badges in the project.

## Proposed Changes

### [PDF Engine]

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

- Update the "COPY OF ATS" route badge logic to use `boldFont` instead of `stdFont`.
- Change the font size (`rSize`) from `11` to `9` to match the project's annotation standard.
- This ensures visual consistency across all pages of the generated PDF.

## Verification Plan

### Manual Verification
1. Run the engine on a flight package.
2. Navigate to the "COPY OF ATS FPL" page in the resulting PDF.
3. Verify that the route info badge is now in bold and has the same font size as the badges on other pages (like the IATA route badge or TAF time badges).
