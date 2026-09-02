# Implementation Plan - Project Refactoring & Optimization

Refactor the project to eliminate code duplication, remove unused functions, and optimize the AI briefing prompt while maintaining the current "paused" state of the AI feature.

## Proposed Changes

### 1. `js/pdf-engine.js` [REFACTOR]
- Consolidate text decoding logic.
- Remove redundant validation alert if already handled by UI.
- Clean up duplicate logic in character filtering.

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/NotamhighlighterBriefing/js/pdf-engine.js)
- Introduce a shared decoding helper.
- Refactor `cleanAndDecodeItem` and `decodeForTagScan`.

### 2. `js/app.js` [CLEANUP]
- Remove unused functions: `forceDownload`, `downloadSelf`.
- Clean up variable management.

#### [MODIFY] [app.js](file:///D:/Data/Project/NotamhighlighterBriefing/js/app.js)
- Delete `forceDownload` and `downloadSelf`.

### 3. `functions/api/briefing.js` [OPTIMIZE]
- Streamline the `BRIEFING_SYSTEM_PROMPT` to reduce token usage and improve focus.
- Merge "Core Analysis Engine" with "Executive Summary Engine" rules.

#### [MODIFY] [briefing.js](file:///D:/Data/Project/NotamhighlighterBriefing/functions/api/briefing.js)

### 4. `index.html` & `css/style.css` [UI REFACTOR]
- Move inline header styles to the external stylesheet.

#### [MODIFY] [index.html](file:///D:/Data/Project/NotamhighlighterBriefing/index.html)
#### [MODIFY] [style.css](file:///D:/Data/Project/NotamhighlighterBriefing/css/style.css)

## Verification Plan
### Automated Tests
- N/A (Manual UI verification required)

### Manual Verification
- Verify PDF highlighting still works correctly (specifically checking if keywords are found after decoding).
- Verify the UI looks the same after moving styles to CSS.
- Check that removing functions doesn't break any existing buttons (all buttons are currently mapped to `handleBtn`, `dlPDF`, etc.).
