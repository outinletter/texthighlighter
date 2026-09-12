# Remove FLIGHT SAFETY AI BRIEFING

This plan outlines the steps to completely remove the "FLIGHT SAFETY AI BRIEFING" feature from the project, including both frontend UI and backend logic.

## Proposed Changes

### [Component Name]

#### [MODIFY] [index.html](file:///D:/Data/Project/NotamhighlighterBriefing/index.html)
- Remove the `briefingCard` HTML block.

#### [MODIFY] [style.css](file:///D:/Data/Project/NotamhighlighterBriefing/css/style.css)
- Remove all CSS classes related to the AI briefing card.

#### [MODIFY] [app.js](file:///D:/Data/Project/NotamhighlighterBriefing/js/app.js)
- Remove the `renderBriefing` async function.

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/NotamhighlighterBriefing/js/pdf-engine.js)
- Remove the data extraction logic and the call to `renderBriefing` at the end of the PDF processing.

#### [MODIFY] [worker.js](file:///D:/Data/Project/NotamhighlighterBriefing/src/worker.js)
- Remove the `/api/briefing` route and its import.

#### [DELETE] [briefing.js](file:///D:/Data/Project/NotamhighlighterBriefing/functions/api/briefing.js)
- Delete the backend API implementation.

---

## Verification Plan

### Automated Tests
- N/A (Manual verification of UI and code absence)

### Manual Verification
1. Open the app and verify the "FLIGHT SAFETY AI BRIEFING" card is no longer visible.
2. Run the engine and ensure no errors occur in the console related to missing `renderBriefing` or failed API calls.
3. Check that the "WEATHER BRIEFING" (PDF bookmark) functionality is unaffected.
