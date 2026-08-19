# NOTAM HIGHLIGHTER (Offline Ready)

스마트한 NOTAM 하이라이터 및 경로 매칭 도구입니다. 비행 계획서(PDF) 내의 중요 운항·기상 정보를 감지하여 하이라이트, 북마크 및 시간·연료 관련 배지를 삽입합니다. 모든 처리는 브라우저에서 로컬로 수행됩니다.

## 주요 기능 및 사용법

### 1. PDF 비행 패키지 업로드
*   **방법:** '1. PDF FLIGHT PACKAGE' 섹션의 업로드 영역을 클릭하거나 PDF 파일을 드래그 앤 드롭합니다.
*   **특징:** 암호화되거나 폰트 인코딩이 깨진 레거시 PDF 문서도 자동으로 감지하여 텍스트를 복구하는 엔진이 내장되어 있습니다.

### 2. 하이라이트 설정
*   **키워드 선택:** 'Select Words' 드롭다운을 통해 사전 정의된 항공 전문 용어(PRESETS)를 선택할 수 있습니다.
*   **색상 변경:** 하단 컬러 칩을 클릭하여 하이라이트 마커의 색상(Blue, Pink, Yellow, Green)을 변경할 수 있습니다.
*   **전체 선택:** 'Select All NOTAM Keywords' 스위치를 통해 모든 프리셋을 한 번에 활성화할 수 있습니다.
*   **기본 동작:** 선택한 프리셋 및 사용자 키워드와 일치하는 단어 범위만 하이라이트합니다.

### 3. Critical word 포함 행 전체 하이라이트
NOTAM 페이지에서 아래 위험·제한 키워드가 한 행에 포함되면 해당 **행 전체**를 선택한 마커 색상으로 강조합니다. 일반 프리셋과 달리, 문맥을 한눈에 확인할 수 있도록 문장 전체를 표시하는 규칙입니다.

*   **운항 제한:** `CLSD`, `CLOSED`, `RESTRICT`, `NOT AVBL`, `ALERT 4`, `ALERT4`
*   **대류성 기상:** `TSRA`, `TSGR`, `TSGS`, `TSSN`
*   **동결 강수·시정 위험:** `FZRA`, `FZDZ`, `FZFG`, `GR`, `FC`, `SN`, `RA`, `BLSN`, `DS`, `SS`

### 4. 커스텀 단어 추가
*   **방법:** '3. ADD CUSTOM WORD TAGS' 입력창에 추가하고 싶은 단어를 입력(공백 또는 콤마로 구분)하고 'Add' 버튼을 누릅니다.
*   **특징:** 프리셋에 없는 특정 공항 코드나 개인적인 관심 키워드를 추가하여 하이라이트할 수 있습니다.

### 5. 엔진 실행 및 저장
*   **실행:** '4. RUN SYSTEM ENGINE'의 **RUN ENGINE** 버튼을 클릭합니다.
*   **결과 확인:** 하이라이트 작업이 완료되면 '5. SAVE OPTIMIZED DOCUMENT' 섹션이 나타납니다.
*   **저장:** **DOWNLOAD PDF FILE** 버튼을 눌러 수정된 PDF를 저장합니다.

### 6. 스마트 기능 (자동 적용)
*   **자동 북마크:** CFP PLAN, COPY OF ATS FPL, DISPATCH RELEASE INFORMATION, EQUAL TIME POINT DATA, WEATHER BRIEFING 및 NOTAM 1~3 섹션을 찾아 PDF 북마크를 생성합니다.
*   **Duty Time 계산:** CFP의 `TRIP` 시간을 분석하여 1/2 및 2/3 Duty Time 계산값을 배지로 표시합니다.
*   **REFILE 공항 감지:** NOTAM 2 섹션에서 REFILE 공항을 감지하여 서브 북마크를 생성합니다.

### 7. 자동 배지(주석) 삽입 정보
배지는 앞 텍스트의 수직 중앙에 맞추어 표시되며, 옅은 회색 배경과 고대비 텍스트를 사용합니다.

*   **CFP PLAN:** `TRIP` 기반 Duty Time 계산 결과
*   **DISPATCH RELEASE INFORMATION:** `DISPATCH NOTES` 옆의 DISC FUEL 정보
*   **NOTAM 공항 태그:** `[DEP]`, `[DEST]` 옆의 ETD/ETA 및 `[ERA]`, `[EDTO]`, `[REFILE]` 옆의 Suitable From/To UTC
*   **Turbulence / weather 구간:** `EXPECTED FROM [WPT1] TO [WPT2]`를 감지하면 CFP PLAN에서 각 WPT 시간을 조회하여 `04.56 ~ 05.57` 형식으로 표시합니다. 예: `FL430 EXPECTED FROM 34E60 TO 35E50` → `04.56 ~ 05.57`

### 8. 홈 화면 설치
스마트폰 브라우저에서 홈 화면에 추가하면 `notamhighlighter.png`가 앱 아이콘으로 사용됩니다. 웹 앱 manifest와 Apple touch icon이 설정되어 있습니다.

---
© 2026 EFB Systems | bongsjeon@koreanair.com
