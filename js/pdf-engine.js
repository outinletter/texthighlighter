// ==========================================
// 1. 전역 변수 및 초기화
// ==========================================
let pdfBytes = null;
let libsReady = true; // 라이브러리 준비 완료 플래그[cite: 1]
let sel = new Set();
let activeHlColorRGB = [1, 1, 0]; // 기본 하이라이트 색상 (Yellow)[cite: 1]
let done = false;
let outBytes = null;
let detectedAirports = [];
let iataAirports = [];
let extractedAcReg = '';
const SOURCE_TEXT_CENTER_RATIO = 0.35;

// PDF.js Worker 경로 설정 (CDN)[cite: 1]
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// UI 상태 업데이트 헬퍼 함수
function setStatus(type, message) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  const statusEl = document.getElementById('statusMsg') || document.getElementById('status');
  if (statusEl) statusEl.textContent = message;
}

// 결과 PDF 다운로드 함수[cite: 1]
function dlPDF() {
  if (!outBytes) return;
  const blob = new Blob([outBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'processed_result.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// 2. 파일 및 버튼 이벤트 바인딩
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 파일 업로드 이벤트 바인딩
  const fileInput = document.getElementById('fileInput') || document.getElementById('pdfFile');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        setStatus('processing', 'PDF 파일을 읽는 중입니다...');
        const buffer = await file.arrayBuffer();
        pdfBytes = new Uint8Array(buffer);
        setStatus('done', `파일 첨부 완료: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        setStatus('error', '파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    });
  }

  // Run Engine 버튼 이벤트 바인딩
  const runBtn = document.getElementById('runBtn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (done && outBytes) {
        dlPDF();
      } else {
        runHL();
      }
    });
  }
});

// 전역 변수(pdfBytes)가 올바르게 로드되었는지 확인하는 함수[cite: 1]
function canRun() {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    alert('PDF 파일을 먼저 선택하거나 업로드하세요.');[cite: 1]
    return false;[cite: 1]
  }
  return true;[cite: 1]
}

// ==========================================
// 3. 텍스트 디코딩 및 Parsing Helper 함수들
// ==========================================
function detectPageOffset(text) {
  return 0;
}

function cleanAndDecodeItem(str, offset = 0) {
  if (!str) return '';
  return str;
}

function checkKeywordMatch(text, kw) {
  if (!text || !kw) return false;
  const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(text);
}

function groupTextItemsByLine(items, pageOffset = 0) {
  const sorted = items
    .filter(it => {
      const s = cleanAndDecodeItem(it.str, pageOffset);
      return s && s.trim();
    })
    .sort((a, b) => {
      const ay = a.transform[5], by = b.transform[5];
      if (Math.abs(ay - by) > 4) return by - ay;
      return a.transform[4] - b.transform[4];
    });

  const lines = [];
  for (const item of sorted) {
    const y = item.transform[5];
    let joined = false;
    for (const line of lines) {
      if (Math.abs(line.y - y) < 4.0) {
        line.parts.push({ item, text: cleanAndDecodeItem(item.str, pageOffset) });
        joined = true;
        break;
      }
    }
    if (!joined) {
      lines.push({ y, parts: [{ item, text: cleanAndDecodeItem(item.str, pageOffset) }] });
    }
  }

  return lines.map(line => ({
    y: line.y,
    parts: line.parts,
    text: line.parts.map(p => p.text).join(' ')
  }));
}

function drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset, color, opacity, font) {
  const s = cleanAndDecodeItem(item.str, pageOffset) || '';
  const tx = item.transform;
  const itemX = tx[4], itemY = tx[5];
  const itemW = item.width || 0;
  const itemH = Math.abs(tx[3]) || 10;
  const charCount = Math.max(s.length, 1);

  let rx, rw;
  try {
    const fullW = font.widthOfTextAtSize(s, itemH);
    if (fullW > 0) {
      const prefixW = font.widthOfTextAtSize(s.substring(0, minCharIdx), itemH);
      const matchW = font.widthOfTextAtSize(s.substring(minCharIdx, maxCharIdx + 1), itemH);
      rx = (itemX + (prefixW / fullW) * itemW) * sx;
      rw = (matchW / fullW) * itemW * sx;
    } else {
      throw new Error("Zero width");
    }
  } catch (e) {
    const charW = itemW / charCount;
    rx = (itemX + minCharIdx * charW) * sx;
    rw = (maxCharIdx - minCharIdx + 1) * charW * sx;
  }

  const ry = itemY * sy;
  const rh = itemH * sy;

  libPage.drawRectangle({
    x: rx - 1,
    y: ry - (rh * 0.15),
    width: Math.max(rw + 2, 4),
    height: Math.max(rh * 1.15, 8),
    color: color,
    opacity: opacity
  });
}

function drawDutyTimeStyleBadge(page, opt) {
  const { text, x, centerY, font, fontSize, bgColor, bgOpacity } = opt;
  let textWidth = fontSize * text.length * 0.6;
  try {
    textWidth = font.widthOfTextAtSize(text, fontSize);
  } catch (e) {}

  const paddingX = 4;
  const height = fontSize * 1.3;
  const y = centerY - (height / 2);

  page.drawRectangle({
    x: x - paddingX,
    y: y,
    width: textWidth + (paddingX * 2),
    height: height,
    color: PDFLib.rgb(bgColor[0], bgColor[1], bgColor[2]),
    opacity: bgOpacity
  });

  page.drawText(text, {
    x: x,
    y: y + (height * 0.2),
    size: fontSize,
    font: font,
    color: PDFLib.rgb(0, 0, 0)
  });
}

function buildWptTimeMap(text) {
  const map = new Map();
  const regex = /\b([A-Z0-9]{3,10})\s+(\d{2}\.\d{2})\b/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    map.set(m[1].toUpperCase(), m[2]);
  }
  return map;
}

async function extractMetadata(pdfJsDoc) {}

async function extractFirstTagAirports(pdfJsDoc, startIdx, endIdx, tags) {
  const list = [];
  for (let pi = startIdx; pi < endIdx; pi++) {
    const page = await pdfJsDoc.getPage(pi + 1);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');
    const offset = detectPageOffset(raw);
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      for (const tag of tags) {
        const re = new RegExp(`\\[\\s*${tag}\\s*\\]\\s*([A-Z]{3,4})`, 'i');
        const m = line.text.match(re);
        if (m) {
          const maxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
          list.push({ tag, code: m[1].toUpperCase(), pageIdx: pi, y: line.y, maxX, fontSize: Math.abs(line.parts[0].item.transform[3]) || 10 });
        }
      }
    }
  }
  return list;
}

async function extractAllTaggedAirports(pdfJsDoc, startIdx, endIdx, tagPattern) {
  const list = [];
  for (let pi = startIdx; pi < endIdx; pi++) {
    const page = await pdfJsDoc.getPage(pi + 1);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');
    const offset = detectPageOffset(raw);
    const lines = groupTextItemsByLine(tc.items, offset);

    for (const line of lines) {
      const re = new RegExp(`\\[\\s*(${tagPattern})\\s*\\]\\s*([A-Z]{3,4})`, 'gi');
      let m;
      while ((m = re.exec(line.text)) !== null) {
        list.push({ tag: m[1].toUpperCase(), code: m[2].toUpperCase(), pageIdx: pi, y: line.y });
      }
    }
  }
  return list;
}

// 디스패치 문서 및 CFP에서 공항 코드를 추출하는 헬퍼 함수[cite: 1]
async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = [];[cite: 1]
  try {
    const page1 = await pdfJsDoc.getPage(1);[cite: 1]
    const tc = await page1.getTextContent();[cite: 1]
    const rawText = tc.items.map(it => it.str).join(' ');[cite: 1]
    const offset = (typeof detectPageOffset === 'function') ? detectPageOffset(rawText) : 0;[cite: 1]
    
    let text = tc.items.map(it => {
      return (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, offset) : it.str;[cite: 1]
    }).join(' ');[cite: 1]

    const routeMatch = text.match(/\b([A-Z]{4})\s+TO\s+([A-Z]{4})\b/i);[cite: 1]
    if (routeMatch) {
      airports.push(routeMatch[1].toUpperCase(), routeMatch[2].toUpperCase());[cite: 1]
      return airports;[cite: 1]
    }

    const pairMatch = text.match(/\b([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i);[cite: 1]
    if (pairMatch) {
      airports.push(pairMatch[1].toUpperCase(), pairMatch[2].toUpperCase());[cite: 1]
      return airports;[cite: 1]
    }

    const depMatch = text.match(/\bDEP[:\s]+([A-Z]{4})\b/i);[cite: 1]
    const destMatch = text.match(/\b(?:DEST|ARR)[:\s]+([A-Z]{4})\b/i);[cite: 1]
    if (depMatch && destMatch) {
      airports.push(depMatch[1].toUpperCase(), destMatch[1].toUpperCase());[cite: 1]
      return airports;[cite: 1]
    }
  } catch (e) {
    console.warn("extractReleaseAirportsByRule2 processing warning:", e);[cite: 1]
  }
  return airports;[cite: 1]
}

// ==========================================
// 4. 메인 분석 Engine 함수
// ==========================================
async function runHL(){
  if(!canRun()) return;[cite: 1]
  if(typeof PDFLib === 'undefined' || typeof pdfjsLib === 'undefined') {
    setStatus('error', 'PDF 라이브러리가 로드되지 않았습니다.');
    return;
  }

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',[cite: 1]
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS',[cite: 1]
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'U/S', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF'];[cite: 1]

  const runBtn = document.getElementById('runBtn');[cite: 1]
  if (runBtn) {
    runBtn.className = 'action-btn run-btn';[cite: 1]
    runBtn.innerHTML = 'Processing locally...';[cite: 1]
  }
  setStatus('processing', 'Restoring text encoding & analyzing highlights...');[cite: 1]

  done = false; outBytes = null; detectedAirports = []; iataAirports = [];[cite: 1]
  const previewCard = document.getElementById('previewCard');
  if (previewCard) previewCard.style.display = 'none';[cite: 1]

  await new Promise(r => setTimeout(r, 50));[cite: 1]

  try {
    let pdfJsDoc;[cite: 1]
    try {
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;[cite: 1]
    } catch(err) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';[cite: 1]
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;[cite: 1]
    }

    detectedAirports = await extractReleaseAirportsByRule2(pdfJsDoc);[cite: 1]
    await extractMetadata(pdfJsDoc);[cite: 1]

    const extraKws = [];[cite: 1]
    if (sel.size > 0 && typeof extractedAcReg !== 'undefined' && extractedAcReg) extraKws.push(extractedAcReg);[cite: 1]
    const keywords = [...sel, ...extraKws].sort((a,b) => b.length - a.length);[cite: 1]
    const hlRGB = activeHlColorRGB;[cite: 1]

    const numPages = pdfJsDoc.numPages;[cite: 1]
    const pdfLibDoc = await PDFLib.PDFDocument.load(pdfBytes, {ignoreEncryption: true});[cite: 1]
    const libPages = pdfLibDoc.getPages();[cite: 1]
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);[cite: 1]
    const boldFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);[cite: 1]

    const BOOKMARK_PATTERNS = [[cite: 1]
      {label:'CFP PLAN', pattern:/CFP\s+PLAN/i},[cite: 1]
      {label:'COPY OF ATS', pattern:/COPY\s+OF\s+ATS\s+FPL/i},[cite: 1]
      {label:'DISPATCH RELEASE INFORMATION', pattern:/DISPATCH\s+RELEASE\s+INFORMATION|DISPATCH\s+RELEASE\s+INFO/i},[cite: 1]
      {label:'EQUAL TIME POINT DATA', pattern:/EQUAL\s+TIME\s+POINT\s+DATA/i},[cite: 1]
      {label:'WEATHER BRIEFING', pattern:/WEATHER\s+BRIEFING/i},[cite: 1]
      {label:'NOTAM 1', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*1)\b|(\[\s*NOTAM\s*1\s*\])/i},[cite: 1]
      {label:'NOTAM 2', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*2)\b|(\[\s*NOTAM\s*2\s*\])/i},[cite: 1]
      {label:'NOTAM 3', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*3)\b|(\[\s*NOTAM\s*3\s*\])/i},[cite: 1]
    ];

    const bmPages = {};[cite: 1]
    let edtoBookmarkY = null;[cite: 1]
    let coaAnnotIdx = -1;[cite: 1]

    for(let pi = 0; pi < numPages; pi++){[cite: 1]
      const jsPage2 = await pdfJsDoc.getPage(pi + 1);[cite: 1]
      const tc = await jsPage2.getTextContent();[cite: 1]
      const rawText = tc.items.map(it => it.str).join(' ');[cite: 1]
      const offset = detectPageOffset(rawText);[cite: 1]
      const pageText = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');[cite: 1]

      for(const bm of BOOKMARK_PATTERNS){[cite: 1]
        if(bmPages[bm.label] !== undefined) {[cite: 1]
            if (bm.label === 'COPY OF ATS' && coaAnnotIdx === -1) {[cite: 1]
                if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;[cite: 1]
            }
            continue;[cite: 1]
        }
        if(bm.pattern.test(pageText)){[cite: 1]
          bmPages[bm.label] = pi;[cite: 1]
          if (bm.label === 'EQUAL TIME POINT DATA') {[cite: 1]
            const matchItem = tc.items.find(it => /EQUAL/i.test(cleanAndDecodeItem(it.str, offset)));[cite: 1]
            if (matchItem) edtoBookmarkY = matchItem.transform[5];[cite: 1]
          }
          if (bm.label === 'COPY OF ATS') {[cite: 1]
            if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;[cite: 1]
          }
        }
      }
    }

    const pkg3StartIdx = bmPages['NOTAM 3'] !== undefined ? bmPages['NOTAM 3'] : -1;[cite: 1]
    const dispatchReleaseIdx = bmPages['DISPATCH RELEASE INFORMATION'] !== undefined ? bmPages['DISPATCH RELEASE INFORMATION'] : -1;[cite: 1]
    const weatherBriefingIdx = bmPages['WEATHER BRIEFING'] !== undefined ? bmPages['WEATHER BRIEFING'] : -1;[cite: 1]
    const pkg1PageIdx = bmPages['NOTAM 1'] !== undefined ? bmPages['NOTAM 1'] : -1;[cite: 1]

    let dispatchEndIdx = numPages;[cite: 1]
    if (weatherBriefingIdx !== -1) dispatchEndIdx = weatherBriefingIdx;[cite: 1]
    else if (pkg1PageIdx !== -1) dispatchEndIdx = pkg1PageIdx;[cite: 1]
    else if (pkg3StartIdx !== -1) dispatchEndIdx = pkg3StartIdx;[cite: 1]

    const notam1PageIdx = bmPages['NOTAM 1'];[cite: 1]
    const notam2PageIdx = bmPages['NOTAM 2'];[cite: 1]
    const notam3PageIdx = bmPages['NOTAM 3'];[cite: 1]

    let notam1SubAirports = [];[cite: 1]
    let notam2SubAirports = [];[cite: 1]
    let notam3SubAirports = [];[cite: 1]

    if (notam1PageIdx !== undefined) {[cite: 1]
      const notam1EndIdx = notam2PageIdx !== undefined ? notam2PageIdx : (notam3PageIdx !== undefined ? notam3PageIdx : numPages);[cite: 1]
      notam1SubAirports = await extractFirstTagAirports(pdfJsDoc, notam1PageIdx, notam1EndIdx, ['DEP', 'DEST', 'ALTN']);[cite: 1]
    }
    if (notam2PageIdx !== undefined) {[cite: 1]
      const notam2EndIdx = notam3PageIdx !== undefined ? notam3PageIdx : numPages;[cite: 1]
      notam2SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam2PageIdx, notam2EndIdx, '(?:\\d+\\s*%\\s*)?ERA|EDTO|REFILE');[cite: 1]
    }
    if (notam3PageIdx !== undefined) {[cite: 1]
      const notam3EndIdx = numPages;[cite: 1]
      notam3SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam3PageIdx, notam3EndIdx, 'FIR');[cite: 1]
    }

    const edtoPointDataPageIdx = bmPages['EQUAL TIME POINT DATA'] !== undefined ? bmPages['EQUAL TIME POINT DATA'] : -1;[cite: 1]

    let totalHits = 0;[cite: 1]

    // 키워드 하이라이트 검색 영역
    for(let pi = 0; pi < numPages; pi++){[cite: 1]
      const jsPage = await pdfJsDoc.getPage(pi + 1);[cite: 1]
      const vp = jsPage.getViewport({scale: 1.0});[cite: 1]
      const libPage = libPages[pi];[cite: 1]
      const {width: lw, height: lh} = libPage.getSize();[cite: 1]
      const sx = lw / vp.width;[cite: 1]
      const sy = lh / vp.height;[cite: 1]

      const content = await jsPage.getTextContent();[cite: 1]
      const rawPageText = content.items.map(it => it.str).join(' ');[cite: 1]
      const pageOffset = detectPageOffset(rawPageText);[cite: 1]

      const isDispatchPage = (dispatchReleaseIdx !== -1 && pi >= dispatchReleaseIdx && pi < dispatchEndIdx);[cite: 1]
      const isNotamPage = (pkg1PageIdx !== -1 && pi >= pkg1PageIdx);[cite: 1]

      const groupedLines = [];[cite: 1]
      const sortedItems = content.items[cite: 1]
        .filter(it => {
          const sDec = cleanAndDecodeItem(it.str, pageOffset);[cite: 1]
          return sDec && sDec.trim();[cite: 1]
        })
        .sort((a, b) => b.transform[5] - a.transform[5]);[cite: 1]

      for (const item of sortedItems) {[cite: 1]
        const itemY = item.transform[5];[cite: 1]
        let joined = false;[cite: 1]
        for (const line of groupedLines) {[cite: 1]
          if (Math.abs(line.y - itemY) < 4.0) {[cite: 1]
            line.items.push(item);[cite: 1]
            joined = true;[cite: 1]
            break;[cite: 1]
          }
        }
        if (!joined) groupedLines.push({ y: itemY, items: [item] });[cite: 1]
      }

      const isAfterEdtoHeader = (edtoPointDataPageIdx !== -1 && pi >= edtoPointDataPageIdx);[cite: 1]

      for (const line of groupedLines) {[cite: 1]
        const lineItems = line.items.sort((a,b) => a.transform[4] - b.transform[4]);[cite: 1]
        const lineText = lineItems.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ');[cite: 1]

        if (isDispatchPage || isNotamPage) {[cite: 1]
          let hasRouteStr = false;[cite: 1]
          const cleanLineTextUpper = lineText.toUpperCase().replace(/\s+/g, '');[cite: 1]

          if (detectedAirports.length === 2) {[cite: 1]
            const a = detectedAirports[0].toUpperCase(), b = detectedAirports[1].toUpperCase();[cite: 1]
            if (cleanLineTextUpper.includes(`${a}/${b}`) || cleanLineTextUpper.includes(`${a}-${b}`) || cleanLineTextUpper.includes(`${a}TO${b}`) || cleanLineTextUpper.includes(`${a}${b}`)) {[cite: 1]
              hasRouteStr = true;[cite: 1]
            }
          }

          if (hasRouteStr) {[cite: 1]
            const minX = Math.min(...lineItems.map(it => it.transform[4]));[cite: 1]
            const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));[cite: 1]
            const itemY = line.y;[cite: 1]
            const itemH = Math.abs(lineItems[0].transform[3]) || 10;[cite: 1]
            const rh = itemH * sy;[cite: 1]
            libPage.drawRectangle({[cite: 1]
              x: minX * sx - 2,
              y: (itemY * sy) - (rh * 0.2),
              width: (maxX - minX) * sx + 4,
              height: Math.max(rh * 1.2, 8),
              color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
              opacity: 0.25
            });
            totalHits++;[cite: 1]
            continue;[cite: 1]
          }
        }

        const isEtpLine = /\betp\s*[1-5]/i.test(lineText);[cite: 1]
        if (isEtpLine && isAfterEdtoHeader) {[cite: 1]
          const minX = Math.min(...lineItems.map(it => it.transform[4]));[cite: 1]
          const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));[cite: 1]
          const itemY = line.y;[cite: 1]
          const itemH = Math.abs(lineItems[0].transform[3]) || 10;[cite: 1]
          const rh = itemH * sy;[cite: 1]
          libPage.drawRectangle({[cite: 1]
            x: minX * sx,
            y: (itemY * sy) - (rh * 0.2),
            width: (maxX - minX) * sx,
            height: Math.max(rh * 1.2, 8),
            color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
            opacity: 0.25
          });
          totalHits++;[cite: 1]
          continue;[cite: 1]
        }

        const hasSentenceKw = SENTENCE_KW.some(kw => checkKeywordMatch(lineText, kw));[cite: 1]
        if (hasSentenceKw) {[cite: 1]
          const minX = Math.min(...lineItems.map(it => it.transform[4]));[cite: 1]
          const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));[cite: 1]
          const itemY = line.y;[cite: 1]
          const itemH = Math.abs(lineItems[0].transform[3]) || 10;[cite: 1]
          const rh = itemH * sy;[cite: 1]
          libPage.drawRectangle({[cite: 1]
            x: minX * sx, y: (itemY * sy) - (rh * 0.2),[cite: 1]
            width: (maxX - minX) * sx, height: Math.max(rh * 1.2, 8),[cite: 1]
            color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),[cite: 1]
            opacity: 0.25[cite: 1]
          });
          totalHits++;[cite: 1]
          continue;[cite: 1]
        }

        if (sel.size > 0) {
          const charMapping = [];[cite: 1]
          for (let i = 0; i < lineItems.length; i++) {[cite: 1]
            const item = lineItems[i];[cite: 1]
            const decodedStr = cleanAndDecodeItem(item.str, pageOffset) || '';[cite: 1]
            if (i > 0) charMapping.push({ isSeparator: true });[cite: 1]
            for (let charIdx = 0; charIdx < decodedStr.length; charIdx++) {[cite: 1]
              charMapping.push({ itemIndex: i, charIndex: charIdx, char: decodedStr[charIdx] });[cite: 1]
            }
          }
          const lineTextFromMapping = charMapping.map(m => m.isSeparator ? ' ' : m.char).join('');[cite: 1]
          const cleanLineText = lineTextFromMapping.replace(/[^A-Za-z0-9]/g, ' ');[cite: 1]

          for (const kw of keywords) {[cite: 1]
            const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^A-Za-z0-9]+');[cite: 1]
            let re;[cite: 1]
            try { re = new RegExp(`\\b${escapedKw}\\b`, 'gi'); } catch(e) { re = new RegExp(escapedKw, 'gi'); }[cite: 1]
            let m;[cite: 1]
            let lastIndex = -1;[cite: 1]
            while ((m = re.exec(cleanLineText)) !== null) {[cite: 1]
              if (re.lastIndex === lastIndex) { re.lastIndex++; continue; }[cite: 1]
              lastIndex = re.lastIndex;[cite: 1]
              const startIdx = m.index;[cite: 1]
              const endIdx = startIdx + m[0].length;[cite: 1]
              
              const itemMatches = {};[cite: 1]
              for (let c = startIdx; c < endIdx; c++) {[cite: 1]
                const map = charMapping[c];[cite: 1]
                if (map && !map.isSeparator) {[cite: 1]
                  if (!itemMatches[map.itemIndex]) itemMatches[map.itemIndex] = [];[cite: 1]
                  itemMatches[map.itemIndex].push(map.charIndex);[cite: 1]
                }
              }
              for (const itemIdxStr of Object.keys(itemMatches)) {[cite: 1]
                const itemIdx = parseInt(itemIdxStr, 10);[cite: 1]
                const charIndices = itemMatches[itemIdx];[cite: 1]
                if (charIndices.length === 0) continue;[cite: 1]
                const minCharIdx = Math.min(...charIndices);[cite: 1]
                const maxCharIdx = Math.max(...charIndices);[cite: 1]
                const item = lineItems[itemIdx];[cite: 1]
                drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,[cite: 1]
                  PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);[cite: 1]
                totalHits++;[cite: 1]
              }
            }
          }
        }
      }
    }

    // 북마크 구성 영역[cite: 1]
    const ctx = pdfLibDoc.context;[cite: 1]
    const outlineItems = [];[cite: 1]
    const bmLabelToRef = {};[cite: 1]

    for(const bm of BOOKMARK_PATTERNS){[cite: 1]
      const pi = bmPages[bm.label]; if(pi === undefined) continue;[cite: 1]
      const pageRef = pdfLibDoc.getPage(pi).ref;[cite: 1]
      let dest;[cite: 1]
      if (bm.label === 'EQUAL TIME POINT DATA' && typeof edtoBookmarkY === 'number') {[cite: 1]
        const pageObj = pdfLibDoc.getPage(pi);[cite: 1]
        const pageHeight = pageObj.getHeight();[cite: 1]
        const topMargin = 30;[cite: 1]
        const topY = Math.max(0, Math.min(pageHeight, edtoBookmarkY + topMargin));[cite: 1]
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)]);[cite: 1]
      } else {
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('Fit')]);[cite: 1]
      }
      const itemDict = ctx.obj({Title: PDFLib.PDFString.of(bm.label), Dest: dest});[cite: 1]
      const itemRef = ctx.register(itemDict);[cite: 1]
      outlineItems.push(itemRef);[cite: 1]
      bmLabelToRef[bm.label] = itemRef;[cite: 1]
    }

    function attachSubBookmarks(parentLabel, subAirports){[cite: 1]
      const parentRef = bmLabelToRef[parentLabel];[cite: 1]
      if(!parentRef || !subAirports || subAirports.length === 0) return;[cite: 1]
      const parentDict = ctx.lookup(parentRef);[cite: 1]
      const childRefs = subAirports.map(item => {[cite: 1]
        const childPage = pdfLibDoc.getPage(item.pageIdx);[cite: 1]
        const childPageRef = childPage.ref;[cite: 1]
        const pageHeight = childPage.getHeight();[cite: 1]
        const topMargin = 30;[cite: 1]
        let topY = (typeof item.y === 'number') ? (item.y + topMargin) : pageHeight;[cite: 1]
        topY = Math.max(0, Math.min(pageHeight, topY));[cite: 1]
        const childDest = (typeof item.y === 'number')[cite: 1]
          ? ctx.obj([childPageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)])[cite: 1]
          : ctx.obj([childPageRef, PDFLib.PDFName.of('Fit')]);[cite: 1]
        const childTitle = item.title || `${item.tag} ${item.code}`.trim();[cite: 1]
        const childDict = ctx.obj({Title: PDFLib.PDFString.of(childTitle), Dest: childDest, Parent: parentRef});[cite: 1]
        return ctx.register(childDict);[cite: 1]
      });
      for(let i = 0; i < childRefs.length; i++){[cite: 1]
        const d = ctx.lookup(childRefs[i]);[cite: 1]
        if(i > 0) d.set(PDFLib.PDFName.of('Prev'), childRefs[i-1]);[cite: 1]
        if(i < childRefs.length - 1) d.set(PDFLib.PDFName.of('Next'), childRefs[i+1]);[cite: 1]
      }
      parentDict.set(PDFLib.PDFName.of('First'), childRefs[0]);[cite: 1]
      parentDict.set(PDFLib.PDFName.of('Last'), childRefs[childRefs.length-1]);[cite: 1]
      parentDict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(childRefs.length));[cite: 1]
    }

    const weatherSubBookmarks = [];[cite: 1]
    if (notam1PageIdx !== undefined && notam1PageIdx > 0) {[cite: 1]
      weatherSubBookmarks.push({ title: 'Vertical Cross-Section', pageIdx: notam1PageIdx - 1, y: null });[cite: 1]
    }
    attachSubBookmarks('WEATHER BRIEFING', weatherSubBookmarks);[cite: 1]
    attachSubBookmarks('NOTAM 1', notam1SubAirports);[cite: 1]
    attachSubBookmarks('NOTAM 2', notam2SubAirports);[cite: 1]
    attachSubBookmarks('NOTAM 3', notam3SubAirports);[cite: 1]

    if(outlineItems.length > 0){[cite: 1]
      for(let i = 0; i < outlineItems.length; i++){[cite: 1]
        const d = ctx.lookup(outlineItems[i]);[cite: 1]
        if(i > 0) d.set(PDFLib.PDFName.of('Prev'), outlineItems[i-1]);[cite: 1]
        if(i < outlineItems.length - 1) d.set(PDFLib.PDFName.of('Next'), outlineItems[i+1]);[cite: 1]
      }
      const outlineDict = ctx.obj({Type: PDFLib.PDFName.of('Outlines'), First: outlineItems[0], Last: outlineItems[outlineItems.length-1], Count: PDFLib.PDFNumber.of(outlineItems.length)});[cite: 1]
      const outlineRef = ctx.register(outlineDict);[cite: 1]
      for(const ref of outlineItems) ctx.lookup(ref).set(PDFLib.PDFName.of('Parent'), outlineRef);[cite: 1]
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlineRef);[cite: 1]
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('PageMode'), PDFLib.PDFName.of('UseOutlines'));[cite: 1]
    }

    outBytes = await pdfLibDoc.save();[cite: 1]
    done = true;[cite: 1]
    if (runBtn) {
      runBtn.className = 'action-btn dl-btn active';[cite: 1]
      runBtn.innerHTML = 'DOWNLOAD PDF FILE';[cite: 1]
    }

    setStatus('done', `Completed! ${numPages} pages, ${totalHits} elements highlighted, ${Object.keys(bmPages).length} bookmarks set.`);[cite: 1]
    if (previewCard) previewCard.style.display = 'block';[cite: 1]

    dlPDF();[cite: 1]
  } catch(err) {
    console.error("Engine execution error:", err);
    setStatus('error', 'Execution error: ' + err.message);[cite: 1]
    if (runBtn) {
      runBtn.className = 'action-btn run-btn active';[cite: 1]
      runBtn.innerHTML = 'RUN ENGINE';[cite: 1]
    }
  }
}
