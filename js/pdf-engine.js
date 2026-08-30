// ====================================================
// 0. 기본 유틸리티 및 전역 상수 설정
// ====================================================
const SOURCE_TEXT_CENTER_RATIO = 0.35;

// 문자열 세척 및 인코딩 복원 함수
function cleanAndDecodeItem(str, offset = 0) {
  if (!str) return '';
  if (offset === 0) return str;
  let decoded = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    decoded += String.fromCharCode(code + offset);
  }
  return decoded;
}

// 오프셋 감지 함수
function detectPageOffset(rawText) {
  if (!rawText) return 0;
  if (rawText.includes('CFP') || rawText.includes('PLAN') || rawText.includes('NOTAM')) return 0;
  return 0; // 필요 시 특정 문서 인코딩 오프셋 보정 로직 구현
}

// 키워드 매칭 검사 함수
function checkKeywordMatch(text, kw) {
  if (!text || !kw) return false;
  const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escapedKw}\\b`, 'i');
  return re.test(text);
}

// 텍스트 라인 그룹화 함수
function groupTextItemsByLine(items, offset = 0) {
  const sorted = items.slice().sort((a, b) => b.transform[5] - a.transform[5]);
  const lines = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const decoded = cleanAndDecodeItem(item.str, offset);
    let joined = false;
    for (const line of lines) {
      if (Math.abs(line.y - y) < 4.0) {
        line.parts.push({ item, text: decoded });
        joined = true;
        break;
      }
    }
    if (!joined) {
      lines.push({ y, parts: [{ item, text: decoded }] });
    }
  }
  for (const line of lines) {
    line.parts.sort((a, b) => a.item.transform[4] - b.item.transform[4]);
    line.text = line.parts.map(p => p.text).join(' ');
  }
  return lines;
}

// ====================================================
// 1. 공항 및 메타데이터 추출 헬퍼 함수
// ====================================================
async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = [];
  try {
    const page1 = await pdfJsDoc.getPage(1);
    const tc = await page1.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const text = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');

    const routeMatch = text.match(/\b([A-Z]{4})\s+TO\s+([A-Z]{4})\b/i);
    if (routeMatch) return [routeMatch[1].toUpperCase(), routeMatch[2].toUpperCase()];

    const pairMatch = text.match(/\b([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i);
    if (pairMatch) return [pairMatch[1].toUpperCase(), pairMatch[2].toUpperCase()];

    const depMatch = text.match(/\bDEP[:\s]+([A-Z]{4})\b/i);
    const destMatch = text.match(/\b(?:DEST|ARR)[:\s]+([A-Z]{4})\b/i);
    if (depMatch && destMatch) return [depMatch[1].toUpperCase(), destMatch[1].toUpperCase()];
  } catch (e) {
    console.warn("extractReleaseAirportsByRule2 warning:", e);
  }
  return airports;
}

async function extractMetadata(pdfJsDoc) {
  try {
    const page1 = await pdfJsDoc.getPage(1);
    const tc = await page1.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const text = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');

    const regMatch = text.match(/\b(HL\d{4}|N\d{3,5}[A-Z]?)\b/i);
    if (regMatch) window.extractedAcReg = regMatch[1].toUpperCase();
  } catch (e) {
    console.warn("extractMetadata warning:", e);
  }
}

// ====================================================
// 2. NOTAM 태그 공항 추출 함수
// ====================================================
async function extractFirstTagAirports(pdfJsDoc, startIdx, endIdx, tags) {
  const results = [];
  const tagSet = new Set(tags.map(t => t.toUpperCase()));
  const tagPattern = new RegExp(`\\[\\s*(${tags.join('|')})\\s*\\]\\s*([A-Z]{3,4})`, 'i');

  for (let pi = startIdx; pi < endIdx; pi++) {
    const page = await pdfJsDoc.getPage(pi + 1);
    const tc = await page.getTextContent();
    const offset = detectPageOffset(tc.items.map(it => it.str).join(' '));
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      const match = line.text.match(tagPattern);
      if (match) {
        const tag = match[1].toUpperCase();
        const code = match[2].toUpperCase();
        if (tagSet.has(tag)) {
          const maxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
          const fontSize = Math.abs(line.parts[0].item.transform[3]) || 10;
          results.push({ tag, code, pageIdx: pi, y: line.y, maxX, fontSize });
          tagSet.delete(tag);
        }
      }
    }
  }
  return results;
}

async function extractAllTaggedAirports(pdfJsDoc, startIdx, endIdx, tagRegexStr) {
  const results = [];
  const tagPattern = new RegExp(`\\[\\s*(${tagRegexStr})\\s*\\]\\s*([A-Z]{3,4})`, 'gi');

  for (let pi = startIdx; pi < endIdx; pi++) {
    const page = await pdfJsDoc.getPage(pi + 1);
    const tc = await page.getTextContent();
    const offset = detectPageOffset(tc.items.map(it => it.str).join(' '));
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      let match;
      tagPattern.lastIndex = 0;
      while ((match = tagPattern.exec(line.text)) !== null) {
        const tag = match[1].toUpperCase();
        const code = match[2].toUpperCase();
        const maxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
        const fontSize = Math.abs(line.parts[0].item.transform[3]) || 10;
        results.push({ tag, code, pageIdx: pi, y: line.y, maxX, fontSize, title: `[${tag}] ${code}` });
      }
    }
  }
  return results;
}

// ====================================================
// 3. 하이라이트 및 오버레이 배지 드로잉 함수
// ====================================================
function drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset, colorObj, opacityVal, stdFont) {
  const s = cleanAndDecodeItem(item.str, pageOffset);
  if (!s) return;
  const tx = item.transform;
  const itemX = tx[4], itemY = tx[5];
  const itemW = item.width || 0;
  const itemH = Math.abs(tx[3]) || 10;

  const charW = itemW / Math.max(s.length, 1);
  const matchCharCount = maxCharIdx - minCharIdx + 1;

  const rx = (itemX + minCharIdx * charW) * sx;
  const ry = itemY * sy;
  const rw = matchCharCount * charW * sx;
  const rh = itemH * sy;

  libPage.drawRectangle({
    x: rx - 1,
    y: ry - (rh * 0.2),
    width: Math.max(rw + 2, 4),
    height: Math.max(rh * 1.2, 8),
    color: colorObj,
    opacity: opacityVal
  });
}

function drawDutyTimeStyleBadge(libPage, opts) {
  const { text, x, centerY, font, fontSize, bgColor, bgOpacity } = opts;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const paddingX = 4;
  const badgeHeight = fontSize * 1.3;

  // 배경 사각형 드로잉
  libPage.drawRectangle({
    x: x - paddingX,
    y: centerY - (badgeHeight / 2),
    width: textWidth + (paddingX * 2),
    height: badgeHeight,
    color: PDFLib.rgb(bgColor[0], bgColor[1], bgColor[2]),
    opacity: bgOpacity
  });

  // 텍스트 드로잉
  libPage.drawText(text, {
    x: x,
    y: centerY - (fontSize * 0.35),
    size: fontSize,
    font: font,
    color: PDFLib.rgb(0, 0, 0)
  });
}

// ====================================================
// 4. 웨이포인트 산출 시간 맵 생성 함수
// ====================================================
function buildWptTimeMap(cfpText) {
  const map = new Map();
  const lineRegex = /\b([A-Z0-9]{3,10})\s+\d{3,4}\s+(\d{2}\.\d{2})\b/g;
  let m;
  while ((m = lineRegex.exec(cfpText)) !== null) {
    map.set(m[1].toUpperCase(), m[2]);
  }
  return map;
}

// ====================================================
// 5. 메인 runHL 실행 함수
// ====================================================
async function runHL() {
  console.log("Starting runHL processing...");
  
  if (!window.currentPdfBytes) {
    alert("PDF 파일을 먼저 선택하거나 업로드하세요.");
    return;
  }

  try {
    // PDF.js 및 pdf-lib 로딩
    const loadingTask = pdfjsLib.getDocument({ data: window.currentPdfBytes });
    const pdfJsDoc = await loadingTask.promise;
    const pdfLibDoc = await PDFLib.PDFDocument.load(window.currentPdfBytes);
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    // 메타데이터 및 공항 데이터 추출
    await extractMetadata(pdfJsDoc);
    const releaseAirports = await extractReleaseAirportsByRule2(pdfJsDoc);
    console.log("Release Airports Extracted:", releaseAirports);

    const numPages = pdfJsDoc.numPages;
    let notamStartIdx = -1, notamEndIdx = numPages;
    let cfpTextFull = "";

    // 1차 스캔: 구역 구분 및 CFP 텍스트 수집
    for (let i = 0; i < numPages; i++) {
      const page = await pdfJsDoc.getPage(i + 1);
      const tc = await page.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      
      if (rawText.includes("NOTAM")) {
        if (notamStartIdx === -1) notamStartIdx = i;
      }
      cfpTextFull += rawText + "\n";
    }

    if (notamStartIdx === -1) notamStartIdx = 0;

    // NOTAM 공항 태그 정보 추출 및 오버레이 배지 드로잉
    const depDestTags = await extractFirstTagAirports(pdfJsDoc, notamStartIdx, notamEndIdx, ['DEP', 'DEST']);
    const altnEtopsTags = await extractAllTaggedAirports(pdfJsDoc, notamStartIdx, notamEndIdx, 'ALTN|ERA|ETOPS|EDTO');
    const allNotamBadges = [...depDestTags, ...altnEtopsTags];

    const wptTimeMap = buildWptTimeMap(cfpTextFull);

    // 2차 스캔 및 하이라이트 작업 수행
    for (let i = 0; i < numPages; i++) {
      const pageJs = await pdfJsDoc.getPage(i + 1);
      const tc = await pageJs.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      const pageOffset = detectPageOffset(rawText);
      
      const libPage = pdfLibDoc.getPage(i);
      const { width: libW, height: libH } = libPage.getSize();
      const vp = pageJs.getViewport({ scale: 1.0 });
      const sx = libW / vp.width;
      const sy = libH / vp.height;

      // 텍스트 아이템 하이라이트 순회
      for (const item of tc.items) {
        const text = cleanAndDecodeItem(item.str, pageOffset);
        if (!text.trim()) continue;

        // 예시 키워드 하이라이트 (필요 시 키워드 추가)
        const keywords = ['CAUTION', 'WARNING', 'CLOSED', 'ALTN'];
        for (const kw of keywords) {
          if (checkKeywordMatch(text, kw)) {
            const minIdx = text.toUpperCase().indexOf(kw);
            const maxIdx = minIdx + kw.length - 1;
            drawCharRangeHighlight(
              libPage, 
              item, 
              minIdx, 
              maxIdx, 
              sx, 
              sy, 
              pageOffset, 
              PDFLib.rgb(1, 0.9, 0), // 노란색 하이라이트
              0.4, 
              stdFont
            );
          }
        }
      }

      // 페이지별 NOTAM 배지 드로잉
      const pageBadges = allNotamBadges.filter(b => b.pageIdx === i);
      for (const badge of pageBadges) {
        drawDutyTimeStyleBadge(libPage, {
          text: badge.title || `[${badge.tag}] ${badge.code}`,
          x: (badge.maxX + 10) * sx,
          centerY: badge.y * sy,
          font: stdFont,
          fontSize: badge.fontSize || 9,
          bgColor: [0.9, 0.9, 0.2],
          bgOpacity: 0.85
        });
      }
    }

    // PDF 저장 및 다운로드 처리
    const pdfBytesModified = await pdfLibDoc.save();
    const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // UI 업데이트 또는 자동 다운로드 처리
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = 'highlighted_document.pdf';
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);

    console.log("Processing complete. File saved.");
  } catch (error) {
    console.error("Error during runHL execution:", error);
    alert("처리 중 오류가 발생했습니다: " + error.message);
  }
}
