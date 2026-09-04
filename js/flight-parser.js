/**
 * flight-parser.js
 * CFP(비행계획) 헤더 블록 텍스트에서 연료/시간 정보를 구조화 추출.
 * 입력: pdf-engine.js가 만드는 cfpFullSectionText 형태의 줄바꿈 포함 텍스트
 * 출력: { items: {KEY: {fuelLbs, time, timeLabel}}, etd, eta }
 */

// KEYWORD  FUEL(3~5자리)  TIME(HH.MM) 형태의 라인 매칭
// 주의: "5 PCT CONT" / "FINAL RES" 처럼 키워드에 공백이 들어가는 경우가 있어
// 키워드 자체는 화이트리스트로 고정한다.
// 화이트리스트 근거: KAL FOM 제5장 S5.3.2.1 (22)~(35)항 공식 필드 정의
const ROW_KEYWORDS = [
  'TRIP', 'RESERVE', 'FINAL RES', '5 PCT CONT', '3 PCT CONT', 'CONT',
  'REFILE RES', 'ETP RES', 'RQD TAKEOFF', 'DISC', 'TANKERING',
  'PLN TAKEOFF', 'TAXI', 'RAMP OUT', 'FOD'
];

// ALTN/RKTU 0063 00.24 0108 0105 형태 - 교체공항 FUEL/TIME/DIST/NAM (FOM (24)항)
const ALTN_RE = /^ALTN\/([A-Z]{3,4})\s+(\d{3,5})\s+(\d{2}\.\d{2})/i;

function formatFuel(lbsStr) {
  const n = parseInt(lbsStr, 10);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString('en-US');
}

function formatTime(hhmm) {
  const m = hhmm.match(/^(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return `${h}hr ${String(min).padStart(2, '0')}m`;
}

/**
 * CFP 헤더 텍스트에서 KEYWORD FUEL TIME 라인들을 추출한다.
 */
function parseFuelTimeRows(text) {
  const items = {};
  const lines = text.split(/\r?\n/);

  // 키워드를 길이순 내림차순으로 정렬 (CONT보다 5 PCT CONT를 먼저 매칭)
  const sortedKeywords = [...ROW_KEYWORDS].sort((a, b) => b.length - a.length);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // "TRIP TIME DIST" 반복 헤더는 대체경로 재계산 블록의 시작을 의미하므로
    // 그 이후는 1차 CFP 블록 파싱 대상에서 제외한다 (CONT 등 키워드 충돌 방지)
    if (/^TRIP\s+TIME\s+DIST\b/i.test(line)) break;

    const altnMatch = line.match(ALTN_RE);
    if (altnMatch) {
      if (!items.ALTN) {
        items.ALTN = {
          airport: altnMatch[1].toUpperCase(),
          fuelLbs: formatFuel(altnMatch[2]),
          fuelLbsRaw: parseInt(altnMatch[2], 10),
          time: formatTime(altnMatch[3]),
          timeRaw: altnMatch[3]
        };
      }
      continue;
    }

    for (const kw of sortedKeywords) {
      // 키워드가 라인 맨 앞(선행 공백 제거 후)에서 시작하는 경우만 인정
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^${escaped}\\s+(\\d{3,5})\\s+(\\d{2}\\.\\d{2})\\b`, 'i');
      const m = line.match(re);
      if (m) {
        const key = kw.replace(/\s+/g, '_').toUpperCase();
        // 같은 키워드가 여러 번 나오면(ALTN/ZBTJ 등 alternate 목록) 첫 번째만 유지
        if (!items[key]) {
          items[key] = {
            fuelLbs: formatFuel(m[1]),
            fuelLbsRaw: parseInt(m[1], 10),
            time: formatTime(m[2]),
            timeRaw: m[2]
          };
        }
        break;
      }
    }
  }
  return items;
}

/**
 * "ETD LEMD 1800Z ETA RKSI 0542Z" 형태의 라인에서 출발/도착 시각 추출.
 */
function parseEtdEta(text) {
  const result = { etd: null, eta: null };
  const etdMatch = text.match(/\bETD\s+([A-Z]{3,4})\s+(\d{4})Z/i);
  if (etdMatch) result.etd = { airport: etdMatch[1].toUpperCase(), time: `${etdMatch[2]}Z` };

  const etaMatch = text.match(/\bETA\s+([A-Z]{3,4})\s+(\d{4})Z/i);
  if (etaMatch) result.eta = { airport: etaMatch[1].toUpperCase(), time: `${etaMatch[2]}Z` };

  return result;
}

/**
 * 엔진 진입점. CFP 전체 텍스트를 받아 구조화된 비행정보 객체 반환.
 */
function extractFlightInfo(cfpFullSectionText) {
  const items = parseFuelTimeRows(cfpFullSectionText);
  const { etd, eta } = parseEtdEta(cfpFullSectionText);
  return { items, etd, eta };
}

module.exports = { extractFlightInfo, parseFuelTimeRows, parseEtdEta, formatFuel, formatTime };
