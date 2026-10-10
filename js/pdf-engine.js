/**
 * PDF Engine Core Functions
 */

const TEST_KEYWORDS = ["NOTAM", "PACKAGE", "PLAN", "FLIGHT", "KOREAN", "RELEASE", "WEATHER", "AIR", "ROUTE", "ALTN", "INFO"];
const OFFSETS_TO_TEST = [0, 29, -29, 32, -32];
const SOURCE_TEXT_CENTER_RATIO = 0.36;

// 모든 배지(badge) 텍스트의 공통 스타일 설정 (단일 소스)
const BADGE_STYLE = {
  fontSize: 9,
  bgColor: [0.88, 0.90, 0.93],
  textColor: [0.15, 0.20, 0.25],
  bgOpacity: 0.75,
  padH: 4,
  padV: 2.5,
  rightMargin: 22
};

const badgeObstacles = new WeakMap();

function arrivalDayLabel(etd, eta, trip) {
  const minutes = value => {
    const m = /^(\d{2})[.:]?(\d{2})Z?$/.exec(value || '');
    return m && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  };
  const start = minutes(etd), end = minutes(eta), duration = minutes(trip);
  if (start === null || end === null || duration === null || start >= 1440 || end >= 1440) return '';
  if ((start + duration) % 1440 !== end) return '';
  const days = Math.floor((start + duration) / 1440);
  return days ? ` ARR +${days} DAY (UTC)` : '';
}

function flightDifferences(cfp, ats) {
  const differences = [];
  const compare = (label, a, b) => {
    if (a && b && a !== b) differences.push(`CHECK ${label}: CFP ${a} / ATS ${b}`);
  };
  compare('REG', cfp.match(/\bHL\d{4,5}\b/i)?.[0]?.toUpperCase(), ats.match(/REG\s*\/\s*(HL\d{4,5})\b/i)?.[1]?.toUpperCase());
  compare('DEP', cfp.match(/\bETD\s+([A-Z]{4})\b/i)?.[1], ats.match(/-\s*([A-Z]{4})\s*\d{4}\s*-\s*[NKM]\d/i)?.[1]);
  compare('DEST', cfp.match(/\bETA\s+([A-Z]{4})\b/i)?.[1], ats.match(/-\s*([A-Z]{4})\s*\d{4}(?:\s+[A-Z]{4})*\s*-\s*(?:PBN|DOF|REG|EET|SEL|STS|NAV|COM|DAT|SUR)\//i)?.[1]);
  const date = cfp.match(/\bON\s+(\d{2})\/([A-Z]{3})\/(\d{2})\b/i);
  const month = date ? ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(date[2].toUpperCase()) + 1 : 0;
  compare('DOF', month ? date[3] + String(month).padStart(2, '0') + date[1] : null, ats.match(/DOF\s*\/\s*(\d{6})\b/i)?.[1]);
  return differences;
}

function routeComparisonTokens(text) {
  return text.toUpperCase().replace(/\/[NKM]\d+[FASM]\d+/g, '')
    .split(/[^A-Z0-9]+/).filter(token => token && token !== 'DCT')
    .map(token => token.replace(/^([NS])(\d{2})([EW])(\d{3})$/, '$2$1$4$3'));
}

function findBadgePosition(box, obstacles, bottom = 12) {
  const gap = 2;
  let y = box.y;
  while (y >= bottom) {
    const collisions = obstacles.filter(other =>
      box.x < other.x + other.width + gap && box.x + box.width + gap > other.x &&
      y < other.y + other.height + gap && y + box.height + gap > other.y);
    if (!collisions.length) return { ...box, y };
    y = Math.min(y - 0.01, Math.min(...collisions.map(other => other.y)) - box.height - gap);
  }
  return null;
}

function getRightAlignedBadgeX(libPage, text, font, fontSize = BADGE_STYLE.fontSize) {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  return libPage.getWidth() - BADGE_STYLE.rightMargin - BADGE_STYLE.padH - textWidth;
}

/**
 * 'DUTY TIME' / Accent Style Badge Drawer
 */
function drawDutyTimeStyleBadge(libPage, options) {
  const {
    text,
    x,
    y,
    centerY,
    font,
    fontSize = BADGE_STYLE.fontSize,
    bgColor = BADGE_STYLE.bgColor,
    textColor = BADGE_STYLE.textColor,
    bgOpacity = BADGE_STYLE.bgOpacity,
    padH = BADGE_STYLE.padH,
    padV = BADGE_STYLE.padV
  } = options;

  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize, { descender: false });
  let textBaseY = centerY === undefined ? y : centerY - textHeight / 2;
  const obstacles = badgeObstacles.get(libPage) || [];
  const box = findBadgePosition({
    x: x - padH, y: textBaseY - padV,
    width: textWidth + padH * 2, height: textHeight + padV * 2
  }, obstacles);
  if (!box) {
    console.warn('No free space below for badge:', text);
    return false;
  }
  textBaseY = box.y + padV;
  obstacles.push(box);
  badgeObstacles.set(libPage, obstacles);

  libPage.drawRectangle({
    x: x - padH,
    y: textBaseY - padV,
    width: textWidth + padH * 2,
    height: textHeight + padV * 2,
    color: PDFLib.rgb(...bgColor),
    opacity: bgOpacity
  });

  libPage.drawText(text, {
    x: x,
    y: textBaseY,
    size: fontSize,
    font: font,
    color: PDFLib.rgb(...textColor),
    opacity: 1.0
  });
}

/**
 * Text Item Line Grouping
 */
function groupTextItemsByLine(items, offset) {
  const decorated = items
    .map(it => ({ item: it, text: decodeForTagScan(it.str, offset) }))
    .filter(d => d.text && d.text.length > 0);

  decorated.sort((a, b) => b.item.transform[5] - a.item.transform[5]);

  const lines = [];
  for (const d of decorated) {
    const y = d.item.transform[5];
    let joined = false;
    for (const line of lines) {
      if (Math.abs(line.y - y) < 4.0) {
        line.parts.push(d);
        joined = true;
        break;
      }
    }
    if (!joined) lines.push({ y, parts: [d] });
  }

  for (const line of lines) {
    line.parts.sort((a, b) => a.item.transform[4] - b.item.transform[4]);
    line.text = line.parts.map(p => p.text).join('');
    line.items = line.parts.map(p => p.item);
  }

  return lines;
}

function customKeywordPattern(word) {
  const chars = [...word.replace(/\s+/g, '')];
  return chars.length ? new RegExp(chars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'gi') : null;
}

function checkKeywordMatch(text, kw) {
  const normalizedText = text.replace(/[^A-Za-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re;
  try {
    const kwLower = kw.toLowerCase();
    if (kwLower === 'restrict' || kwLower === 'prohibit') {
      re = new RegExp(`\\b${escaped}[A-Za-z]*\\b`, 'i');
    } else {
      re = new RegExp(`\\b${escaped}\\b`, 'i');
    }
  } catch (e) {
    re = new RegExp(escaped, 'i');
  }
  return re.test(normalizedText);
}

const WEATHER_PHENOMENA = new Set([
  'DZ', 'RA', 'SN', 'SG', 'IC', 'PE', 'PL', 'GR', 'GS', 'UP', 'BR', 'FG',
  'FU', 'VA', 'DU', 'SA', 'HZ', 'PY', 'PO', 'SQ', 'FC', 'SS', 'DS'
]);
const WEATHER_DESCRIPTORS = ['MI', 'PR', 'BC', 'DR', 'BL', 'SH', 'TS', 'FZ'];

function isWeatherCodeToken(token) {
  let code = (token || '').toUpperCase().replace(/^[+-]/, '');
  if (code.startsWith('VC')) code = code.slice(2);
  const descriptor = WEATHER_DESCRIPTORS.find(prefix => code.startsWith(prefix));
  if (descriptor) {
    code = code.slice(descriptor.length);
    if (!code && descriptor === 'TS') return true;
  }
  if (!code) return false;
  while (code.length) {
    const phenomenon = [...WEATHER_PHENOMENA].find(value => code.startsWith(value));
    if (!phenomenon) return false;
    code = code.slice(phenomenon.length);
  }
  return true;
}

function detectPageOffset(rawText) {
  if (!rawText) return 0;
  let bestOffset = 0;
  let bestMatches = 0;

  const sampleLen = Math.min(rawText.length, 1500);
  for (const offset of OFFSETS_TO_TEST) {
    let decodedSample = "";
    for (let j = 0; j < sampleLen; j++) {
      decodedSample += String.fromCharCode(rawText.charCodeAt(j) + offset);
    }
    const cleanSample = decodedSample.replace(/[^A-Za-z0-9\s]/g, ' ').toUpperCase();
    let matchCount = 0;
    for (const kw of TEST_KEYWORDS) {
      if (cleanSample.includes(kw)) matchCount++;
    }
    if (matchCount >= 3) return offset;
    if (matchCount > bestMatches) {
      bestMatches = matchCount;
      bestOffset = offset;
    }
  }

  if (bestMatches > 0) return bestOffset;

  for (let i = -120; i <= 120; i++) {
    if (OFFSETS_TO_TEST.includes(i)) continue;
    let decodedSample = "";
    for (let j = 0; j < sampleLen; j++) {
      decodedSample += String.fromCharCode(rawText.charCodeAt(j) + i);
    }
    const cleanSample = decodedSample.replace(/[^A-Za-z0-9\s]/g, ' ').toUpperCase();
    let matchCount = 0;
    for (const kw of TEST_KEYWORDS) {
      if (cleanSample.includes(kw)) matchCount++;
    }
    if (matchCount > bestMatches) {
      bestMatches = matchCount;
      bestOffset = i;
    }
    if (bestMatches >= 3) break;
  }

  return bestOffset;
}

function decodeStr(str, offset) {
  if (!offset || !str) return str;
  let decoded = "";
  for (let i = 0; i < str.length; i++) {
    decoded += String.fromCharCode(str.charCodeAt(i) + offset);
  }
  return decoded;
}

function baseDecode(str, offset) {
  if (!str) return '';
  if (!offset) return str;
  const decrypted = decodeStr(str, offset);
  const origStandardCount = (str.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
  const decStandardCount = (decrypted.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
  return (decStandardCount > origStandardCount) ? decrypted : str;
}

function cleanAndDecodeItem(str, offset) {
  const finalStr = baseDecode(str, offset);
  return finalStr.replace(/[^\p{L}\p{N}\s\/\.\-\(\)]/gu, ' ');
}

function decodeForTagScan(str, offset) {
  const finalStr = baseDecode(str, offset);
  return finalStr.replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * 텍스트의 정확한 바운딩 박스를 계산하는 헬퍼 함수
 */
function getTextMetrics(item, sy, fontSize) {
  const baselineY = item.transform[5] * sy;
  const itemH = fontSize || Math.abs(item.transform[3]) || 10;
  const ascenderRatio = 0.85;
  const descenderRatio = 0.15;

  const textTopY = baselineY + (itemH * sy * ascenderRatio);
  const textBottomY = baselineY - (itemH * sy * descenderRatio);
  const textHeight = textTopY - textBottomY;

  return {
    baselineY,
    textTopY,
    textBottomY,
    textHeight,
    itemH
  };
}

/**
 * Highlight/Underline 모드 공용 드로잉 헬퍼
 * 기본 모드는 'underline'으로 설정
 * 폰트 크기에 따라 두께와 위치가 조정됨
 */
function drawMarkerRect(page, x, y, width, height, color, opacity, fontSize) {
  const mode = (typeof highlightMode !== 'undefined') ? highlightMode : 'underline';

  if (mode === 'underline') {
    // 폰트 크기에 비례한 밑줄 두께 (최소 1.0, 최대 2.5)
    const baseThickness = fontSize ? Math.max(fontSize * 0.14, 1.5) : 1.5;
    const thickness = Math.min(baseThickness, 2.5);

    // y는 이미 텍스트 하단 좌표 (textBottomY)가 전달됨
    const underlineY = y - thickness;
    
    page.drawRectangle({
      x: x,
      y: underlineY,
      width: width,
      height: thickness,
      color: color,
      opacity: Math.min(opacity + 0.75, 1.0)
    });
  } else {
    // 하이라이트 모드
    const padY = fontSize ? Math.max(fontSize * 0.08, 1) : 2;
    page.drawRectangle({ 
      x: x, 
      y: y - padY, 
      width: width, 
      height: height + padY * 2, 
      color: color, 
      opacity: opacity 
    });
  }
}

function drawCharRangeHighlight(page, item, minCharIdx, maxCharIdx, sx, sy, pageOffset, color, opacity, font) {
  const s = cleanAndDecodeItem(item.str, pageOffset) || '';
  const tx = item.transform;
  const fontSize = Math.abs(tx[3]) || 10;
  const itemWidth = item.width || 0;

  let startXOffset = 0;
  let actualHlWidth = 0;

  if (font && s.length > 0) {
    try {
      const fullMeasuredW = font.widthOfTextAtSize(s, fontSize);
      const prefixMeasuredW = font.widthOfTextAtSize(s.substring(0, minCharIdx), fontSize);
      const matchMeasuredW = font.widthOfTextAtSize(s.substring(minCharIdx, maxCharIdx + 1), fontSize);

      if (fullMeasuredW > 0) {
        startXOffset = (prefixMeasuredW / fullMeasuredW) * itemWidth;
        actualHlWidth = (matchMeasuredW / fullMeasuredW) * itemWidth;
      } else {
        startXOffset = (itemWidth / Math.max(s.length, 1)) * minCharIdx;
        actualHlWidth = (itemWidth / Math.max(s.length, 1)) * (maxCharIdx - minCharIdx + 1);
      }
    } catch (e) {
      startXOffset = (itemWidth / Math.max(s.length, 1)) * minCharIdx;
      actualHlWidth = (itemWidth / Math.max(s.length, 1)) * (maxCharIdx - minCharIdx + 1);
    }
  } else {
    startXOffset = (itemWidth / Math.max(s.length, 1)) * minCharIdx;
    actualHlWidth = (itemWidth / Math.max(s.length, 1)) * (maxCharIdx - minCharIdx + 1);
  }

  // 통일된 텍스트 메트릭스 계산
  const metrics = getTextMetrics(item, sy, fontSize);
  const rectX = (tx[4] + startXOffset) * sx;
  const rectWidth = Math.max(actualHlWidth * sx, 2);
  
  drawMarkerRect(
    page,
    rectX,
    metrics.textBottomY, // 하단 기준 전달
    rectWidth,
    metrics.textHeight,
    color,
    opacity,
    fontSize
  );
}

async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = [];
  iataAirports = [];
  try {
    for (let pNum = 1; pNum <= Math.min(30, pdfJsDoc.numPages); pNum++) {
      const page = await pdfJsDoc.getPage(pNum);
      const textContent = await page.getTextContent();
      const rawText = textContent.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const decodedRawText = textContent.items.map(it => decodeStr(it.str, offset)).join(' ');

      const isDispatchReleasePage = /DISPATCH\s+RELEASE\s+INFORMATION/i.test(decodedRawText) || /I\s+HEREBY\s+RELEASE/i.test(decodedRawText);
      if (iataAirports.length === 0 && isDispatchReleasePage) {
        const releaseIata = /I\s+HEREBY\s+RELEASE\s+(?:THE\s+)?FLIGHT[^,]*,\s*\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/i.exec(decodedRawText);
        if (releaseIata) {
          iataAirports.push(releaseIata[1].toUpperCase(), releaseIata[2].toUpperCase());
        }
      }
      if (iataAirports.length === 0) {
        const flightHeaderIata = /\b(?:KAL|KE)\s*\d+\s*\/\s*\d{2}[A-Z]{3}\s*,\s*([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/i.exec(decodedRawText);
        if (flightHeaderIata) {
          iataAirports.push(flightHeaderIata[1].toUpperCase(), flightHeaderIata[2].toUpperCase());
        }
      }
      if (airports.length === 0) {
        const m1 = /\bFLIGHT\s+RELEASE\s+[A-Z0-9]+\s+([A-Z]{4})[\/-]([A-Z]{4})\b/i.exec(decodedRawText);
        if (m1) {
          airports.push(m1[1].toUpperCase().trim(), m1[2].toUpperCase().trim());
        } else {
          const m2 = /\bETD\s+([A-Z]{4})\s+[A-Z0-9]+\s+ETA\s+([A-Z]{4})\b/i.exec(decodedRawText);
          if (m2) {
            airports.push(m2[1].toUpperCase().trim(), m2[2].toUpperCase().trim());
          } else if (isDispatchReleasePage) {
            const m3 = /I\s+HEREBY\s+RELEASE\s+(?:THE\s+)?FLIGHT.*?([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i.exec(decodedRawText);
            if (m3) airports.push(m3[1].toUpperCase().trim(), m3[2].toUpperCase().trim());
          }
        }
      }
      if (iataAirports.length === 0) {
         const mHeader = /\b(?:KAL|KE)\s*\d+\s*(?:\/\s*)?([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/i.exec(decodedRawText);
         if (mHeader) iataAirports.push(mHeader[1].toUpperCase().trim(), mHeader[2].toUpperCase().trim());
      }
      if (airports.length === 2 && iataAirports.length === 2) break;
    }
  } catch (err) {
    console.warn("Airport code extraction failed: ", err);
  }
  return airports;
}


async function extractFirstTagAirports(pdfJsDoc, startPageIdx, endPageIdxExclusive, tags) {
  const found = {};
  if (startPageIdx === undefined || startPageIdx === -1) return [];
  const from = Math.max(0, startPageIdx);
  const to = Math.min(pdfJsDoc.numPages, endPageIdxExclusive || pdfJsDoc.numPages);

  for (let pi = from; pi < to; pi++) {
    if (Object.keys(found).length === tags.length) break;
    const jsPage = await pdfJsDoc.getPage(pi + 1);
    const tc = await jsPage.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      if (Object.keys(found).length === tags.length) break;
      for (const tag of tags) {
        if (found[tag] !== undefined) continue;
        const re = new RegExp('\\[\\s*' + tag + '\\s*\\]\\s*([A-Z]{3,4})\\b', 'i');
        const m = re.exec(line.text);
        if (m) {
          const lineMaxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
          const lineFS = Math.abs(line.parts[0].item.transform[3]) || 10;
          found[tag] = { code: m[1].toUpperCase(), pageIdx: pi, y: line.y, maxX: lineMaxX, fontSize: lineFS };
        }
      }
    }
  }

  const ordered = [];
  for (const tag of tags) {
    if (found[tag]) ordered.push({ tag, code: found[tag].code, pageIdx: found[tag].pageIdx, y: found[tag].y, maxX: found[tag].maxX, fontSize: found[tag].fontSize });
  }
  return ordered;
}

async function extractAllTaggedAirports(pdfJsDoc, startPageIdx, endPageIdxExclusive, tagPattern) {
  const results = [];
  if (startPageIdx === undefined || startPageIdx === -1) return results;
  const from = Math.max(0, startPageIdx);
  const to = Math.min(pdfJsDoc.numPages, endPageIdxExclusive || pdfJsDoc.numPages);
  const re = new RegExp('\\[\\s*(' + tagPattern + ')\\s*\\]\\s*([A-Z]{3,4})\\b', 'gi');

  for (let pi = from; pi < to; pi++) {
    const jsPage = await pdfJsDoc.getPage(pi + 1);
    const tc = await jsPage.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line.text)) !== null) {
        const tagLabel = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
        const code = m[2].toUpperCase();
        const detailMatch = line.text.match(new RegExp('\\b' + code + '\\s*\\/\\s*[A-Z]{3}\\s*\\/\\s*([^,]+)(?:,\\s*([^,]+))?', 'i'));
        const airportName = detailMatch ? (detailMatch[2] || detailMatch[1]).trim() : '';
        const lineMaxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
        const lineFS = Math.abs(line.parts[0].item.transform[3]) || 10;
        results.push({ tag: tagLabel, code, airportName, pageIdx: pi, y: line.y, maxX: lineMaxX, fontSize: lineFS });
      }
    }
  }
  return results;
}

async function extractMetadata(pdfJsDoc) {
  try {
    const scanPages = Math.min(10, pdfJsDoc.numPages);
    let combinedText = '';
    for (let p = 1; p <= scanPages; p++) {
      const pg = await pdfJsDoc.getPage(p);
      const tc = await pg.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      combinedText += ' ' + tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');
    }
    const decodedText = combinedText;

    const flightMatch = decodedText.match(/\b(KAL|KE|KAL\s+|KE\s*)(\d{3,4})\b/i);
    if (flightMatch) extractedFlightNum = flightMatch[1].trim().toUpperCase() + flightMatch[2];

    const acRegMatch = decodedText.match(/\bHL[0-9]{4,5}\b/i);
    if (acRegMatch) {
      extractedAcReg = acRegMatch[0].toUpperCase();
    }

    const routeMatch = decodedText.match(/([A-Z]{2}-[A-Z]{2})\s+([A-Z0-9]{2,5})\s+[A-Z]\s+(?:BRK|WX|PROGS)/i);
    if (routeMatch) {
      extractedRoute = routeMatch[2].toUpperCase();
    }

    const monthsMap = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const dateMatchA = decodedText.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
    if (dateMatchA) {
      const monthStr = dateMatchA[2].toLowerCase().substring(0, 3);
      extractedFileDate = (monthsMap[monthStr] || '01') + dateMatchA[1].padStart(2, '0');
    } else {
      const dateMatchB = decodedText.match(/\b(\d{1,2})\/([A-Z]{3})\/(\d{2,4})\b/i);
      if (dateMatchB) {
        const monthStr = dateMatchB[2].toLowerCase();
        extractedFileDate = (monthsMap[monthStr] || '01') + dateMatchB[1].padStart(2, '0');
      } else {
        const dateMatchC = decodedText.match(/\b(\d{2})([A-Z]{3})\b/i);
        if (dateMatchC) {
          extractedFileDate = (monthsMap[dateMatchC[2].toLowerCase()] || '01') + dateMatchC[2].toLowerCase();
        }
      }
    }
  } catch (err) {
    console.warn("Metadata extraction failed: ", err);
  }
}

/** Map CFP waypoint names to elapsed times, including split and climb rows. */
function buildWptTimeMap(fullPdfText) {
  const wptTimeMap = new Map();
  if (!fullPdfText || typeof fullPdfText !== 'string') return wptTimeMap;

  const lines = fullPdfText.split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const waypointRowRegex =
    /\b([A-Z][A-Z0-9]{1,9})\b[\s\S]*?\/[\s\S]*?\b(\d{2}\.\d{2})\b\s+\d{3,6}\s*\/?/i;
  for (const line of lines) {
    const match = waypointRowRegex.exec(line);
    if (!match) continue;
    const waypoint = match[1].toUpperCase();
    const time = match[2];
    if (isValidElapsedTime(time) && !isCfpNoiseToken(waypoint) && !wptTimeMap.has(waypoint)) {
      wptTimeMap.set(waypoint, time);
    }
  }

  // PDF.js may split a waypoint row and its ETO onto adjacent visual lines.
  for (let i = 0; i < lines.length - 1; i++) {
    const waypointMatch = /^\s*([A-Z][A-Z0-9]{1,9})\b.*\/\s*$/i.exec(lines[i]);
    if (!waypointMatch) continue;
    const timeMatch = /\b(\d{2}\.\d{2})\b\s+\d{3,6}\s*\/?/i.exec(lines[i + 1]);
    if (!timeMatch) continue;
    const waypoint = waypointMatch[1].toUpperCase();
    const time = timeMatch[1];
    if (isValidElapsedTime(time) && !isCfpNoiseToken(waypoint) && !wptTimeMap.has(waypoint)) {
      wptTimeMap.set(waypoint, time);
    }
  }

  // Last fallback for rows whose text-item line breaks are unreliable.
  const normalizedText = fullPdfText.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const globalWaypointRegex =
    /\b([A-Z][A-Z0-9]{1,9})\b\s+[EW]\d{3}\s+\d{1,2}(?:\.\d+)?\s+\d{1,3}\s*\/[\s\S]{0,40}?\b(\d{2}\.\d{2})\b\s+\d{3,6}\s*\//gi;
  let globalMatch;
  while ((globalMatch = globalWaypointRegex.exec(normalizedText)) !== null) {
    const waypoint = globalMatch[1].toUpperCase();
    const time = globalMatch[2];
    if (isValidElapsedTime(time) && !isCfpNoiseToken(waypoint) && !wptTimeMap.has(waypoint)) {
      wptTimeMap.set(waypoint, time);
    }
  }
  console.log('[WPT TIME MAP]', Object.fromEntries(wptTimeMap.entries()));
  return wptTimeMap;
}

function isValidElapsedTime(value) {
  const match = /^(\d{2})\.(\d{2})$/.exec(value || '');
  return Boolean(match && Number(match[1]) <= 99 && Number(match[2]) < 60);
}

const CFP_NOISE_TOKENS = new Set([
  'DIST', 'LATITUDE', 'LONGITUDE', 'WIND', 'COMP', 'TIME', 'FUEL', 'ACTL', 'ACTM',
  'ACBO', 'PLAN', 'TRIP', 'RESERVE', 'FINAL', 'REFILE', 'TAKEOFF', 'TANKERING',
  'RAMP', 'ROUTE', 'ALTN', 'FLIGHT', 'ETO', 'ATO', 'MSA', 'TAS', 'FIR'
]);

function isCfpNoiseToken(token) {
  return CFP_NOISE_TOKENS.has((token || '').toUpperCase());
}

function estimateWptTimeFromEtp(fullPdfText, waypoint, assumedGroundSpeedKt = 400) {
  const wptMatch = /^W(\d{3})$/.exec((waypoint || '').toUpperCase());
  if (!wptMatch || !fullPdfText || assumedGroundSpeedKt <= 0) return null;
  const etpRe = /ETP\s+LOCATION\s+N(\d{1,2})\s*(\d{2}(?:\.\d+)?)\s+W(\d{1,3})\s*(\d{2}(?:\.\d+)?)\s+ETE\s+(\d{2})\.(\d{2})/gi;
  let match;
  while ((match = etpRe.exec(fullPdfText)) !== null) {
    const latitude = Number(match[1]) + Number(match[2]) / 60;
    const etpLongitude = Number(match[3]) + Number(match[4]) / 60;
    const waypointLongitude = Number(wptMatch[1]);
    const westwardDistanceNm = (waypointLongitude - etpLongitude) * 60 * Math.cos(latitude * Math.PI / 180);
    if (westwardDistanceNm < 0 || westwardDistanceNm > 300) continue;
    const etpMinutes = Number(match[5]) * 60 + Number(match[6]);
    const estimatedMinutes = Math.round(etpMinutes - westwardDistanceNm / assumedGroundSpeedKt * 60);
    if (estimatedMinutes < 0) continue;
    return `${String(Math.floor(estimatedMinutes / 60)).padStart(2, '0')}.${String(estimatedMinutes % 60).padStart(2, '0')}`;
  }
  return null;
}

function canRunEngine() {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    alert('PDF 파일을 먼저 선택하거나 업로드하세요.');
    return false;
  }
  return true;
}

/**
 * 라인 단위 강조 표시를 위한 헬퍼 함수
 */
function drawLineHighlight(libPage, lineItems, lineY, sx, sy, color, opacity) {
  const minX = Math.min(...lineItems.map(it => it.transform[4]));
  const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
  const itemH = Math.abs(lineItems[0].transform[3]) || 10;
  
  // 통일된 텍스트 메트릭스 계산
  const metrics = getTextMetrics({ transform: [0, 0, 0, itemH, 0, lineY] }, sy, itemH);
  
  drawMarkerRect(
    libPage,
    minX * sx,
    metrics.textBottomY,
    (maxX - minX) * sx,
    metrics.textHeight,
    color,
    opacity,
    itemH
  );
}

async function runHL(){
  if(!canRunEngine())return;
  if(!libsReady){setStatus('error','Required libraries not fully loaded.');return;}

  // sel이 undefined인 경우 처리
  if (typeof sel === 'undefined') {
    console.error('sel is not defined');
    setStatus('error','Required variables not initialized.');
    return;
  }

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'CLOSURE', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF', 'DO NOT', 'ONLY AVBL', 'CONFUSING', 'CONFUSE', 'SHOULD'];
  const runBtn=document.getElementById('runBtn');
  runBtn.className='action-btn run-btn';
  runBtn.innerHTML='Processing locally...';
  setStatus('processing','Restoring text encoding & analyzing highlights...');

  done=false;outBytes=null;detectedAirports=[]; iataAirports=[];
  document.getElementById('previewCard').style.display = 'none';

  await new Promise(r=>setTimeout(r,50));

  try {
    let pdfJsDoc;
    try {
      pdfJsDoc = await pdfjsLib.getDocument({data:pdfBytes.buffer.slice(0)}).promise;
    } catch(err) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      pdfJsDoc = await pdfjsLib.getDocument({data:pdfBytes.buffer.slice(0)}).promise;
    }

    detectedAirports = await extractReleaseAirportsByRule2(pdfJsDoc);
    await extractMetadata(pdfJsDoc);

    const extraKws = [];
    if (sel.size > 0 && extractedAcReg) extraKws.push(extractedAcReg);
    const routeKw = typeof extractedRoute === 'string' ? extractedRoute.trim().toUpperCase() : '';
    const keywords = [...sel, ...extraKws, ...(routeKw ? [routeKw] : [])].sort((a,b)=>b.length-a.length);
    const hlRGB = window.activeHlColorRGB || [1.0, 0.45, 0.65];

    const numPages=pdfJsDoc.numPages;
    const pdfLibDoc=await PDFLib.PDFDocument.load(pdfBytes,{ignoreEncryption:true});
    const libPages=pdfLibDoc.getPages();
    // Reserve original text before any badge is drawn, including keyword-free pages.
    for (let pi = 0; pi < libPages.length; pi++) {
      const page = await pdfJsDoc.getPage(pi + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const sx = libPages[pi].getWidth() / viewport.width;
      const sy = libPages[pi].getHeight() / viewport.height;
      badgeObstacles.set(libPages[pi], content.items.filter(item => item.str && item.str.trim()).map(item => {
        const height = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;
        return {
          x: item.transform[4] * sx,
          y: (item.transform[5] - height * 0.2) * sy,
          width: item.width * sx,
          height: height * 1.2 * sy
        };
      }));
    }
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Courier);
    const boldFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    const BOOKMARK_PATTERNS=[
      {label:'CFP PLAN',pattern:/CFP\s+PLAN/i},
      {label:'COPY OF ATS', pattern:/COPY\s+OF\s+ATS\s+FPL/i},
      {label:'DISPATCH RELEASE INFORMATION',pattern:/DISPATCH\s+RELEASE\s+INFORMATION|DISPATCH\s+RELEASE\s+INFO/i},
      {label:'EQUAL TIME POINT DATA',pattern:/EQUAL\s+TIME\s+POINT\s+DATA/i},
      {label:'WEATHER BRIEFING',pattern:/WEATHER\s+BRIEFING/i},
      {label:'NOTAM 1',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*1)\b|(\[\s*NOTAM\s*1\s*\])/i},
      {label:'NOTAM 2',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*2)\b|(\[\s*NOTAM\s*2\s*\])/i},
      {label:'NOTAM 3',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*3)\b|(\[\s*NOTAM\s*3\s*\])/i},
    ];

    const bmPages={};
    let edtoBookmarkY = null;
    let coaAnnotIdx = -1;

    for(let pi=0;pi<numPages;pi++){
      const jsPage2=await pdfJsDoc.getPage(pi+1);
      const tc=await jsPage2.getTextContent();
      const rawText=tc.items.map(it=>it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const pageText=tc.items.map(it=>cleanAndDecodeItem(it.str, offset)).join(' ');

      for(const bm of BOOKMARK_PATTERNS){
        if(bmPages[bm.label]!==undefined) {
            if (bm.label === 'COPY OF ATS' && coaAnnotIdx === -1) {
                if (/SUBMITTED\s+AT\b/i.test(pageText)) coaAnnotIdx = pi;
            }
            continue;
        }
        if(bm.pattern.test(pageText)){
          bmPages[bm.label]=pi;
          if (bm.label === 'EQUAL TIME POINT DATA') {
            const matchItem = tc.items.find(it => /EQUAL/i.test(cleanAndDecodeItem(it.str, offset)));
            if (matchItem) edtoBookmarkY = matchItem.transform[5];
          }
          if (bm.label === 'COPY OF ATS') {
            if (/SUBMITTED\s+AT\b/i.test(pageText)) coaAnnotIdx = pi;
          }
        }
      }
    }

    const pkg3StartIdx = bmPages['NOTAM 3'] !== undefined ? bmPages['NOTAM 3'] : -1;
    const dispatchReleaseIdx = bmPages['DISPATCH RELEASE INFORMATION'] !== undefined ? bmPages['DISPATCH RELEASE INFORMATION'] : -1;
    const weatherBriefingIdx = bmPages['WEATHER BRIEFING'] !== undefined ? bmPages['WEATHER BRIEFING'] : -1;
    const pkg1PageIdx = bmPages['NOTAM 1'] !== undefined ? bmPages['NOTAM 1'] : -1;

    let dispatchEndIdx = numPages;
    if (weatherBriefingIdx !== -1) dispatchEndIdx = weatherBriefingIdx;
    else if (pkg1PageIdx !== -1) dispatchEndIdx = pkg1PageIdx;
    else if (pkg3StartIdx !== -1) dispatchEndIdx = pkg3StartIdx;

    const notam1PageIdx = bmPages['NOTAM 1'];
    const notam2PageIdx = bmPages['NOTAM 2'];
    const notam3PageIdx = bmPages['NOTAM 3'];
    const weatherBriefingEndIdx = weatherBriefingIdx === -1
      ? -1
      : Math.min(...[notam1PageIdx, notam2PageIdx, notam3PageIdx, numPages]
          .filter(idx => idx !== undefined && idx > weatherBriefingIdx));

    let notam1SubAirports = [];
    let notam2SubAirports = [];
    let notam3SubAirports = [];

    if (notam1PageIdx !== undefined) {
      const notam1EndIdx = notam2PageIdx !== undefined ? notam2PageIdx : (notam3PageIdx !== undefined ? notam3PageIdx : numPages);
      notam1SubAirports = await extractFirstTagAirports(pdfJsDoc, notam1PageIdx, notam1EndIdx, ['DEP', 'DEST', 'ALTN']);
    }
    if (notam2PageIdx !== undefined) {
      const notam2EndIdx = notam3PageIdx !== undefined ? notam3PageIdx : numPages;
      notam2SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam2PageIdx, notam2EndIdx, '(?:\\d+\\s*%\\s*)?ERA|EDTO|REFILE');
    }
    if (notam3PageIdx !== undefined) {
      const notam3EndIdx = numPages;
      notam3SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam3PageIdx, notam3EndIdx, 'FIR');
    }

    // Exclude sentence-level highlighting within a NOTAM whose COMMENT/RMK says it does not apply.
    const excludedNotamLines = new Set();
    const notamLineKey = (pageIdx, y) => `${pageIdx}:${Math.round(y * 2) / 2}`;
    const notamPages = [notam1PageIdx, notam2PageIdx, notam3PageIdx].filter(Number.isInteger);
    if (notamPages.length) {
      const notamIdPattern = /\b[A-Z]\s*\d{4}\s*\/\s*\d{2}\b/i;
      const nonApplicabilityPattern = /\bNO\s+(?:COMPANY|KOREAN\s+AIR|(?:KAL|KE)(?:\s+(?:ROUTE|FLT|FLIGHT))?)\b|\bNOT\s+(?:(?:APPLICABLE|VALID|AVBL|AVAILABLE)\s+(?:(?:TO|FOR)\s+)?|FOR\s+)(?:KAL|KE|KOREAN\s+AIR|COMPANY)\b|\b(?:KAL|KE)\s+(?:ROUTE|FLIGHT)\s+NOT\s+(?:AFFECTED|APPLICABLE)\b/i;
      let currentNotamLines = [];
      const finishNotam = () => {
        if (!currentNotamLines.length) return;
        const fullText = currentNotamLines.map(entry => entry.text).join(' ');
        const commentMatch = /\b(?:COMMENT|REMARKS?|RMK)\b\s*\)?\s*[:)]?/i.exec(fullText);
        if (commentMatch && nonApplicabilityPattern.test(fullText.slice(commentMatch.index + commentMatch[0].length))) {
          for (const entry of currentNotamLines) excludedNotamLines.add(notamLineKey(entry.pageIdx, entry.y));
        }
        currentNotamLines = [];
      };
      for (let scanPageIdx = Math.min(...notamPages); scanPageIdx < numPages; scanPageIdx++) {
        const scanPage = await pdfJsDoc.getPage(scanPageIdx + 1);
        const scanContent = await scanPage.getTextContent();
        const scanOffset = detectPageOffset(scanContent.items.map(item => item.str).join(' '));
        const scanLines = groupTextItemsByLine(scanContent.items, scanOffset);
        for (let lineIdx = 0; lineIdx < scanLines.length; lineIdx++) {
          const text = scanLines[lineIdx].parts
            .map(part => cleanAndDecodeItem(part.item.str, scanOffset))
            .join(' ').trim();
          if (!text) continue;
          const entry = { pageIdx: scanPageIdx, y: scanLines[lineIdx].y, text };
          if (notamIdPattern.test(text)) {
            finishNotam();
            currentNotamLines.push(entry);
          } else if (currentNotamLines.length) {
            currentNotamLines.push(entry);
          }
        }
      }
      finishNotam();
    }

    const edtoPointDataPageIdx = bmPages['EQUAL TIME POINT DATA'] !== undefined ? bmPages['EQUAL TIME POINT DATA'] : -1;

    let totalHits=0;
    const highlightedNotamLines = new Set();
    const highlightedNotamLineKey = (pageIdx, y) => `${pageIdx}:${Math.round(y * 2) / 2}`;

    // 하이라이트/밑줄 레이어 생성 및 주석(Badge) 추가
    if(sel.size > 0 || (typeof bmEnabled !== 'undefined' && bmEnabled) || iataAirports.length === 2){
      setStatus('processing','Calculating highlight/underline positions and drawing...');
      for(let pi=0;pi<numPages;pi++){
        const jsPage=await pdfJsDoc.getPage(pi+1);
        const vp=jsPage.getViewport({scale:1.0});
        const libPage=libPages[pi];
        const {width:lw,height:lh}=libPage.getSize();
        const sx=lw/vp.width;
        const sy=lh/vp.height;

        const content=await jsPage.getTextContent();
        const rawPageText = content.items.map(it => it.str).join(' ');
        const pageOffset = detectPageOffset(rawPageText);

        const isDispatchPage = (dispatchReleaseIdx !== -1 && pi >= dispatchReleaseIdx && pi < dispatchEndIdx);
        const isNotamPage = (pkg1PageIdx !== -1 && pi >= pkg1PageIdx);
        const isWeatherBriefingPage = weatherBriefingIdx !== -1 && pi >= weatherBriefingIdx && pi < weatherBriefingEndIdx;

        if (pageOffset !== 0) {
          for (const item of content.items) {
            const originalStr = cleanAndDecodeItem(item.str, pageOffset);
            const asciiStr = originalStr ? originalStr.replace(/[^\x00-\x7F]/g, '') : '';

            if (asciiStr && asciiStr.trim()) {
              const tx = item.transform;
              const rx = tx[4] * sx;
              const ry = tx[5] * sy;
              const itemH = Math.abs(tx[3]) || 10;
              try {
                libPage.drawText(asciiStr, {
                  x: rx, y: ry, size: itemH * sy, font: stdFont, color: PDFLib.rgb(0, 0, 0), opacity: 0.0
                });
              } catch (err) {
                console.warn("Search layer injection skipped", err);
              }
            }
          }
        }

        const groupedLines = [];
        const sortedItems = content.items
          .filter(it => {
            const sDec = cleanAndDecodeItem(it.str, pageOffset);
            return sDec && sDec.trim();
          })
          .sort((a, b) => b.transform[5] - a.transform[5]);

        for (const item of sortedItems) {
          const itemY = item.transform[5];
          let joined = false;
          for (const line of groupedLines) {
            if (Math.abs(line.y - itemY) < 4.0) {
              line.items.push(item);
              joined = true;
              break;
            }
          }
          if (!joined) groupedLines.push({ y: itemY, items: [item] });
        }

        const isAfterEdtoHeader = (edtoPointDataPageIdx !== -1 && pi >= edtoPointDataPageIdx);

        const sentenceHighlightedLines = new Set();
        for (let lineIndex = 0; lineIndex < groupedLines.length; lineIndex++) {
          const line = groupedLines[lineIndex];
          const lineItems = line.items.sort((a,b) => a.transform[4] - b.transform[4]);
          const lineText = lineItems.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ');
          if (sentenceHighlightedLines.has(lineIndex)) continue;

          // 3자리 IATA 출도착 경로 라인 강조 및 배지 추가
          if (isDispatchPage || isNotamPage || iataAirports.length === 2) {
            let hasRouteStr = false;
            let iataMatch = false;
            if (iataAirports.length === 2) {
              const a = iataAirports[0].toUpperCase(), b = iataAirports[1].toUpperCase();
              const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const pairPattern = new RegExp(`\\b${escape(a)}\\s*\\/\\s*${escape(b)}\\b`, 'i');
              if (pairPattern.test(lineText)) {
                hasRouteStr = true;
                iataMatch = true;
              }
            }

            if (hasRouteStr) {
              if (sel.size > 0 || iataMatch) {
                drawLineHighlight(libPage, lineItems, line.y, sx, sy, PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25);
              }

              if (iataMatch) {
                const srcFS = Math.abs(lineItems[0].transform[3]) || 10;
                const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;

                // IATA 코드와 루트명(예: R11)을 결합
                const routeInfo = (typeof extractedRoute !== 'undefined' && extractedRoute) ? ` ${extractedRoute}` : '';
                const badgeText = `${iataAirports[0]}/${iataAirports[1]}${routeInfo}`;

                drawDutyTimeStyleBadge(libPage, {
                  text: badgeText,
                  x: getRightAlignedBadgeX(libPage, badgeText, boldFont),
                  centerY: srcMidY,
                  font: boldFont
                });
              }

              if (sel.size > 0 || iataMatch) totalHits++;
              // 경로 전체 줄이 처리된 경우 일반 키워드 하이라이트는 중복 적용하지 않는다.
              continue;
            }
          }

          // ETP 라인 강조
          const isEtpLine = /\betp\s*[1-5]/i.test(lineText);
          if (isEtpLine && isAfterEdtoHeader) {
            if (sel.size > 0) drawLineHighlight(libPage, lineItems, line.y, sx, sy, PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25);
            totalHits++;
            continue;
          }

          // FIR 라인 강조
          const isParLine = /\/\s*[A-Z]{4}\s+FIR/i.test(lineText);
          if (isParLine) {
            const firRegex = /\bFIR\b/i;
            const match = firRegex.exec(lineText);
            if (match) {
              const postFirText = lineText.substring(match.index + match[0].length);
              const wordMatch = postFirText.match(/[A-Za-z]{3,}/);
              if (wordMatch) {
                const targetWord = wordMatch[0];
                for (const item of lineItems) {
                  const s = cleanAndDecodeItem(item.str, pageOffset);
                  const tx = item.transform;
                  const itemX = tx[4], itemY = tx[5];
                  const itemW = item.width || 0;
                  const itemH = Math.abs(tx[3]) || 10;

                  const idx = s.toUpperCase().indexOf(targetWord.toUpperCase());
                  if (idx !== -1) {
                    const fullMeasuredW = stdFont.widthOfTextAtSize(s, itemH);
                    const prefixMeasuredW = stdFont.widthOfTextAtSize(s.substring(0, idx), itemH);
                    const matchMeasuredW = stdFont.widthOfTextAtSize(s.substring(idx, idx + targetWord.length), itemH);

                    const startXOffset = fullMeasuredW > 0 ? (prefixMeasuredW / fullMeasuredW) * itemW : (itemW / s.length) * idx;
                    const actualHlWidth = fullMeasuredW > 0 ? (matchMeasuredW / fullMeasuredW) * itemW : (itemW / s.length) * targetWord.length;

                    const rx = (itemX + startXOffset) * sx;
                    const rw = actualHlWidth * sx;
                    
                    const metrics = getTextMetrics(item, sy, itemH);
                    if (sel.size > 0) {
                      drawMarkerRect(
                        libPage, rx - 1, metrics.textBottomY,
                        Math.max(rw + 2, 4), metrics.textHeight,
                        PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, itemH
                      );
                    }
                    totalHits++;
                  }
                }
              }
            }
            continue;
          }

          // 문장 키워드 강조
          const excludedNotamLine = excludedNotamLines.has(notamLineKey(pi, line.y));
          const hasUnsatisfactoryService = !excludedNotamLine && /\bU\s*\/\s*S\b/i.test(lineText);
          if (hasUnsatisfactoryService) {
            if (sel.size > 0) drawLineHighlight(libPage, lineItems, line.y, sx, sy, PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25);
            totalHits++;
            continue;
          }
          const hasSentenceKw = !excludedNotamLine && SENTENCE_KW.some(kw => checkKeywordMatch(lineText, kw));
          const hasSevereWeather = isWeatherBriefingPage &&
            lineText.split(/[^A-Z0-9+-]+/i).some(isWeatherCodeToken);
          if (hasSentenceKw || hasSevereWeather) {
            if (sel.size > 0) {
              const sentencePeriod = /\.[\])}"']*\s*$/;
              const nextBlockPattern = /^(?:TAF|METAR|SPECI|TEMPO|BECMG|FM\d{4}|PROB\d{2,4}|INTER|NOTAM|WEATHER\s+BRIEFING|ENROUTE\s+WEATHER|CFP\s+PLAN|DISPATCH\b|COPY\s+OF\s+ATS)\b/i;
              let sentenceEndIndex = sentencePeriod.test(lineText.trim()) ? lineIndex : -1;
              let previousLine = line;
              const currentSize = Math.abs(lineItems[0]?.transform[3]) || 10;

              // Extend to following visual lines only if the same paragraph reaches a full stop.
              for (let nextIndex = lineIndex + 1; sentenceEndIndex === -1 && nextIndex < groupedLines.length; nextIndex++) {
                const nextLine = groupedLines[nextIndex];
                const nextItems = nextLine.items.slice().sort((a, b) => a.transform[4] - b.transform[4]);
                const nextText = nextItems.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ').trim();
                const lineGap = Math.abs(previousLine.y - nextLine.y);
                if (lineGap > Math.max(currentSize * 1.8, 8) || nextBlockPattern.test(nextText)) break;
                if (sentencePeriod.test(nextText)) sentenceEndIndex = nextIndex;
                previousLine = nextLine;
              }

              const lastHighlightIndex = sentenceEndIndex === -1 ? lineIndex : sentenceEndIndex;
              for (let highlightIndex = lineIndex; highlightIndex <= lastHighlightIndex; highlightIndex++) {
                const highlightLine = groupedLines[highlightIndex];
                const highlightItems = highlightLine.items.slice().sort((a, b) => a.transform[4] - b.transform[4]);
                drawLineHighlight(libPage, highlightItems, highlightLine.y, sx, sy, PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25);
                if (isNotamPage) highlightedNotamLines.add(highlightedNotamLineKey(pi, highlightLine.y));
                sentenceHighlightedLines.add(highlightIndex);
              }
            }
            totalHits++;
            continue;
          }

          // 문자 단위 매핑
          const charMapping = [];
          for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            const decodedStr = cleanAndDecodeItem(item.str, pageOffset) || '';
            if (i > 0) charMapping.push({ isSeparator: true });
            for (let charIdx = 0; charIdx < decodedStr.length; charIdx++) {
              charMapping.push({ itemIndex: i, charIndex: charIdx, char: decodedStr[charIdx] });
            }
          }
          const lineTextFromMapping = charMapping.map(m => m.isSeparator ? ' ' : m.char).join('');
          const cleanLineText = lineTextFromMapping.replace(/[^A-Za-z0-9]/g, ' ');

          if (typeof customLineHighlight !== 'undefined' && customLineHighlight &&
              custom.some(word => sel.has(word) && customKeywordPattern(word)?.test(lineText))) {
            const customColor = PDFLib.rgb(...hlRGB.map(value => 0.68 + value * 0.32));
            let sentenceStart = lineIndex;
            while (sentenceStart > 0 && !/[.!?][\])}"']*\s*$/.test(
              groupedLines[sentenceStart - 1].items.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ')
            )) sentenceStart--;
            let sentenceEnd = lineIndex;
            while (sentenceEnd < groupedLines.length - 1 && !/[.!?][\])}"']*\s*$/.test(
              groupedLines[sentenceEnd].items.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ')
            )) sentenceEnd++;
            for (let highlightIndex = sentenceStart; highlightIndex <= sentenceEnd; highlightIndex++) {
              const sentenceItems = groupedLines[highlightIndex].items.slice().sort((a, b) => a.transform[4] - b.transform[4]);
              drawLineHighlight(libPage, sentenceItems, groupedLines[highlightIndex].y, sx, sy, customColor, 0.25);
            }
            totalHits++;
            continue;
          }

          // 키워드 강조
          for (const kw of keywords) {
            const keywordColor = custom.includes(kw) ? PDFLib.rgb(...hlRGB.map(value => 0.68 + value * 0.32)) : PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]);
            if (excludedNotamLine && SENTENCE_KW.some(sentenceKw => sentenceKw.toUpperCase() === kw.trim().toUpperCase())) continue;
            const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^A-Za-z0-9]+');
            let re;
            try { re = custom.includes(kw) ? customKeywordPattern(kw) : new RegExp(`\\b${escapedKw}\\b`, 'gi'); } catch(e) { re = new RegExp(escapedKw, 'gi'); }
            if (!re) continue;
            let m;
            let lastIndex = -1;
            while ((m = re.exec(custom.includes(kw) ? lineTextFromMapping : cleanLineText)) !== null) {
              if (re.lastIndex === lastIndex) { re.lastIndex++; continue; }
              lastIndex = re.lastIndex;
              const startIdx = m.index;
              const endIdx = startIdx + m[0].length;
              if (kw.toUpperCase() === 'MEL' || kw.toUpperCase() === 'CDL') {
                if (lineTextFromMapping[startIdx - 1] === '/' || lineTextFromMapping[endIdx] === '/') continue;
              }
              if (kw.toUpperCase() === 'MAY') {
                const beforeCtx = cleanLineText.slice(Math.max(0, startIdx - 6), startIdx);
                const afterCtx = cleanLineText.slice(endIdx, endIdx + 6);
                const isDateCtx = /\d\s*[A-Z]{0,2}\s*$/i.test(beforeCtx) || /^\s*\d/.test(afterCtx);
                if (isDateCtx) continue;
              }
              const itemMatches = {};
              for (let c = startIdx; c < endIdx; c++) {
                const map = charMapping[c];
                if (map && !map.isSeparator) {
                  if (!itemMatches[map.itemIndex]) itemMatches[map.itemIndex] = [];
                  itemMatches[map.itemIndex].push(map.charIndex);
                } else if (map?.isSeparator && c > startIdx && c + 1 < endIdx) {
                  const previousMap = charMapping[c - 1];
                  const nextMap = charMapping[c + 1];
                  if (!previousMap?.isSeparator && !nextMap?.isSeparator && previousMap.itemIndex !== nextMap.itemIndex) {
                    const previousItem = lineItems[previousMap.itemIndex];
                    const nextItem = lineItems[nextMap.itemIndex];
                    const gapStart = previousItem.transform[4] + (previousItem.width || 0);
                    const gapWidth = nextItem.transform[4] - gapStart;
                    const itemH = Math.abs(previousItem.transform[3]) || 10;
                    if (gapWidth > Math.max(itemH * 0.15, 0.5) && sel.size > 0) {
                      const metrics = getTextMetrics(previousItem, sy, itemH);
                      drawMarkerRect(
                        libPage,
                        gapStart * sx,
                        metrics.textBottomY,
                        gapWidth * sx,
                        metrics.textHeight,
                        keywordColor,
                        0.25,
                        itemH
                      );
                    }
                  }
                }
              }
              for (const itemIdxStr of Object.keys(itemMatches)) {
                const itemIdx = parseInt(itemIdxStr, 10);
                const charIndices = itemMatches[itemIdx];
                if (charIndices.length === 0) continue;
                const minCharIdx = Math.min(...charIndices);
                const maxCharIdx = Math.max(...charIndices);
                const item = lineItems[itemIdx];
                if (sel.size > 0) {
                  drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                    keywordColor, 0.25, stdFont);
                }
                totalHits++;
              }
            }
          }

          // DOF 강조
          {
            const dofLineRegex = /\bDOF\s+(\d{6})\b/i;
            const dofLineM = dofLineRegex.exec(cleanLineText);
            if (dofLineM) {
              const dStart = dofLineM.index + dofLineM[0].length - dofLineM[1].length;
              const dEnd = dStart + 6;
              const dItemMatches = {};
              for (let c = dStart; c < dEnd; c++) {
                const map = charMapping[c];
                if (map && !map.isSeparator) {
                  if (!dItemMatches[map.itemIndex]) dItemMatches[map.itemIndex] = [];
                  dItemMatches[map.itemIndex].push(map.charIndex);
                }
              }
              for (const itemIdxStr of Object.keys(dItemMatches)) {
                const itemIdx = parseInt(itemIdxStr, 10);
                const charIndices = dItemMatches[itemIdx];
                if (charIndices.length === 0) continue;
                const minCharIdx = Math.min(...charIndices);
                const maxCharIdx = Math.max(...charIndices);
                const item = lineItems[itemIdx];
                if (sel.size > 0) {
                  drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                    PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);
                }
                totalHits++;
              }
            }
          }

          // Shear 값 강조
          const shearRegex = /\b\d{5}[A-Za-z ]\d{3}\s+([0-9]{2})\b/g;
          let shrM;
          let lastShrIdx = -1;
          if (lineTextFromMapping.includes('---')) {
            while ((shrM = shearRegex.exec(cleanLineText)) !== null) {
              if (shearRegex.lastIndex === lastShrIdx) { shearRegex.lastIndex++; continue; }
              lastShrIdx = shearRegex.lastIndex;
              const shearVal = parseInt(shrM[1], 10);
              if (shearVal >= 5) {
                const startIdx = shrM.index + shrM[0].length - shrM[1].length;
                const endIdx = startIdx + shrM[1].length;
                const itemMatches = {};
                for (let c = startIdx; c < endIdx; c++) {
                  const map = charMapping[c];
                  if (map && !map.isSeparator) {
                    if (!itemMatches[map.itemIndex]) itemMatches[map.itemIndex] = [];
                    itemMatches[map.itemIndex].push(map.charIndex);
                  }
                }
                for (const itemIdxStr of Object.keys(itemMatches)) {
                  const itemIdx = parseInt(itemIdxStr, 10);
                  const charIndices = itemMatches[itemIdx];
                  if (charIndices.length === 0) continue;
                  const minCharIdx = Math.min(...charIndices);
                  const maxCharIdx = Math.max(...charIndices);
                  const matchCharCount = maxCharIdx - minCharIdx + 1;
                  const item = lineItems[itemIdx];
                  const s = cleanAndDecodeItem(item.str, pageOffset) || '';
                  const tx = item.transform;
                  const itemX = tx[4], itemY = tx[5];
                  const itemW = item.width || 0;
                  const itemH = Math.abs(tx[3]) || 10;
                  const charW = itemW / Math.max(s.length, 1);
                  const rx = (itemX + minCharIdx * charW) * sx;
                  const rw = matchCharCount * charW * sx;
                  
                  const metrics = getTextMetrics(item, sy, itemH);
                  if (sel.size > 0) {
                    drawMarkerRect(
                      libPage, rx, metrics.textBottomY,
                      Math.max(rw, 4), metrics.textHeight,
                      PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, itemH
                    );
                  }
                  totalHits++;
                }
              }
            }
          }

          // MSA 값 강조
          const msaRegex = /---\s*\/\s*(\d{3})\b/i;
          const msaMatch = lineText.match(msaRegex);
          if (msaMatch) {
            const msaVal = parseInt(msaMatch[1], 10);
            if (msaVal >= 100) {
              const targetMsaStr = msaMatch[1];
              for (const item of lineItems) {
                const s = cleanAndDecodeItem(item.str, pageOffset);
                let idx = s.indexOf("/" + targetMsaStr);
                if (idx !== -1) {
                  idx += 1;
                  const tx = item.transform;
                  const charW = (item.width || 0) / Math.max(item.str.length, 1);
                  const rx = (tx[4] + idx * charW) * sx;
                  const rw = targetMsaStr.length * charW * sx;
                  const itemH = Math.abs(tx[3]) || 10;
                  const metrics = getTextMetrics(item, sy, itemH);
                  if (sel.size > 0) {
                    drawMarkerRect(
                      libPage, rx - 1, metrics.textBottomY,
                      Math.max(rw + 2, 4), metrics.textHeight,
                      PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, itemH
                    );
                  }
                  totalHits++;
                } else if (s === targetMsaStr) {
                  const tx = item.transform;
                  const rx = tx[4] * sx;
                  const rw = (item.width || 0) * sx;
                  const itemH = Math.abs(tx[3]) || 10;
                  const metrics = getTextMetrics(item, sy, itemH);
                  if (sel.size > 0) {
                    drawMarkerRect(
                      libPage, rx - 1, metrics.textBottomY,
                      Math.max(rw + 2, 4), metrics.textHeight,
                      PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, itemH
                    );
                  }
                  totalHits++;
                }
              }
            }
          }
        }
      }
    }

    const ctx=pdfLibDoc.context;
    const outlineItems=[];
    const bmLabelToRef={};

    for(const bm of BOOKMARK_PATTERNS){
      let pi=bmPages[bm.label];if(pi===undefined)continue;
      if (bm.label === 'COPY OF ATS' && coaAnnotIdx !== -1) pi = coaAnnotIdx;
      const pageRef=pdfLibDoc.getPage(pi).ref;
      let dest;
      if (bm.label === 'EQUAL TIME POINT DATA' && typeof edtoBookmarkY === 'number') {
        const pageObj = pdfLibDoc.getPage(pi);
        const pageHeight = pageObj.getHeight();
        const topMargin = 30;
        const topY = Math.max(0, Math.min(pageHeight, edtoBookmarkY + topMargin));
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)]);
      } else {
        dest=ctx.obj([pageRef,PDFLib.PDFName.of('Fit')]);
      }
      const itemDict=ctx.obj({Title:PDFLib.PDFString.of(bm.label),Dest:dest});
      const itemRef=ctx.register(itemDict);
      outlineItems.push(itemRef);
      bmLabelToRef[bm.label]=itemRef;
    }

    function attachSubBookmarks(parentLabel, subAirports){
      const parentRef=bmLabelToRef[parentLabel];
      if(!parentRef||!subAirports||subAirports.length===0)return;
      const parentDict=ctx.lookup(parentRef);
      const childRefs=subAirports.map(item=>{
        const childPage=pdfLibDoc.getPage(item.pageIdx);
        const childPageRef=childPage.ref;
        const pageHeight = childPage.getHeight();
        const topMargin = 30;
        let topY = (typeof item.y === 'number') ? (item.y + topMargin) : pageHeight;
        topY = Math.max(0, Math.min(pageHeight, topY));
        const childDest = (typeof item.y === 'number')
          ? ctx.obj([childPageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)])
          : ctx.obj([childPageRef, PDFLib.PDFName.of('Fit')]);
        let childTitle = item.title;

        if (childTitle) {
          childTitle = childTitle
            .replace(/^\s*\[\s*/, '')
            .replace(/\s*\]\s*/, ' ')
            .replace(/\s*\/\s*/, ' ')
            .replace(/\s*,.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          childTitle = `${item.tag} ${item.code}`.trim();
        }
        
        const childDict=ctx.obj({Title:PDFLib.PDFString.of(childTitle),Dest:childDest,Parent:parentRef});
        return ctx.register(childDict);
      });
      for(let i=0;i<childRefs.length;i++){
        const d=ctx.lookup(childRefs[i]);
        if(i>0)d.set(PDFLib.PDFName.of('Prev'),childRefs[i-1]);
        if(i<childRefs.length-1)d.set(PDFLib.PDFName.of('Next'),childRefs[i+1]);
      }
      parentDict.set(PDFLib.PDFName.of('First'),childRefs[0]);
      parentDict.set(PDFLib.PDFName.of('Last'),childRefs[childRefs.length-1]);
      parentDict.set(PDFLib.PDFName.of('Count'),PDFLib.PDFNumber.of(childRefs.length));
    }

    const weatherSubBookmarks = [];
    if (notam1PageIdx !== undefined && notam1PageIdx > 0) {
      weatherSubBookmarks.push({ title: 'Vertical Cross-Section', pageIdx: notam1PageIdx - 1, y: null });
    }
    attachSubBookmarks('WEATHER BRIEFING', weatherSubBookmarks);
    attachSubBookmarks('NOTAM 1', notam1SubAirports);
    attachSubBookmarks('NOTAM 2', notam2SubAirports);
    attachSubBookmarks('NOTAM 3', notam3SubAirports);

    if(outlineItems.length>0){
      for(let i=0;i<outlineItems.length;i++){
        const d=ctx.lookup(outlineItems[i]);
        if(i>0)d.set(PDFLib.PDFName.of('Prev'),outlineItems[i-1]);
        if(i<outlineItems.length-1)d.set(PDFLib.PDFName.of('Next'),outlineItems[i+1]);
      }
      const outlineDict=ctx.obj({Type:PDFLib.PDFName.of('Outlines'),First:outlineItems[0],Last:outlineItems[outlineItems.length-1],Count:PDFLib.PDFNumber.of(outlineItems.length)});
      const outlineRef=ctx.register(outlineDict);
      for(const ref of outlineItems)ctx.lookup(ref).set(PDFLib.PDFName.of('Parent'),outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('Outlines'),outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('PageMode'),PDFLib.PDFName.of('UseOutlines'));
    }

    let routeTokens = [];
    let discFuel = '', discTime = '';
    let extractedEtd = '', extractedEta = '';
    let etdZulu = '';
    let firEetMap = {};
    let suitableMap = {};
    let wptTimeMap = new Map();
    let tripElapsedTime = '';
    let cfpFullSectionText = '';
    const estimatedWpts = new Set();

    const cfpPageIdx = bmPages['CFP PLAN'];
    const resolvedCoaPageIdx = bmPages['COPY OF ATS'] !== undefined ? bmPages['COPY OF ATS'] : -1;
    const finalCoaAnnotIdx = coaAnnotIdx !== -1 ? coaAnnotIdx : resolvedCoaPageIdx;

    let foundCoaPageOffset = 0;
    if (finalCoaAnnotIdx !== -1) {
      const coaRawPage = await pdfJsDoc.getPage(finalCoaAnnotIdx + 1);
      const coaRawContent = await coaRawPage.getTextContent();
      foundCoaPageOffset = detectPageOffset(coaRawContent.items.map(it => it.str).join(' '));
    }

    console.log('[FUEL BADGE DEBUG] cfpPageIdx (CFP PLAN 북마크):', cfpPageIdx);
    // ================================================================
    // RQRD / REFILE POINT 연료 차이 배지 추가 (수정됨)
    // ================================================================
    // REFILE POINT 연료 / RQRD 텍스트는 CFP PLAN 페이지가 아니라
    // 별도의 "REFILE FLT PLAN" 페이지에 있을 수 있으므로, CFP 섹션(다음 북마크 전까지) 범위에서 탐색한다.
    let refilePageIdx = -1;
    let refilePageText = "";
    let refilePageOffset = 0;
    let refilePageContent = null;
    let refileLibPage = null;
    let refileSx = 1, refileSy = 1;
      const refileSearchEnd = numPages;
      for (let rpi = 0; rpi < refileSearchEnd; rpi++) {
      const rJsPage = await pdfJsDoc.getPage(rpi + 1);
      const rContent = await rJsPage.getTextContent();
      const rRaw = rContent.items.map(it => it.str).join(' ');
      const rOffset = detectPageOffset(rRaw);
      const rText = rContent.items.map(it => cleanAndDecodeItem(it.str, rOffset)).join(' ');
      if (/PLANNED\s+R\/F\s+AT\s+REFILE\s+POINT\s+\d{3,6}/i.test(rText)) {
        refilePageIdx = rpi;
        refilePageText = rText;
        refilePageOffset = rOffset;
        refilePageContent = rContent;
        refileLibPage = libPages[rpi];
        const rVp = rJsPage.getViewport({ scale: 1.0 });
        const { width: rW, height: rH } = refileLibPage.getSize();
        refileSx = rW / rVp.width;
        refileSy = rH / rVp.height;
        break;
      }
    }

    // REFILE POINT 연료 찾기
    const refileMatch = refilePageText.match(/PLANNED\s+R\/F\s+AT\s+REFILE\s+POINT\s+(\d{3,6})/i);
    console.log('[FUEL BADGE DEBUG] refileMatch:', refileMatch);

    let refileFuel = null;
    if (refileMatch) {
      refileFuel = parseInt(refileMatch[1], 10) * 100;
      console.log('[FUEL BADGE DEBUG] refileFuel:', refileFuel);
    }

    // RQRD 연료 찾기 - 더 넓은 컨텍스트 검색
    if (refileFuel !== null && refilePageIdx !== -1) {
      const allRqrdMatches = [];
      const rqrdRegex = /\bRQRD\s+(\d{3,5})\s+\d{2}\.\d{2}/gi;
      let rqrdMatch;
      while ((rqrdMatch = rqrdRegex.exec(refilePageText)) !== null) {
        allRqrdMatches.push({
          match: rqrdMatch[0],
          value: parseInt(rqrdMatch[1], 10) * 100,
          index: rqrdMatch.index
        });
      }
      console.log('[FUEL BADGE DEBUG] 모든 RQRD 매치:', allRqrdMatches);

      let targetRqrd = null;
      let minValue = Infinity;
      for (const r of allRqrdMatches) {
        if (r.value < minValue) {
          minValue = r.value;
          targetRqrd = r;
        }
      }
      console.log('[FUEL BADGE DEBUG] 최소 RQRD:', targetRqrd);

      if (targetRqrd) {
        const diff = refileFuel - targetRqrd.value;
        const sign = diff >= 0 ? '+' : '-';
        const formatted = Math.abs(diff).toLocaleString('en-US');
        const badgeText = `${sign} ${formatted} lbs`;

        const rqrdLines = groupTextItemsByLine(refilePageContent.items, refilePageOffset);
        for (const line of rqrdLines) {
          if (line.text.replace(/\s+/g, '').includes(targetRqrd.match.replace(/\s+/g, ''))) {
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
            const srcMidY = line.y * refileSy + srcFS * refileSy * SOURCE_TEXT_CENTER_RATIO;
            drawDutyTimeStyleBadge(refileLibPage, {
              text: badgeText,
              x: getRightAlignedBadgeX(refileLibPage, badgeText, boldFont),
              centerY: srcMidY,
              font: boldFont
            });
            console.log('[FUEL BADGE DEBUG] 배지 생성됨:', badgeText);
            totalHits++;
            break;
          }
        }
      }
    }

  
    
    if(cfpPageIdx!==undefined) {
      const cfpJsPage=await pdfJsDoc.getPage(cfpPageIdx+1);
      const cfpContent=await cfpJsPage.getTextContent();
      const rawCfpText = cfpContent.items.map(it => it.str).join(' ');
      const cfpOffset = detectPageOffset(rawCfpText);
      const cfpLibPage = libPages[cfpPageIdx];
      const { width: cfpW, height: cfpH } = cfpLibPage.getSize();
      const cfpVp = cfpJsPage.getViewport({ scale: 1.0 });
      const cfpSx = cfpW / cfpVp.width;
      const cfpSy = cfpH / cfpVp.height;

      const cfpItems=cfpContent.items.slice().sort((a,b)=>{
        const ay=a.transform[5],by2=b.transform[5];
        if(Math.abs(ay-by2)>2)return by2-ay;
        return a.transform[4]-b.transform[4];
      });

      let cfpFirstPageText = "";
      let lastY = null;
      for (const item of cfpItems) {
        const decodedStr = cleanAndDecodeItem(item.str, cfpOffset);
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 4.5) {
          cfpFirstPageText += "\n";
        }
        cfpFirstPageText += decodedStr + " ";
        lastY = item.transform[5];
      }

      // ★ 다음 섹션 북마크 전까지를 CFP 섹션 범위로 먼저 계산 (RQRD 탐색 범위 제한용으로도 재사용)
      const cfpEndIdx = Math.min(
        numPages,
        ...[resolvedCoaPageIdx, dispatchReleaseIdx, weatherBriefingIdx, pkg1PageIdx]
          .filter(idx => idx !== -1 && idx > cfpPageIdx)
      );
      const safeCfpEndIdx = (cfpEndIdx === numPages || cfpEndIdx <= cfpPageIdx) ? Math.min(numPages, cfpPageIdx + 20) : cfpEndIdx;

      
      // CFP 섹션 전체를 스캔하여 WPT Time Map 구축
      cfpFullSectionText = "";
      for (let pi = cfpPageIdx; pi < safeCfpEndIdx; pi++) {
        const p = await pdfJsDoc.getPage(pi + 1);
        const tc = await p.getTextContent();
        const raw = tc.items.map(it => it.str).join(' ');
        const off = detectPageOffset(raw);
        const sorted = tc.items.slice().sort((a,b)=>{
          const ay=a.transform[5], by2=b.transform[5];
          if(Math.abs(ay-by2)>2) return by2-ay;
          return a.transform[4]-b.transform[4];
        });
        let pageLastY = null;
        for (const item of sorted) {
          const s = cleanAndDecodeItem(item.str, off);
          if (pageLastY !== null && Math.abs(item.transform[5] - pageLastY) > 4.5) cfpFullSectionText += "\n";
          cfpFullSectionText += s + " ";
          pageLastY = item.transform[5];
        }
        cfpFullSectionText += "\n";
      }

      wptTimeMap = buildWptTimeMap(cfpFullSectionText);
      const estimatedW145 = estimateWptTimeFromEtp(cfpFullSectionText, 'W145');
      if (estimatedW145 && !wptTimeMap.has('W145')) {
        wptTimeMap.set('W145', estimatedW145);
        estimatedWpts.add('W145');
      }
      
      // =========================================================================
      // TRIP 시간 계산 (DUTY TIME 오버레이) - 첫 페이지 기준
      // =========================================================================
      const tripMatch = cfpFirstPageText.match(/\bTRIP\s+(\d{3,5})\s+(\d{2})\.(\d{2})\b/i);
      if (tripMatch && Number(tripMatch[3]) < 60) {
        tripElapsedTime = `${tripMatch[2]}.${tripMatch[3]}`;
      }
      if (tripMatch) {
        const hours = parseInt(tripMatch[2], 10);
        const minutes = parseInt(tripMatch[3], 10);
        const totalMinutes = hours * 60 + minutes;

        const formatTime = (totalMins) => {
          const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
          const m = (totalMins % 60).toString().padStart(2, '0');
          return `${h}:${m}`;
        };

        let formattedCalcText = "";
        if (totalMinutes >= 690) {
          const halfMin = Math.round(totalMinutes / 2);
          formattedCalcText = `DUTY TIME ${formatTime(halfMin)}`;
        } else if (totalMinutes >= 450) {
          const twoThirdsMin = Math.round((totalMinutes * 2) / 3);
          const oneThirdMin = Math.round(totalMinutes / 3);
          formattedCalcText = `DUTY TIME ${formatTime(twoThirdsMin)} (${formatTime(oneThirdMin)})`;
        }

        if (formattedCalcText) {
          let secondLineY = null, secondLineFS = 10;
          for (const item of cfpItems) {
            const s = cleanAndDecodeItem(item.str, cfpOffset);
            if (/2ND/i.test(s)) {
              secondLineY = item.transform[5];
              secondLineFS = Math.abs(item.transform[3]) || 10;
              break;
            }
          }
          if (secondLineY !== null) {
            const srcMidY = secondLineY + secondLineFS * SOURCE_TEXT_CENTER_RATIO;

            drawDutyTimeStyleBadge(cfpLibPage, {
              text: formattedCalcText,
              x: getRightAlignedBadgeX(cfpLibPage, formattedCalcText, boldFont),
              centerY: srcMidY * cfpSy,
              font: boldFont
            });
            totalHits++;
          }
        }
      }

      let extractedRoute = "";
      {
        const distIdx = cfpFullSectionText.search(/DIST\s+LATITUDE/i);
        if (distIdx !== -1) {
          const beforeDist = cfpFullSectionText.substring(0, distIdx);
          const lines = beforeDist.split('\n').map(l => l.trim()).filter(l => l);
          let routeStartLine = -1;
          for (let i = lines.length - 1; i >= 0; i--) {
            if (/2ND/i.test(lines[i])) { routeStartLine = i + 1; break; }
          }
          if (routeStartLine !== -1 && routeStartLine < lines.length) {
            extractedRoute = lines.slice(routeStartLine).join(' ').trim();
          }
        }
      }

      if (!extractedRoute && detectedAirports.length === 2) {
        const depCode = detectedAirports[0], arrCode = detectedAirports[1];
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const routePattern1 = new RegExp(`${escapeRegExp(depCode)}\\.\\.[\\s\\S]{5,800}?\\.\\.${escapeRegExp(arrCode)}`, 'i');
        const routePattern2 = new RegExp(`\\b${escapeRegExp(depCode)}\\b[\\s\\S]{5,800}?\\b${escapeRegExp(arrCode)}\\b`, 'i');
        let rMatch = cfpFullSectionText.match(routePattern1) || cfpFullSectionText.match(routePattern2);
        if (rMatch) extractedRoute = rMatch[0].trim();
      }

      if(extractedRoute) {
        const noiseWords = ['FLIGHT', 'PLAN', 'FUEL', 'TIME', 'WIND', 'TEMP', 'DIST', 'COMP', 'FREQ', 'RMK', 'ALTN', 'AWY', 'POS', 'LAT', 'LONG', 'ETA', 'ETD', 'ACTL', 'TOC', 'CLB', 'CRZ', 'DSC', 'IFR', 'NAM', 'AGTOW', 'TRIP', 'SOW', 'RWY', 'RESERVE', 'FINAL', 'RES', 'CONT', 'REFILE', 'RQD', 'TAKEOFF', 'DISC', 'TANKERING', 'PLN', 'RAMP', 'OUT', 'FOD', 'ROD', 'TOW', 'MTOW', 'LDW', 'MLDW', 'TIF', 'TCAP', 'PAX', 'CGO'];
        const airportCodes = new Set([...detectedAirports, ...iataAirports].map(code => code.toUpperCase()));
        routeTokens = extractedRoute
            .replace(/\.\./g, ' ')
            .replace(/[^A-Za-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 2 && !noiseWords.includes(t.toUpperCase()) && !airportCodes.has(t.toUpperCase()) && !/^\d+$/.test(t));
      }

      const discMatch = cfpFullSectionText.match(/\bDISC\b\s+(\d{4})\s+(\d{2}\.\d{2})/i);
      discFuel = discMatch ? discMatch[1] : '';
      discTime = discMatch ? discMatch[2] : '';

      const etdEtaMatch = cfpFullSectionText.match(/\bETD\s+([A-Z]{3,4})\s+(\d{4}Z)\s+ETA\s+([A-Z]{3,4})\s+(\d{4}Z)/i);
      if (etdEtaMatch) {
        extractedEtd = `${etdEtaMatch[1].toUpperCase()} ${etdEtaMatch[2].toUpperCase()}`;
        extractedEta = `${etdEtaMatch[3].toUpperCase()} ${etdEtaMatch[4].toUpperCase()}`;
        etdZulu = etdEtaMatch[2].substring(0, 4); // 숫자 4자리 추출
        const trip = cfpFullSectionText.match(/\bTRIP\s+\d+\s+(\d{2}\.\d{2})\b/i);
        extractedEta += arrivalDayLabel(etdEtaMatch[2], etdEtaMatch[4], trip?.[1]);
      }

      if (finalCoaAnnotIdx !== -1) {
        const coaJsPage=await pdfJsDoc.getPage(finalCoaAnnotIdx+1);
        const coaContent=await coaJsPage.getTextContent();
        const coaLibPage = libPages[finalCoaAnnotIdx];
        const {width:coaW,height:coaH}=coaLibPage.getSize();
        const coaVp=coaJsPage.getViewport({scale:1.0});
        const coaSx=coaW/coaVp.width;
        const coaSy=coaH/coaVp.height;

        const sortedCoaItems = coaContent.items.slice().sort((a,b) => {
          const ay = a.transform[5], by = b.transform[5];
          if (Math.abs(ay - by) > 4) return by - ay;
          return a.transform[4] - b.transform[4];
        });

        let coaFullTextWithNewlines = "";
        const coaCharMapping = [];

        for (let i = 0; i < sortedCoaItems.length; i++) {
          const item = sortedCoaItems[i];
          const prevItem = i > 0 ? sortedCoaItems[i-1] : null;
          const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';

          if (prevItem) {
             const dy = Math.abs(prevItem.transform[5] - item.transform[5]);
             const dx = item.transform[4] - (prevItem.transform[4] + prevItem.width);
             if (dy > 4 || dx > 2) {
                  coaFullTextWithNewlines += "\n";
                 coaCharMapping.push({ isSeparator: true, itemIndex: -1, charIndex: -1 });
             }
          }

          for (let c = 0; c < s.length; c++) {
             let charToMatch = s[c].toUpperCase();
             if (!/[A-Z0-9\/\-]/.test(charToMatch)) charToMatch = ' ';
             coaFullTextWithNewlines += charToMatch;
             coaCharMapping.push({ itemIndex: i, charIndex: c });
          }
        }

        const differences = flightDifferences(cfpFullSectionText, coaFullTextWithNewlines);
        for (let di = 0; di < differences.length; di++) {
          drawDutyTimeStyleBadge(coaLibPage, {
            text: differences[di],
            x: getRightAlignedBadgeX(coaLibPage, differences[di], boldFont),
            centerY: coaH - 24 - di * 18,
            font: boldFont,
            bgColor: [1, 0.8, 0.55]
          });
        }

        // EET/ 필드 파싱 (FIR 진입시간 계산용)
        const eetMatch = coaFullTextWithNewlines.match(/EET\/([\s\S]+?)(?=\s[A-Z]{3,}\/|(?:\n[A-Z]{3,}\/)|$)/i);
        if (eetMatch) {
          const eetContent = eetMatch[1].replace(/\n/g, ' ');
          const eetParts = eetContent.trim().split(/\s+/);
          for (const part of eetParts) {
            const m = part.match(/^([A-Z]{4})(\d{4})$/);
            if (m) firEetMap[m[1]] = m[2];
          }
        }

        const speedAltRegex = /-(K|N|M)\s*\d\s*\d\s*\d\s*\d\s*(F|S|M|A)\s*\d\s*\d\s*\d/i;
        let destRegex = detectedAirports.length === 2
          ? new RegExp(`-\\s*${detectedAirports[1].split('').join('\\s*')}\\s*\\d\\s*\\d\\s*\\d\\s*\\d`, 'i')
          : /-\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*\d\s*\d\s*\d\s*\d/i;

        const startMatch = coaFullTextWithNewlines.match(speedAltRegex);
        const endMatch = coaFullTextWithNewlines.match(destRegex);
        let highlightedSomething = false;
        const routeTokenSet = new Set(routeTokens.map(token => token.toUpperCase()));
        const routeBoundsFound = Boolean(startMatch && endMatch && startMatch.index < endMatch.index);
        if (routeBoundsFound && extractedRoute && detectedAirports.length === 2) {
          const cfpTokens = routeComparisonTokens(extractedRoute);
          const atsTokens = routeComparisonTokens(coaFullTextWithNewlines.slice(startMatch.index + startMatch[0].length, endMatch.index));
          if (cfpTokens[0] === detectedAirports[0] && cfpTokens.at(-1) === detectedAirports[1] && atsTokens.length) {
            if (cfpTokens.slice(1, -1).join(' ') !== atsTokens.join(' ')) {
              const text = 'CHECK ROUTE: CFP / ATS TEXT DIFFERENCE';
              drawDutyTimeStyleBadge(coaLibPage, {
                text, x: getRightAlignedBadgeX(coaLibPage, text, boldFont),
                centerY: coaH - 24, font: boldFont, bgColor: [1, 0.8, 0.55]
              });
            }
          }
        }

        if (routeBoundsFound) {
            const routeStart = startMatch.index + startMatch[0].length;
            const routeEnd = endMatch.index;
            let currentWord = { text: "", chars: [] };
            const atsWordsToHighlight = [];

            for (let i = routeStart; i < routeEnd; i++) {
                const char = coaFullTextWithNewlines[i];
                if (char === '/') {
                    if (currentWord.text.length > 0) {
                        atsWordsToHighlight.push(currentWord);
                        currentWord = { text: "", chars: [] };
                    }
                    while (i < routeEnd && coaFullTextWithNewlines[i] !== ' ' && coaFullTextWithNewlines[i] !== '\n') i++;
                    continue;
                }
                if (/[A-Z0-9]/i.test(char)) {
                    currentWord.text += char;
                    currentWord.chars.push(i);
                } else {
                    if (currentWord.text.length > 0) {
                        atsWordsToHighlight.push(currentWord);
                        currentWord = { text: "", chars: [] };
                    }
                }
            }
            if (currentWord.text.length > 0) atsWordsToHighlight.push(currentWord);

            const validAtsWords = atsWordsToHighlight.filter(w => {
                const token = w.text.toUpperCase();
                const isCoordinateWpt = /^\d{2,3}[NS]\d{3}[EW]$/.test(token);
                return token !== "DCT" && !/^\d+$/.test(token) && (routeTokenSet.has(token) || isCoordinateWpt);
            });
            if (validAtsWords.length > 0) highlightedSomething = true;

            for (const wordObj of validAtsWords) {
                const itemMatches = {};
                for (let c of wordObj.chars) {
                    const map = coaCharMapping[c];
                    if (map && map.itemIndex !== -1) {
                        if (!itemMatches[map.itemIndex]) itemMatches[map.itemIndex] = [];
                        itemMatches[map.itemIndex].push(map.charIndex);
                    }
                }

                for (const itemIdxStr of Object.keys(itemMatches)) {
                    const itemIdx = parseInt(itemIdxStr, 10);
                    const charIndices = itemMatches[itemIdx];
                    if (charIndices.length === 0) continue;
                    const minCharIdx = Math.min(...charIndices);
                    const maxCharIdx = Math.max(...charIndices);
                    const matchCharCount = maxCharIdx - minCharIdx + 1;
                    const item = sortedCoaItems[itemIdx];
                    const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';
                    const tx = item.transform;
                    const charW = (item.width || 0) / Math.max(s.length, 1);
                    const underlineX1 = (tx[4] + minCharIdx * charW) * coaSx;
                    const underlineX2 = underlineX1 + Math.max(matchCharCount * charW * coaSx, 4);
                    
                    const metrics = getTextMetrics(item, coaSy, Math.abs(tx[3]) || 10);
                    const underlineY = metrics.textBottomY;
                    
                    coaLibPage.drawLine({
                        start: { x: underlineX1, y: underlineY },
                        end: { x: underlineX2, y: underlineY },
                        color: PDFLib.rgb(1, 0, 0), thickness: 1.5, opacity: 0.5
                    });
                    totalHits++;
                }
            }
        }

        if (!routeBoundsFound && !highlightedSomething && routeTokens.length > 0) {
            let searchStartIndex = 0;
            const coaTokens = [];
            let currentToken = null;

            for (let i = 0; i < coaCharMapping.length; i++) {
                const map = coaCharMapping[i];
                if (!map.isSeparator && /[A-Z0-9]/.test(coaFullTextWithNewlines[i])) {
                    if (!currentToken) currentToken = { text: '', chars: [] };
                    currentToken.text += coaFullTextWithNewlines[i];
                    currentToken.chars.push(i);
                } else {
                    if (currentToken) { coaTokens.push(currentToken); currentToken = null; }
                }
            }
            if (currentToken) coaTokens.push(currentToken);

            for (const rToken of routeTokens) {
                const expectedToken = rToken.toUpperCase();
                let bestMatchIdx = -1;
                for (let i = searchStartIndex; i < coaTokens.length; i++) {
                    const cToken = coaTokens[i].text.toUpperCase();
                    if (cToken === expectedToken) {
                        bestMatchIdx = i;
                        break;
                    }
                }
                if (bestMatchIdx !== -1) {
                    const matchedCToken = coaTokens[bestMatchIdx];
                    const itemMatches = {};
                    for (let c of matchedCToken.chars) {
                        const map = coaCharMapping[c];
                        if (map && map.itemIndex !== -1) {
                            if (!itemMatches[map.itemIndex]) itemMatches[map.itemIndex] = [];
                            itemMatches[map.itemIndex].push(map.charIndex);
                        }
                    }

                    for (const itemIdxStr of Object.keys(itemMatches)) {
                        const itemIdx = parseInt(itemIdxStr, 10);
                        const charIndices = itemMatches[itemIdx];
                        if (charIndices.length === 0) continue;
                        const minCharIdx = Math.min(...charIndices);
                        const maxCharIdx = Math.max(...charIndices);
                        const matchCharCount = maxCharIdx - minCharIdx + 1;
                        const item = sortedCoaItems[itemIdx];
                        const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';
                        const tx = item.transform;
                        const charW = (item.width || 0) / Math.max(s.length, 1);
                        const underlineX1 = (tx[4] + minCharIdx * charW) * coaSx;
                        const underlineX2 = underlineX1 + Math.max(matchCharCount * charW * coaSx, 4);
                        
                        const metrics = getTextMetrics(item, coaSy, Math.abs(tx[3]) || 10);
                        const underlineY = metrics.textBottomY;
                        
                        coaLibPage.drawLine({
                            start: { x: underlineX1, y: underlineY },
                            end: { x: underlineX2, y: underlineY },
                            color: PDFLib.rgb(1, 0, 0), thickness: 2.0, opacity: 0.5
                        });
                        totalHits++;
                    }
                    searchStartIndex = bestMatchIdx + 1;
                }
            }
        }

        if (extractedRoute) {
          const routeDisplay = extractedRoute.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
          let anchorY = null, anchorX = null;
          for (const item of sortedCoaItems) {
            const s = cleanAndDecodeItem(item.str, foundCoaPageOffset).trim();
            if (s && /SUBMITTED\s+AT\b/i.test(s)) {
              anchorY = item.transform[5]; anchorX = item.transform[4];
            }
          }
          if (anchorY === null) {
            for (const item of sortedCoaItems) {
              const s = cleanAndDecodeItem(item.str, foundCoaPageOffset).trim();
              if (s) {
                const y = item.transform[5];
                if (anchorY === null || y < anchorY) { anchorY = y; anchorX = item.transform[4]; }
              }
            }
          }
          if (anchorY !== null) {
            const rSize = BADGE_STYLE.fontSize;
            const rMaxW = coaW * 0.75;
            const rStartY = (anchorY - 14 - rSize * 1.4) * coaSy;
            const words = routeDisplay.split(' ');
            const rLines = [];
            let cur = '';
            for (const w of words) {
              const test = cur ? cur + ' ' + w : w;
              if (boldFont.widthOfTextAtSize(test, rSize) <= rMaxW) cur = test;
              else { if (cur) rLines.push(cur); cur = w; }
            }
            if (cur) rLines.push(cur);
            const lineH = rSize * 1.4;
            for (let li = 0; li < rLines.length; li++) {
              drawDutyTimeStyleBadge(coaLibPage, {
                text: rLines[li],
                x: (anchorX || 36) * coaSx,
                y: rStartY - li * lineH,
                font: boldFont
              });
            }
          }
        }
      }
    }

    // DISC FUEL 정보 오버레이
    if (discFuel && discTime && dispatchReleaseIdx !== -1) {
      const drJsPage = await pdfJsDoc.getPage(dispatchReleaseIdx + 1);
      const drContent = await drJsPage.getTextContent();
      const drOffset = detectPageOffset(drContent.items.map(it => it.str).join(' '));
      const drLibPage = libPages[dispatchReleaseIdx];
      const { width: drW, height: drH } = drLibPage.getSize();
      const drVp = drJsPage.getViewport({ scale: 1.0 });
      const drSx = drW / drVp.width, drSy = drH / drVp.height;
      let notesY = null, notesFS = 10;
      let dispatchItem = null;

      for (const item of drContent.items) {
        const s = cleanAndDecodeItem(item.str, drOffset);
        const su = s.trim().toUpperCase();
        if (/DISPATCH\s*NOTES/i.test(s)) {
          notesY = item.transform[5];
          notesFS = Math.abs(item.transform[3]) || 10;
          break;
        }
        if (su === 'DISPATCH') { dispatchItem = item; continue; }
        if (su === 'NOTES' && dispatchItem && Math.abs(item.transform[5] - dispatchItem.transform[5]) < 5) {
          notesY = item.transform[5];
          notesFS = Math.abs(item.transform[3]) || 10;
          break;
        }
      }

      if (notesY !== null) {
        const notesMidY = notesY + notesFS * SOURCE_TEXT_CENTER_RATIO;
        drawDutyTimeStyleBadge(drLibPage, {
          text: `DISC FUEL INFO  ${discFuel}  ${discTime}`,
          x: getRightAlignedBadgeX(drLibPage, `DISC FUEL INFO  ${discFuel}  ${discTime}`, boldFont),
          centerY: notesMidY * drSy,
          font: boldFont
        });
      }
    }

    if (cfpPageIdx !== undefined) {
      const cfpSectionEnd = Math.min(
        notam1PageIdx !== undefined ? notam1PageIdx : cfpPageIdx + 20,
        numPages
      );
      for (let pi = cfpPageIdx; pi < cfpSectionEnd; pi++) {
        const scanPage = await pdfJsDoc.getPage(pi + 1);
        const scanTc = await scanPage.getTextContent();
        const scanRaw = scanTc.items.map(it => it.str).join(' ');
        const scanOff = detectPageOffset(scanRaw);
        const scanText = scanTc.items.map(it => cleanAndDecodeItem(it.str, scanOff)).join(' ');
        if (/ENROUTE\s+ALTERNATES/i.test(scanText)) {
          const suitRe = /\b([A-Z]{3,4})\s+SUITABLE\s+FROM\s+(\d{4})\s+UTC\s*\/\s*TO\s+(\d{4})\s+UTC/gi;
          let sm;
          while ((sm = suitRe.exec(scanText)) !== null) {
            suitableMap[sm[1].toUpperCase()] = `From ${sm[2]}Z To ${sm[3]}Z`;
          }
          break;
        }
      }
    }

    // Suitable Enroute Alternate 표시
    if (Object.keys(suitableMap).length > 0 && notam1PageIdx !== undefined) {
      const tagRe = /\[\s*(ERA|EDTO|REFILE|\d+\s*%\s*ERA)\s*\]\s*([A-Z]{3,4})\b/gi;
      for (let pi = notam1PageIdx; pi < numPages; pi++) {
        const jsPage = await pdfJsDoc.getPage(pi + 1);
        const tc = await jsPage.getTextContent();
        const rawText = tc.items.map(it => it.str).join(' ');
        const offset = detectPageOffset(rawText);
        const lines = groupTextItemsByLine(tc.items, offset);
        const libPage = libPages[pi];
        const { width: lw, height: lh } = libPage.getSize();
        const vp = jsPage.getViewport({ scale: 1.0 });
        const sy = lh / vp.height;

        for (const line of lines) {
          tagRe.lastIndex = 0;
          let m;
          while ((m = tagRe.exec(line.text)) !== null) {
            const airport = m[2].toUpperCase();
            if (!suitableMap[airport]) continue;
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
            const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;
            const badgeLines = [airport, suitableMap[airport]];
            for (let lineIndex = 0; lineIndex < badgeLines.length; lineIndex++) {
              const badgeText = badgeLines[lineIndex];
              drawDutyTimeStyleBadge(libPage, {
                text: badgeText,
                x: getRightAlignedBadgeX(libPage, badgeText, boldFont),
                centerY: srcMidY + (0.5 - lineIndex) * BADGE_STYLE.fontSize * 1.2,
                font: boldFont
              });
            }
            totalHits++;
          }
        }
      }
    }

    // WEATHER BRIEFING 섹션 내 TAF 공항 시간 배지 표시 (CFP 웨이포인트 시간 매칭 포함)
    if (weatherBriefingIdx !== -1) {
      const depCode = detectedAirports.length >= 1 ? detectedAirports[0].toUpperCase() : null;
      const arrCode = detectedAirports.length >= 2 ? detectedAirports[1].toUpperCase() : null;
      const package2AirportNames = new Map(
        notam2SubAirports
          .filter(item => item.airportName)
          .map(item => [item.code.toUpperCase(), item.airportName])
      );
      const fallbackWeatherAirportNames = {
        CYVR: 'Vancouver',
        PAKN: 'King Salmon',
        RJCC: 'New Chitose',
        PMDY: 'Henderson Field'
      };
      const weatherEndIdx = (pkg1PageIdx !== -1) ? pkg1PageIdx : (pkg3StartIdx !== -1 ? pkg3StartIdx : numPages);

      for (let pi = weatherBriefingIdx; pi < weatherEndIdx; pi++) {
        const jsPage = await pdfJsDoc.getPage(pi + 1);
        const tc = await jsPage.getTextContent();
        const rawText = tc.items.map(it => it.str).join(' ');
        const offset = detectPageOffset(rawText);
        const lines = groupTextItemsByLine(tc.items, offset);
        const libPage = libPages[pi];
        const { width: lw, height: lh } = libPage.getSize();
        const vp = jsPage.getViewport({ scale: 1.0 });
        const sy = lh / vp.height;

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          const lineText = line.text.trim();
          const tafMatch = /^TAF(?:\s+(?:COR|AMD))?\s+([A-Z]{4})\b/i.exec(lineText);
          const directMatch = /^([A-Z]{4})\s+(\d{4})Z\b/i.exec(lineText);
          const airportMatch = (tafMatch ? tafMatch[1] : directMatch ? directMatch[1] : '').toUpperCase();
          if (!airportMatch) continue;

          let timeText = directMatch ? `${airportMatch} ${directMatch[2]}Z` : null;
          if (depCode && airportMatch === depCode && extractedEtd) timeText = extractedEtd;
          else if (arrCode && airportMatch === arrCode && extractedEta) timeText = extractedEta;
          else if (!timeText && wptTimeMap.has(airportMatch)) {
            const wptTime = wptTimeMap.get(airportMatch);
            timeText = `${airportMatch} ${wptTime.replace('.', '')}Z`;
          }
          if (!timeText) timeText = `${airportMatch} TIME N/A`;
          const roles = new Set();
          if (airportMatch === depCode) roles.add('DEP');
          if (airportMatch === arrCode) roles.add('DEST');
          for (const entry of [...notam1SubAirports, ...notam2SubAirports]) {
            if (entry.code === airportMatch) roles.add(entry.tag);
          }
          if (roles.size) timeText = `${[...roles].join('/')} ${timeText}`;

          let airportName = package2AirportNames.get(airportMatch) || fallbackWeatherAirportNames[airportMatch] || '';
          if (airportName) {
            airportName = airportName.replace(/\s+(?:Airport|Intl|International)$/i, '').trim();
          }
          for (let ni = li + 1; ni < Math.min(lines.length, li + 3); ni++) {
            if (airportName) break;
            const candidate = lines[ni].text.trim();
            if (!candidate || /^(?:TAF|METAR|SPECI|BECMG|TEMPO|FM\d|RMK)\b/i.test(candidate)) continue;
            if (/^\(?[A-Z]{4}\)?\s+\d{4}Z\b/i.test(candidate) || /\d/.test(candidate)) continue;
            if (/^[A-Z][A-Z .'-]{2,40}$/i.test(candidate)) {
              airportName = candidate.replace(/\s+/g, ' ').trim();
              break;
            }
          }

          const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
          const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;
          const badgeX = getRightAlignedBadgeX(libPage, timeText, boldFont);
          drawDutyTimeStyleBadge(libPage, {
            text: timeText,
            x: badgeX,
            centerY: srcMidY,
            font: boldFont
          });
          if (airportName) {
            const nameCenterY = srcMidY - BADGE_STYLE.fontSize * sy * 1.2;
            const nameX = getRightAlignedBadgeX(libPage, airportName, boldFont);
            drawDutyTimeStyleBadge(libPage, {
              text: airportName,
              x: nameX,
              centerY: nameCenterY,
              font: boldFont
            });
          }
          totalHits++;
        }
      }
    }

    // DEP/DEST 시간 표시
    const tagTimeMap = {};
    if (extractedEtd) tagTimeMap['DEP'] = extractedEtd;
    if (extractedEta) tagTimeMap['DEST'] = extractedEta;

    if (Object.keys(tagTimeMap).length > 0 && notam1SubAirports.length > 0) {
      const pageScaleCache = {};
      for (const subAirport of notam1SubAirports) {
        const timeText = tagTimeMap[subAirport.tag];
        if (!timeText || subAirport.maxX === undefined) continue;
        const pi = subAirport.pageIdx;
        if (!pageScaleCache[pi]) {
          const jsP = await pdfJsDoc.getPage(pi + 1);
          const vp = jsP.getViewport({ scale: 1.0 });
          const lp = libPages[pi];
          const { width: lw, height: lh } = lp.getSize();
          pageScaleCache[pi] = { sy: lh / vp.height };
        }
        const { sy } = pageScaleCache[pi];
        const depAnnotSize = BADGE_STYLE.fontSize;
        const depSrcFS = subAirport.fontSize || 10;
        const depSrcMidY = subAirport.y * sy + depSrcFS * sy * SOURCE_TEXT_CENTER_RATIO;

        drawDutyTimeStyleBadge(libPages[pi], {
          text: timeText,
          x: getRightAlignedBadgeX(libPages[pi], timeText, boldFont),
          centerY: depSrcMidY,
          font: boldFont
        });
      }
    }

    // FIR 시간 배지 표시 (NOTAM 3)
    if (notam3SubAirports.length > 0 && etdZulu && Object.keys(firEetMap).length > 0) {
      const addEetToEtd = (etdStr, eetStr) => {
        const etdH = parseInt(etdStr.substring(0, 2), 10);
        const etdM = parseInt(etdStr.substring(2, 4), 10);
        const eetH = parseInt(eetStr.substring(0, 2), 10);
        const eetM = parseInt(eetStr.substring(2, 4), 10);
        let resM = etdM + eetM;
        let resH = etdH + eetH + Math.floor(resM / 60);
        resM %= 60;
        resH %= 24;
        return `${resH.toString().padStart(2, '0')}:${resM.toString().padStart(2, '0')}Z`;
      };

      const firScaleCache = {};
      for (const sub of notam3SubAirports) {
        if (sub.tag === 'FIR' && sub.maxX !== undefined) {
          const eet = firEetMap[sub.code];
          if (eet) {
            const timeValue = addEetToEtd(etdZulu, eet);
            const timeBadgeLines = ['FIR ENTRY', timeValue];
            const pi = sub.pageIdx;
            if (!firScaleCache[pi]) {
              const jsP = await pdfJsDoc.getPage(pi + 1);
              const vp = jsP.getViewport({ scale: 1.0 });
              const lp = libPages[pi];
              const { width: lw, height: lh } = lp.getSize();
              firScaleCache[pi] = { sx: lw / vp.width, sy: lh / vp.height, lw };
            }
            const { sx, sy, lw } = firScaleCache[pi];
            const srcFS = sub.fontSize || 10;
            const srcMidY = sub.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;

            for (let lineIndex = 0; lineIndex < timeBadgeLines.length; lineIndex++) {
              const lineText = timeBadgeLines[lineIndex];
              drawDutyTimeStyleBadge(libPages[pi], {
                text: lineText,
                x: getRightAlignedBadgeX(libPages[pi], lineText, boldFont),
                centerY: srcMidY + (0.5 - lineIndex) * BADGE_STYLE.fontSize * 1.2,
                font: boldFont
              });
            }
            totalHits++;
          }
        }
      }
    }


    // =========================================================================
    // FROM [WPT1] TO [WPT2] 구문 탐색 및 주석(Badge) 추가
    // =========================================================================
    const expectedRegex = /FROM\s+([A-Z0-9]{2,10})\s+TO\s+([A-Z0-9]{2,10})/gi;
    const expectedStartIdx = dispatchReleaseIdx !== -1 ? dispatchReleaseIdx : 0;
    const expectedEndIdx = dispatchReleaseIdx !== -1 ? dispatchEndIdx : numPages;
    
    for (let pi = expectedStartIdx; pi < expectedEndIdx; pi++) {
      const jsPage = await pdfJsDoc.getPage(pi + 1);
      const tc = await jsPage.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const lines = groupTextItemsByLine(tc.items, offset);
      const libPage = libPages[pi];
      const { width: lw, height: lh } = libPage.getSize();
      const vp = jsPage.getViewport({ scale: 1.0 });
      const sx = lw / vp.width;
      const sy = lh / vp.height;
      const expectedBadges = [];
    
      for (const line of lines) {
        let match;
        expectedRegex.lastIndex = 0;
        while ((match = expectedRegex.exec(line.text)) !== null) {
          const fromWpt = match[1].toUpperCase();
          const toWpt = match[2].toUpperCase();
    
          let fromTime = '';
          if (detectedAirports?.[0] && fromWpt === detectedAirports[0].toUpperCase()) {
            fromTime = '00.00';
          } else {
            fromTime = wptTimeMap.get(fromWpt) || '';
          }
          let toTime = wptTimeMap.get(toWpt) || '';
          if (!toTime && detectedAirports?.[1] && toWpt === detectedAirports[1].toUpperCase()) {
            toTime = tripElapsedTime || '';
          }
          console.log('[EXPECTED SEGMENT]', {
            fromWpt, fromTime, toWpt, toTime,
            fromFound: wptTimeMap.has(fromWpt),
            toFound: wptTimeMap.has(toWpt)
          });
          if (!fromTime || !toTime) {
            console.warn('[EXPECTED SEGMENT] time not found:',
              `${fromWpt}=${fromTime || 'NOT FOUND'}`,
              `${toWpt}=${toTime || 'NOT FOUND'}`);
            continue;
          }
          const estimatedStart = estimatedWpts.has(fromWpt);
          const badgeText = `${estimatedStart ? '~' : ''}${fromTime} ~ ${toTime}`;
          const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
          const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;
          const badgeSize = BADGE_STYLE.fontSize;
          const textWidth = boldFont.widthOfTextAtSize(badgeText, badgeSize);
          expectedBadges.push({ text: badgeText, centerY: srcMidY, size: badgeSize, textWidth });
        }
      }

      if (expectedBadges.length > 0) {
        for (const badge of expectedBadges) {
          drawDutyTimeStyleBadge(libPage, {
            text: badge.text,
            x: getRightAlignedBadgeX(libPage, badge.text, boldFont, badge.size),
            centerY: badge.centerY,
            font: boldFont
          });
          totalHits++;
        }
      }
    }

    outBytes=await pdfLibDoc.save();
    done=true;
    runBtn.className='action-btn dl-btn active';
    runBtn.innerHTML='DOWNLOAD PDF FILE';

    setStatus('done',`Completed! ${numPages} pages, ${totalHits} elements highlighted, ${Object.keys(bmPages).length} bookmarks set.`);
    document.getElementById('previewCard').style.display='block';

    dlPDF();

  } catch(err) {
    setStatus('error','Execution error: '+err.message);
    runBtn.className='action-btn run-btn active';
    runBtn.innerHTML='RUN ENGINE';
  }
}
