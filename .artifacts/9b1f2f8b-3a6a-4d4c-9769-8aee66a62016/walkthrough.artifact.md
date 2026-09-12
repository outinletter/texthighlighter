# Walkthrough - TAF Airport Time Badge Enhancement

I have enhanced the TAF airport time badge logic in the `WEATHER BRIEFING` section to support en-route and alternate airports using the `wptTimeMap` extracted from the flight plan.

## Changes Made

### PDF Engine (`js/pdf-engine.js`)
- **Enhanced TAF Matching**: Updated the regex to support `TAF COR` and `TAF AMD` prefixes.
- **Extended Airport Support**: The logic now looks up the airport code in `wptTimeMap` if it doesn't match the main departure or arrival airport.
- **Code Cleanup**: Removed a redundant duplicate code block that was previously performing identical TAF badge operations.

## Verification Results

### Logic Verification
- **Departure/Arrival**: Continues to use `extractedEtd` and `extractedEta` for the highest precision.
- **En-route/Alternate**: Matches against `wptTimeMap`. Converts `HH.MM` format to `HHMMZ` for consistency (e.g., `05.40` becomes `0540Z`).
- **Regex**: `^TAF(?:\s+(?:COR|AMD))?\s+([A-Z]{4})\b` correctly identifies the ICAO code in group 1 for various TAF formats.

## Manual Verification Recommended
Please test with a PDF that contains:
1. `TAF COR [ICAO]` or `TAF AMD [ICAO]` lines.
2. TAFs for airports that are listed as waypoints in the CFP but are not the main DEP/DEST.
