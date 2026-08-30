// ==========================================
// 1. 전역 변수 및 초기화
// ==========================================
let pdfBytes = null;
let libsReady = true;
let sel = new Set();
let activeHlColorRGB = [1, 1, 0]; // 기본 하이라이트 색상 (Yellow)
let done = false;
let outBytes = null;
let detectedAirports = [];
let iataAirports = [];
let extractedAcReg = '';
const SOURCE_TEXT_CENTER_RATIO = 0.35;

// PDF.js Worker 경로 설정 (CDN)
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// UI 상태 업데이트 헬퍼 함수
function setStatus(type, message) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  const statusEl = document.getElementById('statusMsg') || document.getElementById('status');
  if (statusEl) statusEl.textContent = message;
}

// 결과 PDF 다운로드 함수
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
// 2. 파일 및 버튼 이벤트 바인딩 (오류 수정 구간)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 실제 <input type="file"> 요소 감지
  const fileInput = document.getElementById('fileInput') || document.getElementById('pdfFile');
  // 화면에 보이는 파일 선택 커스텀 버튼 감지
  const fileBtn = document.getElementById('fileBtn') || document.getElementById('uploadBtn') || document.getElementById('selectFileBtn');

  // 커스텀 버튼 클릭 시 숨겨진 fileInput 트리거 실행
  if (fileBtn && fileInput) {
    fileBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // 파일 선택 변경(change) 이벤트 바인딩
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        setStatus('processing', 'PDF 파일을 읽는 중입니다...');
        const buffer = await file.arrayBuffer();
        pdfBytes = new Uint8Array(buffer);
        done = false; // 새 파일 로드 시 상태 초기화
        outBytes = null;
        
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

// 전역 변수(pdfBytes)가 올바르게 로드되었는지 확인하는 함수
function canRun() {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    alert('PDF 파일을 먼저 선택하거나 업로드하세요.');
    return false;
  }
  return true;
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

async function extractMetadata(pdfJsDoc) {
  return {};
}

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

async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = [];
  try {
    const page1 = await pdfJsDoc.getPage(1);
    const tc = await page1.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    
    let text = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');

    const routeMatch = text.match(/\b([A-Z]{4})\s+TO\s+([A-Z]{4})\b/i);
    if (routeMatch) {
      airports.push(routeMatch[1].toUpperCase(), routeMatch[2].toUpperCase());
      return airports;
    }

    const pairMatch = text.match(/\b([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i);
    if (pairMatch) {
      airports.push(pairMatch[1].toUpperCase(), pairMatch[2].toUpperCase());
      return airports;
    }

    const depMatch = text.match(/\bDEP[:\s]+([A-Z]{4})\b/i);
    const destMatch = text.match(/\b(?:DEST|ARR)[:\s]+([A-Z]{4})\b/i);
    if (depMatch && destMatch) {
      airports.push(depMatch[1].toUpperCase(), destMatch[1].toUpperCase());
      return airports;
    }
  } catch (e) {
    console.warn("extractReleaseAirportsByRule2 processing warning:", e);
  }
  return airports;
}

// ==========================================
// 4. 메인 분석 Engine 함수
// ==========================================
async function runHL(){
  if(!canRun()) return;
  if(typeof PDFLib === 'undefined' || typeof pdfjsLib === 'undefined') {
    setStatus('error', 'PDF 라이브러리가 로드되지 않았습니다.');
    return;
  }

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS',
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'U/S', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF'];

  const runBtn = document.getElementById('runBtn');
  if (runBtn) {
    runBtn.className = 'action-btn run-btn';
    runBtn.innerHTML = 'Processing locally...';
  }
  setStatus('processing', 'Restoring text encoding & analyzing highlights...');

  done = false; outBytes = null; detectedAirports = []; iataAirports = [];
  const previewCard = document.getElementById('previewCard');
  if (previewCard) previewCard.style.display = 'none';

  await new Promise(r => setTimeout(r, 50));

  try {
    let pdfJsDoc;
    try {
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;
    } catch(err) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;
    }

    detectedAirports = await extractReleaseAirportsByRule2(pdfJsDoc);
    await extractMetadata(pdfJsDoc);

    const extraKws = [];
    if (sel.size > 0 && typeof extractedAcReg !== 'undefined' && extractedAcReg) extraKws.push(extractedAcReg);
    const keywords = [...sel, ...extraKws].sort((a,b) => b.length - a.length);
    const hlRGB = activeHlColorRGB;

    const numPages = pdfJsDoc.numPages;
    const pdfLibDoc = await PDFLib.PDFDocument.load(pdfBytes, {ignoreEncryption: true});
    const libPages = pdfLibDoc.getPages();
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const boldFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    const BOOKMARK_PATTERNS = [
      {label:'CFP PLAN', pattern:/CFP\s+PLAN/i},
      {label:'COPY OF ATS', pattern:/COPY\s+OF\s+ATS\s+FPL/i},
      {label:'DISPATCH RELEASE INFORMATION', pattern:/DISPATCH\s+RELEASE\s+INFORMATION|DISPATCH\s+RELEASE\s+INFO/i},
      {label:'EQUAL TIME POINT DATA', pattern:/EQUAL\s+TIME\s+POINT\s+DATA/i},
      {label:'WEATHER BRIEFING', pattern:/WEATHER\s+BRIEFING/i},
      {label:'NOTAM 1', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*1)\b|(\[\s*NOTAM\s*1\s*\])/i},
      {label:'NOTAM 2', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*2)\b|(\[\s*NOTAM\s*2\s*\])/i},
      {label:'NOTAM 3', pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*3)\b|(\[\s*NOTAM\s*3\s*\])/i},
    ];

    const bmPages = {};
    let edtoBookmarkY = null;
    let coaAnnotIdx = -1;

    for(let pi = 0; pi < numPages; pi++){
      const jsPage2 = await pdfJsDoc.getPage(pi + 1);
      const tc = await jsPage2.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const pageText = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');

      for(const bm of BOOKMARK_PATTERNS){
        if(bmPages[bm.label] !== undefined) {
            if (bm.label === 'COPY OF ATS' && coaAnnotIdx === -1) {
                if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;
            }
            continue;
        }
        if(bm.pattern.test(pageText)){
          bmPages[bm.label] = pi;
          if (bm.label === 'EQUAL TIME POINT DATA') {
            const matchItem = tc.items.find(it => /EQUAL/i.test(cleanAndDecodeItem(it.str, offset)));
            if (matchItem) edtoBookmarkY = matchItem.transform[5];
          }
          if (bm.label === 'COPY OF ATS') {
            if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;
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

    const edtoPointDataPageIdx = bmPages['EQUAL TIME POINT DATA'] !== undefined ? bmPages['EQUAL TIME POINT DATA'] : -1;

    let totalHits = 0;

    for(let pi = 0; pi < numPages; pi++){
      const jsPage = await pdfJsDoc.getPage(pi + 1);
      const vp = jsPage.getViewport({scale: 1.0});
      const libPage = libPages[pi];
      const {width: lw, height: lh} = libPage.getSize();
      const sx = lw / vp.width;
      const sy = lh / vp.height;

      const content = await jsPage.getTextContent();
      const rawPageText = content.items.map(it => it.str).join(' ');
      const pageOffset = detectPageOffset(rawPageText);

      const isDispatchPage = (dispatchReleaseIdx !== -1 && pi >= dispatchReleaseIdx && pi < dispatchEndIdx);
      const isNotamPage = (pkg1PageIdx !== -1 && pi >= pkg1PageIdx);

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

      for (const line of groupedLines) {
        const lineItems = line.items.sort((a,b) => a.transform[4] - b.transform[4]);
        const lineText = lineItems.map(it => cleanAndDecodeItem(it.str, pageOffset)).join(' ');

        if (isDispatchPage || isNotamPage) {
          let hasRouteStr = false;
          const cleanLineTextUpper = lineText.toUpperCase().replace(/\s+/g, '');

          if (detectedAirports.length === 2) {
            const a = detectedAirports[0].toUpperCase(), b = detectedAirports[1].toUpperCase();
            if (cleanLineTextUpper.includes(`${a}/${b}`) || cleanLineTextUpper.includes(`${a}-${b}`) || cleanLineTextUpper.includes(`${a}TO${b}`) || cleanLineTextUpper.includes(`${a}${b}`)) {
              hasRouteStr = true;
            }
          }

          if (hasRouteStr) {
            const minX = Math.min(...lineItems.map(it => it.transform[4]));
            const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
            const itemY = line.y;
            const itemH = Math.abs(lineItems[0].transform[3]) || 10;
            const rh = itemH * sy;
            libPage.drawRectangle({
              x: minX * sx - 2,
              y: (itemY * sy) - (rh * 0.2),
              width: (maxX - minX) * sx + 4,
              height: Math.max(rh * 1.2, 8),
              color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
              opacity: 0.25
            });
            totalHits++;
            continue;
          }
        }

        const isEtpLine = /\betp\s*[1-5]/i.test(lineText);
        if (isEtpLine && isAfterEdtoHeader) {
          const minX = Math.min(...lineItems.map(it => it.transform[4]));
          const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
          const itemY = line.y;
          const itemH = Math.abs(lineItems[0].transform[3]) || 10;
          const rh = itemH * sy;
          libPage.drawRectangle({
            x: minX * sx,
            y: (itemY * sy) - (rh * 0.2),
            width: (maxX - minX) * sx,
            height: Math.max(rh * 1.2, 8),
            color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
            opacity: 0.25
          });
          totalHits++;
          continue;
        }

        const hasSentenceKw = SENTENCE_KW.some(kw => checkKeywordMatch(lineText, kw));
        if (hasSentenceKw) {
          const minX = Math.min(...lineItems.map(it => it.transform[4]));
          const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
          const itemY = line.y;
          const itemH = Math.abs(lineItems[0].transform[3]) || 10;
          const rh = itemH * sy;
          libPage.drawRectangle({
            x: minX * sx, y: (itemY * sy) - (rh * 0.2),
            width: (maxX - minX) * sx, height: Math.max(rh * 1.2, 8),
            color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
            opacity: 0.25
          });
          totalHits++;
          continue;
        }

        if (sel.size > 0) {
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

          for (const kw of keywords) {
            const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^A-Za-z0-9]+');
            let re;
            try { re = new RegExp(`\\b${escapedKw}\\b`, 'gi'); } catch(e) { re = new RegExp(escapedKw, 'gi'); }
            let m;
            while ((m = re.exec(cleanLineText)) !== null) {
              if (m.index === re.lastIndex) {
                re.lastIndex++;
              }
              const startIdx = m.index;
              const endIdx = startIdx + m[0].length;
              
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
                const item = lineItems[itemIdx];
                drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                  PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);
                totalHits++;
              }
            }
          }
        }
      }
    }

    const ctx = pdfLibDoc.context;
    const outlineItems = [];
    const bmLabelToRef = {};

    for(const bm of BOOKMARK_PATTERNS){
      const pi = bmPages[bm.label]; if(pi === undefined) continue;
      const pageRef = pdfLibDoc.getPage(pi).ref;
      let dest;
      if (bm.label === 'EQUAL TIME POINT DATA' && typeof edtoBookmarkY === 'number') {
        const pageObj = pdfLibDoc.getPage(pi);
        const pageHeight = pageObj.getHeight();
        const topMargin = 30;
        const topY = Math.max(0, Math.min(pageHeight, edtoBookmarkY + topMargin));
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)]);
      } else {
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('Fit')]);
      }
      const itemDict = ctx.obj({Title: PDFLib.PDFString.of(bm.label), Dest: dest});
      const itemRef = ctx.register(itemDict);
      outlineItems.push(itemRef);
      bmLabelToRef[bm.label] = itemRef;
    }

    function attachSubBookmarks(parentLabel, subAirports){
      const parentRef = bmLabelToRef[parentLabel];
      if(!parentRef || !subAirports || subAirports.length === 0) return;
      const parentDict = ctx.lookup(parentRef);
      const childRefs = subAirports.map(item => {
        const childPage = pdfLibDoc.getPage(item.pageIdx);
        const childPageRef = childPage.ref;
        const pageHeight = childPage.getHeight();
        const topMargin = 30;
        let topY = (typeof item.y === 'number') ? (item.y + topMargin) : pageHeight;
        topY = Math.max(0, Math.min(pageHeight, topY));
        const childDest = (typeof item.y === 'number')
          ? ctx.obj([childPageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)])
          : ctx.obj([childPageRef, PDFLib.PDFName.of('Fit')]);
        const childTitle = item.title || `${item.tag} ${item.code}`.trim();
        const childDict = ctx.obj({Title: PDFLib.PDFString.of(childTitle), Dest: childDest, Parent: parentRef});
        return ctx.register(childDict);
      });
      for(let i = 0; i < childRefs.length; i++){
        const d = ctx.lookup(childRefs[i]);
        if(i > 0) d.set(PDFLib.PDFName.of('Prev'), childRefs[i-1]);
        if(i < childRefs.length - 1) d.set(PDFLib.PDFName.of('Next'), childRefs[i+1]);
      }
      parentDict.set(PDFLib.PDFName.of('First'), childRefs[0]);
      parentDict.set(PDFLib.PDFName.of('Last'), childRefs[childRefs.length-1]);
      parentDict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(childRefs.length));
    }

    const weatherSubBookmarks = [];
    if (notam1PageIdx !== undefined && notam1PageIdx > 0) {
      weatherSubBookmarks.push({ title: 'Vertical Cross-Section', pageIdx: notam1PageIdx - 1, y: null });
    }
    attachSubBookmarks('WEATHER BRIEFING', weatherSubBookmarks);
    attachSubBookmarks('NOTAM 1', notam1SubAirports);
    attachSubBookmarks('NOTAM 2', notam2SubAirports);
    attachSubBookmarks('NOTAM 3', notam3SubAirports);

    if(outlineItems.length > 0){
      for(let i = 0; i < outlineItems.length; i++){
        const d = ctx.lookup(outlineItems[i]);
        if(i > 0) d.set(PDFLib.PDFName.of('Prev'), outlineItems[i-1]);
        if(i < outlineItems.length - 1) d.set(PDFLib.PDFName.of('Next'), outlineItems[i+1]);
      }
      const outlineDict = ctx.obj({Type: PDFLib.PDFName.of('Outlines'), First: outlineItems[0], Last: outlineItems[outlineItems.length-1], Count: PDFLib.PDFNumber.of(outlineItems.length)});
      const outlineRef = ctx.register(outlineDict);
      for(const ref of outlineItems) ctx.lookup(ref).set(PDFLib.PDFName.of('Parent'), outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('PageMode'), PDFLib.PDFName.of('UseOutlines'));
    }

    outBytes = await pdfLibDoc.save();
    done = true;
    if (runBtn) {
      runBtn.className = 'action-btn dl-btn active';
      runBtn.innerHTML = 'DOWNLOAD PDF FILE';
    }

    setStatus('done', `Completed! ${numPages} pages, ${totalHits} elements highlighted, ${Object.keys(bmPages).length} bookmarks set.`);
    if (previewCard) previewCard.style.display = 'block';

    dlPDF();
  } catch(err) {
    console.error("Engine execution error:", err);
    setStatus('error', 'Execution error: ' + err.message);
    if (runBtn) {
      runBtn.className = 'action-btn run-btn active';
      runBtn.innerHTML = 'RUN ENGINE';
    }
  }
}
