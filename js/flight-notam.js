/**
 * flight-notam.js
 * NOTAM 패키지 텍스트를 [DEP]/[DEST]/[ERA]/[REFILE] 공항 섹션 단위로 그룹화하고,
 * 기존 pdf-engine.js의 SENTENCE_KW(하이라이트용 위험 키워드)를 재사용해
 * 섹션별 위험도를 산출한다.
 *
 * 입력: NOTAM 패키지 페이지들의 텍스트를 이어붙인 문자열 (줄바꿈 포함)
 * 출력: { sections: [...], weatherThreats: [...] }
 */

// pdf-engine.js SENTENCE_KW와 동일 (하이라이트 로직과 위험도 판단 기준을 일치시키기 위해 값 그대로 복사)
const SENTENCE_KW = [
  'CLSD', 'CLOSED', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS',
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'U/S', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF'
];

// HIGH severity로 취급할 강한 제한/악기상 키워드 (SENTENCE_KW의 부분집합)
const HARD_KW = new Set([
  'CLSD', 'CLOSED', 'PROHIBIT', 'NOT AVBL', 'SHALL NOT', 'MAY NOT', 'U/S',
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG'
]);

// [DEP]LEMD/ MAD/ Madrid Adolfo Suarez-Barajas Airport, Madrid, ES
const SECTION_HEADER_RE = /^\[(DEP|DEST|ERA|REFILE)\]([A-Z]{4})\/\s*([A-Z]{3})?\/?\s*(.*)$/;

function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\f/, '').trim(); // 페이지 브레이크 문자 제거
    const m = line.match(SECTION_HEADER_RE);
    if (m) {
      if (current) sections.push(current);
      current = {
        tag: m[1],
        icao: m[2],
        iata: m[3] || null,
        name: (m[4] || '').replace(/,$/, '').trim(),
        bodyLines: []
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

function scanRisksInSection(section) {
  const risks = [];
  // 키워드 길이 내림차순 (긴 키워드 우선 매칭 - 예: 'SHALL NOT'을 'SHALL'보다 먼저)
  const sortedKw = [...SENTENCE_KW].sort((a, b) => b.length - a.length);

  for (const line of section.bodyLines) {
    if (!line) continue;
    for (const kw of sortedKw) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(line)) {
        risks.push({ keyword: kw, line: line.trim() });
        break; // 한 줄에 여러 키워드가 있어도 첫 매칭만 기록 (중복 방지)
      }
    }
  }
  return risks;
}

function classifySeverity(risks) {
  if (risks.length === 0) return 'NONE';
  const hasHard = risks.some(r => HARD_KW.has(r.keyword));
  if (hasHard) return 'HIGH';
  return 'MEDIUM';
}

/**
 * "LGT-MOD TURBULENCE EXPECTED FROM IGLOT TO IGBIS" 같은
 * 기상 위험구간(WPT1~WPT2) 라인을 섹션 전역에서 추출.
 */
function extractWeatherThreats(text) {
  const threats = [];
  const lines = text.split(/\r?\n/);
  const re = /^(.*?)\bEXPECTED\s+FROM\s+([A-Z0-9]{3,6})\s+TO\s+([A-Z0-9]{3,6})\b/i;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(re);
    if (m) {
      threats.push({
        description: m[1].trim(),
        from: m[2].toUpperCase(),
        to: m[3].toUpperCase(),
        sourceLine: line
      });
    }
  }
  return threats;
}

function extractNotamInfo(fullNotamText) {
  const rawSections = splitIntoSections(fullNotamText);
  const sections = rawSections.map(s => {
    const risks = scanRisksInSection(s);
    return {
      tag: s.tag,
      icao: s.icao,
      iata: s.iata,
      name: s.name,
      riskCount: risks.length,
      severity: classifySeverity(risks),
      risks
    };
  });
  const weatherThreats = extractWeatherThreats(fullNotamText);
  return { sections, weatherThreats };
}

// Node(테스트)와 브라우저(<script> 태그) 양쪽에서 동작하도록 분기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFlightInfo, parseFuelTimeRows, parseEtdEta, formatFuel, formatTime };
} else {
  window.extractFlightInfo = extractFlightInfo;
}
