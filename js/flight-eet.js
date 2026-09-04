/**
 * flight-eet.js
 * ICAO ATS Flight Plan의 EET/ 필드(이륙 후 각 FIR 경계까지의 경과시간)를 파싱하여
 * ETD 기준 실제 FIR 통과 예정 시각(ETO)을 계산하고, flight-notam.js가 만든
 * 공항별 위험도 섹션과 FIR 코드 앞 2글자(국가/지역 코드) 기준으로 연결한다.
 *
 * 주의: FIR 코드(EET)와 공항 ICAO 코드는 별개 코드체계이므로 완전한 지리적 매칭은
 * 아니며, 국가/지역 접두어(예: LD=Croatia/Balkan, ZL=Lanzhou FIR 지역)로 근사 매칭한다.
 * 정확한 매칭이 필요하면 FIR 경계 좌표 데이터가 별도로 필요하다.
 */

/**
 * ATS FPL의 출발 라인 "-LEMD1800" 에서 출발공항/ETD(HHMM)를 추출.
 */
function parseEtd(text) {
  const m = text.match(/^-([A-Z]{4})(\d{4})\s*$/m);
  if (!m) return null;
  return { airport: m[1], timeRaw: m[2] };
}

/**
 * "EET/LECB0026 LFFF0053 ... RKRR1112" 형태의 필드를 파싱.
 * 줄바꿈으로 wrap된 경우도 처리하기 위해 EET/ 등장 지점부터 토큰 단위로 스캔하다가
 * FIRCODE+4자리 패턴이 아닌 토큰(SEL/, CODE/ 등 다음 필드)을 만나면 중단한다.
 */
function parseEet(text) {
  const idx = text.indexOf('EET/');
  if (idx === -1) return [];

  const after = text.slice(idx + 4);
  const tokens = after.split(/\s+/);
  const entries = [];
  const tokenRe = /^([A-Z]{3,5})(\d{4})$/;

  for (const tok of tokens) {
    const m = tok.match(tokenRe);
    if (!m) break; // SEL/, CODE/, RIF/ 등 다음 필드 시작 -> 중단
    entries.push({ fir: m[1], elapsedRaw: m[2] });
  }
  return entries;
}

function hhmmToMinutes(hhmm) {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = parseInt(hhmm.slice(2, 4), 10);
  return h * 60 + m;
}

function minutesToHHMM(totalMin) {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const m = (wrapped % 60).toString().padStart(2, '0');
  return `${h}${m}`;
}

/**
 * ETD + EET 경과시간을 합산해 각 FIR 통과 예정 시각(ETO, Z)을 계산.
 */
function computeEto(etd, eetEntries) {
  if (!etd) return [];
  const etdMin = hhmmToMinutes(etd.timeRaw);
  return eetEntries.map(e => {
    const elapsedMin = hhmmToMinutes(e.elapsedRaw);
    const totalMin = etdMin + elapsedMin;
    const dayOffset = Math.floor(totalMin / 1440); // 익일로 넘어가는지 여부
    return {
      fir: e.fir,
      elapsed: `${e.elapsedRaw.slice(0, 2)}hr ${e.elapsedRaw.slice(2, 4)}m`,
      etoZ: `${minutesToHHMM(totalMin)}Z${dayOffset > 0 ? `+${dayOffset}` : ''}`
    };
  });
}

/**
 * FIR 코드 앞 2글자를 기준으로 flight-notam.js의 섹션(공항)과 근사 매칭.
 * notamSections: extractNotamInfo(...).sections
 */
function linkFirToNotamSections(etoList, notamSections) {
  return etoList.map(eto => {
    const prefix = eto.fir.slice(0, 2);
    const matchedSections = notamSections.filter(s => s.icao && s.icao.startsWith(prefix));
    return {
      ...eto,
      relatedAirports: matchedSections.map(s => ({
        icao: s.icao,
        iata: s.iata,
        tag: s.tag,
        severity: s.severity,
        riskCount: s.riskCount
      }))
    };
  });
}

/**
 * 진입점. ATS FPL 텍스트 + flight-notam.js의 sections를 받아
 * FIR별 ETO와 관련 공항 위험도를 함께 반환.
 */
function extractEetTimeline(atsFplText, notamSections) {
  const etd = parseEtd(atsFplText);
  const eetEntries = parseEet(atsFplText);
  const etoList = computeEto(etd, eetEntries);
  const timeline = notamSections ? linkFirToNotamSections(etoList, notamSections) : etoList;
  return { etd, timeline };
}

module.exports = { parseEtd, parseEet, computeEto, linkFirToNotamSections, extractEetTimeline, hhmmToMinutes, minutesToHHMM };
