# TAF Airport Time Badge Enhancement

Improve the logic for adding time badges to TAF information in the "WEATHER BRIEFING" section. The current implementation only supports the main departure and arrival airports. This enhancement will extend support to any airport found in the flight plan's waypoint time map (e.g., alternates and en-route airports).

## User Review Required

> [!IMPORTANT]
> The time displayed for en-route or alternate airports will be based on the `wptTimeMap` extracted from the `CFP PLAN`. If an airport is not listed as a waypoint in the flight plan, no badge will be added.

## Proposed Changes

### [PDF Engine]

Summary of changes in `js/pdf-engine.js`:
- Unified and enhanced the TAF badge logic in the `WEATHER BRIEFING` section.
- Added support for `TAF COR` and `TAF AMD` prefixes.
- Extended airport lookup to include `wptTimeMap` for alternate and en-route airports.
- Removed duplicated code block for weather badges.

#### [MODIFY] [pdf-engine.js](file:///D:/Data/Project/NotamhighlighterBriefing/js/pdf-engine.js)

- Remove the redundant TAF badge block (lines 1669–1707).
- Update the remaining TAF badge block (lines 1803–1841) with improved regex and lookup logic.

## Verification Plan

### Automated Tests
- N/A (Manual verification on device/PDF required)

### Manual Verification
1. Upload a PDF flight package containing a "WEATHER BRIEFING" section with TAFs for various airports.
2. Ensure the "CFP PLAN" contains waypoints for those airports.
3. Run the engine and verify that badges like `UAAA 0540Z` appear next to the corresponding `TAF UAAA` lines.
4. Verify that `TAF COR` and `TAF AMD` entries also receive badges if the airport is in the flight plan.
