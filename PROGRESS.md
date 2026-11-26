# PROGRESS — TextHighlighter

> 새 세션에서 "PROGRESS.md 읽고 이어서 해줘" 라고 하면 이 파일부터 읽고 작업을 이어갑니다.
> **세션을 마칠 때마다 아래 '현재 상태 / 다음 할 일 / 최근 세션 로그'를 갱신하세요.**

_최초 생성: 2026-11-26 (자동 수집 정보 기반)_

## 프로젝트 개요
- **설명:** NOTAM HIGHLIGHTER (Offline Ready)  _(출처: README.md)_
- **유형:** iOS, Node/JS, Web(HTML)
- **경로:** `/Volumes/Data/Project/TextHighlighter`
- **먼저 읽을 문서:** `AGENTS.md`, `README.md`

## 현재 상태
- REFILE 연료 차이 배지: RQRD가 앞 페이지로 분리돼도 생성되도록 수정(js/pdf-engine.js), 실제 PDF로 화면 확인은 안 함
- iOS는 웹 pdf-engine.js를 그대로 쓰므로 별도 수정 없음

## 다음 할 일
- [ ] 페이지가 나뉜 REFILE PDF에서 배지(+9,000 lbs) 확인 — js/pdf-engine.js

## 주의사항 / 결정된 사항
- pdf-engine.js 수정 시 index.html·sw.js의 ?v= 와 CACHE_NAME을 올려야 클라이언트에 반영됨

## 최근 세션 로그
<!-- 최신이 위로. 형식: YYYY-MM-DD — 한 일 / 남은 일 -->
- 2026-11-26 — REFILE 배지 페이지 분리 대응 / 실기 확인 남음
- 2026-11-26 — PROGRESS.md 생성
