# NOTAM HIGHLIGHTER (Offline Ready)

스마트한 NOTAM 하이라이터 및 경로 매칭 도구입니다. 비행 계획서(PDF) 내의 중요 운항·기상 정보를 감지하여 하이라이트, 북마크 및 시간·연료 관련 배지를 삽입합니다. 모든 처리는 브라우저에서 로컬로 수행됩니다.

NOTAM HIGHLIGHTER detects important operational and weather information in flight-package PDFs, then adds highlights, bookmarks, and time or fuel badges. All processing runs locally in the browser.

## 주요 기능 및 사용법 / Key Features and Usage

### 1. PDF 비행 패키지 업로드 / Upload a PDF Flight Package
*   **방법:** '1. PDF FLIGHT PACKAGE' 섹션의 업로드 영역을 클릭하거나 PDF 파일을 드래그 앤 드롭합니다.
    
    **How:** Click the upload area in **1. PDF FLIGHT PACKAGE**, or drag and drop a PDF file.
*   **특징:** 암호화되거나 폰트 인코딩이 깨진 레거시 PDF 문서도 자동으로 감지하여 텍스트를 복구하는 엔진이 내장되어 있습니다.
    
    **Feature:** The built-in engine detects legacy PDFs with encryption or damaged font encoding and restores searchable text.

### 2. 하이라이트 설정 / Highlight Settings
*   **키워드 선택:** 'Select Words' 드롭다운을 통해 사전 정의된 항공 전문 용어(PRESETS)를 선택할 수 있습니다.
    
    **Keyword selection:** Choose predefined aviation terms (PRESETS) from **Select Words**.
*   **색상 변경:** 하단 컬러 칩을 클릭하여 하이라이트 마커의 색상(Blue, Pink, Yellow, Green)을 변경할 수 있습니다.
    
    **Color selection:** Choose Blue, Pink, Yellow, or Green from the color chips.
*   **전체 선택:** 'Select All NOTAM Keywords' 스위치를 통해 모든 프리셋을 한 번에 활성화할 수 있습니다.
    
    **Select all:** Enable every preset at once with **Select All NOTAM Keywords**.
*   **기본 동작:** 선택한 프리셋 및 사용자 키워드와 일치하는 단어 범위만 하이라이트합니다.
    
    **Default behavior:** Only the matching word range is highlighted for selected presets and custom words.

### 3. Critical word 포함 행 전체 하이라이트 / Full-Line Critical-Word Highlighting
NOTAM 페이지에서 아래 위험·제한 키워드가 한 행에 포함되면 해당 **행 전체**를 선택한 마커 색상으로 강조합니다. 일반 프리셋과 달리, 문맥을 한눈에 확인할 수 있도록 문장 전체를 표시하는 규칙입니다.

On NOTAM pages, if a line contains one of the risk or restriction keywords below, the **entire line** is highlighted in the selected marker color. Unlike ordinary presets, this preserves the full operational context.

*   **운항 제한:** `CLSD`, `CLOSED`, `RESTRICT`, `NOT AVBL`, `ALERT 4`, `ALERT4`
*   **대류성 기상:** `TSRA`, `TSGR`, `TSGS`, `TSSN`
*   **동결 강수·시정 위험:** `FZRA`, `FZDZ`, `FZFG`, `GR`, `FC`, `SN`, `RA`, `BLSN`, `DS`, `SS`

### 4. 커스텀 단어 추가 / Add Custom Words
*   **방법:** '3. ADD CUSTOM WORD TAGS' 입력창에 추가하고 싶은 단어를 입력(공백 또는 콤마로 구분)하고 'Add' 버튼을 누릅니다.
    
    **How:** Enter words separated by spaces or commas in **3. ADD CUSTOM WORD TAGS**, then click **Add**.
*   **특징:** 프리셋에 없는 특정 공항 코드나 개인적인 관심 키워드를 추가하여 하이라이트할 수 있습니다.
    
    **Feature:** Add airport codes or personal keywords that are not included in the presets.

### 5. 엔진 실행 및 저장 / Run and Save
*   **실행:** '4. RUN SYSTEM ENGINE'의 **RUN ENGINE** 버튼을 클릭합니다.
    
    **Run:** Click **RUN ENGINE** in **4. RUN SYSTEM ENGINE**.
*   **결과 확인:** 하이라이트 작업이 완료되면 '5. SAVE OPTIMIZED DOCUMENT' 섹션이 나타납니다.
    
    **Result:** When processing finishes, **5. SAVE OPTIMIZED DOCUMENT** appears.
*   **저장:** **DOWNLOAD PDF FILE** 버튼을 눌러 수정된 PDF를 저장합니다.
    
    **Save:** Click **DOWNLOAD PDF FILE** to save the processed PDF.

### 6. 스마트 기능 (자동 적용) / Automatic Smart Features
*   **자동 북마크:** CFP PLAN, COPY OF ATS FPL, DISPATCH RELEASE INFORMATION, EQUAL TIME POINT DATA, WEATHER BRIEFING 및 NOTAM 1~3 섹션을 찾아 PDF 북마크를 생성합니다.
    
    **Automatic bookmarks:** Creates PDF bookmarks for CFP PLAN, COPY OF ATS FPL, DISPATCH RELEASE INFORMATION, EQUAL TIME POINT DATA, WEATHER BRIEFING, and NOTAM 1–3.
*   **Duty Time 계산:** CFP의 `TRIP` 시간을 분석하여 1/2 및 2/3 Duty Time 계산값을 배지로 표시합니다.
    
    **Duty Time calculation:** Reads the CFP `TRIP` time and displays the 1/2 and 2/3 duty-time calculations as badges.
*   **REFILE 공항 감지:** NOTAM 2 섹션에서 REFILE 공항을 감지하여 서브 북마크를 생성합니다.
    
    **REFILE airport detection:** Detects REFILE airports in NOTAM 2 and creates sub-bookmarks.

### 7. 자동 배지(주석) 삽입 정보 / Automatic Badge Annotations
배지는 앞 텍스트의 수직 중앙에 맞추어 표시되며, 옅은 회색 배경과 고대비 텍스트를 사용합니다.

Badges are vertically centered against the preceding text and use a pale-gray background with high-contrast text.

*   **CFP PLAN:** `TRIP` 기반 Duty Time 계산 결과
*   **DISPATCH RELEASE INFORMATION:** `DISPATCH NOTES` 옆의 DISC FUEL 정보
*   **NOTAM 공항 태그:** `[DEP]`, `[DEST]` 옆의 ETD/ETA 및 `[ERA]`, `[EDTO]`, `[REFILE]` 옆의 Suitable From/To UTC
*   **Turbulence / weather 구간:** `EXPECTED FROM [WPT1] TO [WPT2]`를 감지하면 CFP PLAN에서 각 WPT 시간을 조회하여 `04.56 ~ 05.57` 형식으로 표시합니다. 예: `FL430 EXPECTED FROM 34E60 TO 35E50` → `04.56 ~ 05.57`

For turbulence or weather segments, the app detects `EXPECTED FROM [WPT1] TO [WPT2]`, looks up both WPT times in CFP PLAN, and displays them as a range such as `04.56 ~ 05.57`.

### 8. 홈 화면 설치 / Add to Home Screen
스마트폰 브라우저에서 홈 화면에 추가하면 `notamhighlighter.png`가 앱 아이콘으로 사용됩니다. 웹 앱 manifest와 Apple touch icon이 설정되어 있습니다.

When added to a mobile device home screen, the app uses `notamhighlighter.png` as its icon through the web-app manifest and Apple touch-icon configuration.

---
© 2026 EFB Systems | bongsjeon@koreanair.com
