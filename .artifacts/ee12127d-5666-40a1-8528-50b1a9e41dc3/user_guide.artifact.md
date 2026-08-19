# NOTAM HIGHLIGHTER 사용 가이드

본 애플리케이션은 비행 계획서(PDF) 내의 중요한 NOTAM 키워드와 경로 제한 사항을 자동으로 감지하고 하이라이트하며, 작업 효율을 높이기 위한 스마트 북마크 및 계산 기능을 제공합니다.

## 주요 기능 및 사용법

### 1. PDF 비행 패키지 업로드
*   **방법:** '1. PDF FLIGHT PACKAGE' 섹션의 업로드 영역을 클릭하거나 PDF 파일을 드래그 앤 드롭합니다.
*   **특징:** 암호화되거나 폰트 인코딩이 깨진 레거시 PDF 문서도 자동으로 감지하여 텍스트를 복구하는 엔진이 내장되어 있습니다.

### 2. 하이라이트 설정
*   **키워드 선택:** 'Select Words' 드롭다운을 통해 사전 정의된 항공 전문 용어(PRESETS)를 선택할 수 있습니다.
*   **색상 변경:** 하단 컬러 칩을 클릭하여 하이라이트 마커의 색상(Blue, Pink, Yellow, Green)을 변경할 수 있습니다.
*   **전체 선택:** 'Select All NOTAM Keywords' 스위치를 통해 모든 프리셋을 한 번에 활성화할 수 있습니다.

### 3. 커스텀 단어 추가
*   **방법:** '3. ADD CUSTOM WORD TAGS' 입력창에 추가하고 싶은 단어를 입력(공백 또는 콤마로 구분)하고 'Add' 버튼을 누릅니다.
*   **특징:** 프리셋에 없는 특정 공항 코드나 개인적인 관심 키워드를 추가하여 하이라이트할 수 있습니다.

### 4. 엔진 실행 및 저장
*   **실행:** '4. RUN SYSTEM ENGINE'의 **RUN ENGINE** 버튼을 클릭합니다.
*   **결과 확인:** 하이라이트 작업이 완료되면 '5. SAVE OPTIMIZED DOCUMENT' 섹션이 나타납니다.
*   **저장:** **DOWNLOAD PDF FILE** 버튼을 눌러 수정된 PDF를 저장합니다.

### 5. 스마트 기능 (자동 적용)
*   **자동 북마크:** CFP PLAN, ATS FPL, WEATHER BRIEFING, NOTAM 섹션을 자동으로 찾아 PDF 북마크를 생성합니다.
*   **Duty Time 계산:** CFP 내의 'TRIP' 시간을 분석하여 1/2, 2/3 Duty Time을 계산하고 배지로 표시합니다.
*   **REFILE 공항 감지:** NOTAM 2 섹션에서 REFILE 공항을 감지하여 서브 북마크를 생성합니다.

---
© 2026 EFB Systems | bongsjeon@koreanair.com
