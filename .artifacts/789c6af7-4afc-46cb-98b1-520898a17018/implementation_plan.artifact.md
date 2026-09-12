# Fix Route Information Pasting Issue in PDF Engine

The goal is to fix an issue where route information extracted from the `CFP PLAN` section is correctly pasted on the `COPY OF ATS FPL` page in some documents, but not in others when the page order is different or when the ATS FPL spans multiple pages.

## User Review Required

> [!IMPORTANT]
> The fix assumes that the "COPY OF ATS FPL" section may span multiple pages and that the route information should be pasted on the page containing the "SUBMITTED AT" anchor.

## Proposed Changes

### PDF Engine Logic

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/texthighlighter/js/pdf-engine.js)

1.  **Improve Page Identification:**
    *   Update the page scanning loop to separately identify the starting page of a section (for bookmarks) and the target page for annotations (specifically for `COPY OF ATS FPL`).
    *   For `COPY OF ATS`, favor the page that contains the text `SUBMITTED AT` as the annotation target.
2.  **Update Annotation Logic:**
    *   Use the newly identified `coaAnnotationPageIdx` for drawing the route information and highlighting ATS words.
    *   Ensure that if `SUBMITTED AT` is not found on the identified page, it still defaults to a sensible location (bottom of the page) but on the *correct* page.
3.  **Boundary Logic Safety:**
    *   Verify that `cfpEndIdx` (used for route extraction) is correctly calculated even when section markers appear in unexpected orders.

## Verification Plan

### Manual Verification
1.  Test with the known "good" document (`0803 054.pdf`) to ensure no regressions.
2.  Test with the "bad" document (different page order) to verify that the route info is now correctly pasted on the `COPY OF ATS FPL` page at the expected position (near `SUBMITTED AT`).
3.  Check that the PDF bookmarks still point to the correct start of each section.
