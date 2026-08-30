// ==========================================
// 1. 전역 변수 및 초기화
// ==========================================
let pdfBytes = null;
let libsReady = true; // 라이브러리 로드 상태 (외부 라이브러리 준비 완료 시 true)
let sel = new Set();
let activeHlColorRGB = [1, 1, 0]; // 기본 하이라이트 색상 (Yellow)
let done = false;
let outBytes = null;
let detectedAirports = [];
let iataAirports = [];
let extractedAcReg = '';
const SOURCE_TEXT_CENTER_RATIO = 0.35;

// PDF.js Worker 경로 설정 (버전에 맞춰 외부 CDN 연결)
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
// 2. 파일 이벤트 핸들러 (파일 첨부 이슈 해결)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
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
  return 0; // 필요 시 인코딩 오프셋 감지 로직 추가
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

  const fullW = font.widthOfTextAtSize(s, itemH);
  let rx, rw;

  if (fullW > 0) {
    const prefixW = font.widthOfTextAtSize(s.substring(0, minCharIdx), itemH);
    const matchW = font.widthOfTextAtSize(s.substring(minCharIdx, maxCharIdx + 1), itemH);
    rx = (itemX + (prefixW / fullW) * itemW) * sx;
    rw = (matchW / fullW) * itemW * sx;
  } else {
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
  const textWidth = font.widthOfTextAtSize(text, fontSize);
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

    // 1. "BEROK TO LEMD" 또는 "RKSI TO LEMD" 패턴 검색[cite: 1]
    const routeMatch = text.match(/\b([A-Z]{4})\s+TO\s+([A-Z]{4})\b/i);[cite: 1]
    if (routeMatch) {
      airports.push(routeMatch[1].toUpperCase(), routeMatch[2].toUpperCase());[cite: 1]
      return airports;[cite: 1]
    }

    // 2. "RKSI/LEMD" 또는 "RKSI-LEMD" 패턴 검색[cite: 1]
    const pairMatch = text.match(/\b([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i);[cite: 1]
    if (pairMatch) {
      airports.push(pairMatch[1].toUpperCase(), pairMatch[2].toUpperCase());[cite: 1]
      return airports;[cite: 1]
    }

    // 3. "DEP/ARR" 명시적 구문 탐색[cite: 1]
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
  if(!canRun())return;[cite: 1]
  if(!libsReady){setStatus('error','Required libraries not fully loaded.');return;}[cite: 1]

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',[cite: 1]
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS',[cite: 1]
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'U/S', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF'];[cite: 1]

  const runBtn=document.getElementById('runBtn');[cite: 1]
  if (runBtn) {
    runBtn.className='action-btn run-btn';[cite: 1]
    runBtn.innerHTML='Processing locally...';[cite: 1]
  }
  setStatus('processing','Restoring text encoding & analyzing highlights...');[cite: 1]

  done=false;outBytes=null;detectedAirports=[]; iataAirports=[];[cite: 1]
  const previewCard = document.getElementById('previewCard');
  if (previewCard) previewCard.style.display = 'none';[cite: 1]

  await new Promise(r=>setTimeout(r,50));[cite: 1]

  try {
    let pdfJsDoc;[cite: 1]
    try {
      pdfJsDoc = await pdfjsLib.getDocument({data:pdfBytes.buffer.slice(0)}).promise;[cite: 1]
    } catch(err) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';[cite: 1]
      pdfJsDoc = await pdfjsLib.getDocument({data:pdfBytes.buffer.slice(0)}).promise;[cite: 1]
    }

    detectedAirports = await extractReleaseAirportsByRule2(pdfJsDoc);[cite: 1]
    await extractMetadata(pdfJsDoc);[cite: 1]

    const extraKws = [];[cite: 1]
    if (sel.size > 0 && typeof extractedAcReg !== 'undefined' && extractedAcReg) extraKws.push(extractedAcReg);[cite: 1]
    const keywords=[...sel, ...extraKws].sort((a,b)=>b.length-a.length);[cite: 1]
    const hlRGB = activeHlColorRGB;[cite: 1]

    const numPages=pdfJsDoc.numPages;[cite: 1]
    const pdfLibDoc=await PDFLib.PDFDocument.load(pdfBytes,{ignoreEncryption:true});[cite: 1]
    const libPages=pdfLibDoc.getPages();[cite: 1]
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);[cite: 1]
    const boldFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);[cite: 1]

    const BOOKMARK_PATTERNS=[[cite: 1]
      {label:'CFP PLAN',pattern:/CFP\s+PLAN/i},[cite: 1]
      {label:'COPY OF ATS', pattern:/COPY\s+OF\s+ATS\s+FPL/i},[cite: 1]
      {label:'DISPATCH RELEASE INFORMATION',pattern:/DISPATCH\s+RELEASE\s+INFORMATION|DISPATCH\s+RELEASE\s+INFO/i},[cite: 1]
      {label:'EQUAL TIME POINT DATA',pattern:/EQUAL\s+TIME\s+POINT\s+DATA/i},[cite: 1]
      {label:'WEATHER BRIEFING',pattern:/WEATHER\s+BRIEFING/i},[cite: 1]
      {label:'NOTAM 1',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*1)\b|(\[\s*NOTAM\s*1\s*\])/i},[cite: 1]
      {label:'NOTAM 2',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*2)\b|(\[\s*NOTAM\s*2\s*\])/i},[cite: 1]
      {label:'NOTAM 3',pattern:/(NOTAM\s*(PACKAGE)?\s*[-_]?\s*3)\b|(\[\s*NOTAM\s*3\s*\])/i},[cite: 1]
    ];

    const bmPages={};[cite: 1]
    let edtoBookmarkY = null;[cite: 1]
    let coaAnnotIdx = -1;[cite: 1]

    for(let pi=0;pi<numPages;pi++){[cite: 1]
      const jsPage2=await pdfJsDoc.getPage(pi+1);[cite: 1]
      const tc=await jsPage2.getTextContent();[cite: 1]
      const rawText=tc.items.map(it=>it.str).join(' ');[cite: 1]
      const offset = detectPageOffset(rawText);[cite: 1]
      const pageText=tc.items.map(it=>cleanAndDecodeItem(it.str, offset)).join(' ');[cite: 1]

      for(const bm of BOOKMARK_PATTERNS){[cite: 1]
        if(bmPages[bm.label]!==undefined) {[cite: 1]
            if (bm.label === 'COPY OF ATS' && coaAnnotIdx === -1) {[cite: 1]
                if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;[cite: 1]
            }
            continue;[cite: 1]
        }
        if(bm.pattern.test(pageText)){[cite: 1]
          bmPages[bm.label]=pi;[cite: 1]
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

    let totalHits=0;[cite: 1]

    if(sel.size > 0){[cite: 1]
      setStatus('processing','Calculating highlight positions and drawing...');[cite: 1]
      for(let pi=0;pi<numPages;pi++){[cite: 1]
        const jsPage=await pdfJsDoc.getPage(pi+1);[cite: 1]
        const vp=jsPage.getViewport({scale:1.0});[cite: 1]
        const libPage=libPages[pi];[cite: 1]
        const {width:lw,height:lh}=libPage.getSize();[cite: 1]
        const sx=lw/vp.width;[cite: 1]
        const sy=lh/vp.height;[cite: 1]

        const content=await jsPage.getTextContent();[cite: 1]
        const rawPageText = content.items.map(it => it.str).join(' ');[cite: 1]
        const pageOffset = detectPageOffset(rawPageText);[cite: 1]

        const isDispatchPage = (dispatchReleaseIdx !== -1 && pi >= dispatchReleaseIdx && pi < dispatchEndIdx);[cite: 1]
        const isNotamPage = (pkg1PageIdx !== -1 && pi >= pkg1PageIdx);[cite: 1]

        if (pageOffset !== 0) {[cite: 1]
          for (const item of content.items) {[cite: 1]
            const originalStr = cleanAndDecodeItem(item.str, pageOffset);[cite: 1]
            const asciiStr = originalStr ? originalStr.replace(/[^\x00-\x7F]/g, '') : '';[cite: 1]

            if (asciiStr && asciiStr.trim()) {[cite: 1]
              const tx = item.transform;[cite: 1]
              const rx = tx[4] * sx;[cite: 1]
              const ry = tx[5] * sy;[cite: 1]
              const itemH = Math.abs(tx[3]) || 10;[cite: 1]
              try {
                libPage.drawText(asciiStr, {[cite: 1]
                  x: rx, y: ry, size: itemH * sy, font: stdFont, color: PDFLib.rgb(0, 0, 0), opacity: 0.0[cite: 1]
                });
              } catch (err) {
                console.warn("Search layer injection skipped", err);[cite: 1]
              }
            }
          }
        }

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

            if (iataAirports.length === 2) {[cite: 1]
              const a = iataAirports[0].toUpperCase(), b = iataAirports[1].toUpperCase();[cite: 1]
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

          const isParLine = /\/\s*[A-Z]{4}\s+FIR/i.test(lineText);[cite: 1]
          if (isParLine) {[cite: 1]
            const firRegex = /\bFIR\b/i;[cite: 1]
            const match = firRegex.exec(lineText);[cite: 1]
            if (match) {[cite: 1]
              const postFirText = lineText.substring(match.index + match[0].length);[cite: 1]
              const wordMatch = postFirText.match(/[A-Za-z]{3,}/);[cite: 1]
              if (wordMatch) {[cite: 1]
                const targetWord = wordMatch[0];[cite: 1]
                for (const item of lineItems) {[cite: 1]
                  const s = cleanAndDecodeItem(item.str, pageOffset);[cite: 1]
                  const tx = item.transform;[cite: 1]
                  const itemX = tx[4], itemY = tx[5];[cite: 1]
                  const itemW = item.width || 0;[cite: 1]
                  const itemH = Math.abs(tx[3]) || 10;[cite: 1]

                  const idx = s.toUpperCase().indexOf(targetWord.toUpperCase());[cite: 1]
                  if (idx !== -1) {[cite: 1]
                    const fullMeasuredW = stdFont.widthOfTextAtSize(s, itemH);[cite: 1]
                    const prefixMeasuredW = stdFont.widthOfTextAtSize(s.substring(0, idx), itemH);[cite: 1]
                    const matchMeasuredW = stdFont.widthOfTextAtSize(s.substring(idx, idx + targetWord.length), itemH);[cite: 1]

                    const startXOffset = fullMeasuredW > 0 ? (prefixMeasuredW / fullMeasuredW) * itemW : (itemW / s.length) * idx;[cite: 1]
                    const actualHlWidth = fullMeasuredW > 0 ? (matchMeasuredW / fullMeasuredW) * itemW : (itemW / s.length) * targetWord.length;[cite: 1]

                    const rx = (itemX + startXOffset) * sx;[cite: 1]
                    const ry = itemY * sy;[cite: 1]
                    const rw = actualHlWidth * sx;[cite: 1]
                    const rh = itemH * sy;[cite: 1]

                    libPage.drawRectangle({[cite: 1]
                      x: rx - 1, y: ry - (rh * 0.15),[cite: 1]
                      width: Math.max(rw + 2, 4), height: Math.max(rh * 1.15, 8),[cite: 1]
                      color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),[cite: 1]
                      opacity: 0.25[cite: 1]
                    });
                    totalHits++;[cite: 1]
                  }
                }
              }
            }
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
              if (kw.toUpperCase() === 'MEL' || kw.toUpperCase() === 'CDL') {[cite: 1]
                if (lineTextFromMapping[startIdx - 1] === '/' || lineTextFromMapping[endIdx] === '/') continue;[cite: 1]
              }
              if (kw.toUpperCase() === 'MAY') {[cite: 1]
                const beforeCtx = cleanLineText.slice(Math.max(0, startIdx - 6), startIdx);[cite: 1]
                const afterCtx = cleanLineText.slice(endIdx, endIdx + 6);[cite: 1]
                const isDateCtx = /\d\s*[A-Z]{0,2}\s*$/i.test(beforeCtx) || /^\s*\d/.test(afterCtx);[cite: 1]
                if (isDateCtx) continue;[cite: 1]
              }
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

          // Highlight DOF[cite: 1]
          {
            const dofLineRegex = /\bDOF\s+(\d{6})\b/i;[cite: 1]
            const dofLineM = dofLineRegex.exec(cleanLineText);[cite: 1]
            if (dofLineM) {[cite: 1]
              const dStart = dofLineM.index + dofLineM[0].length - dofLineM[1].length;[cite: 1]
              const dEnd = dStart + 6;[cite: 1]
              const dItemMatches = {};[cite: 1]
              for (let c = dStart; c < dEnd; c++) {[cite: 1]
                const map = charMapping[c];[cite: 1]
                if (map && !map.isSeparator) {[cite: 1]
                  if (!dItemMatches[map.itemIndex]) dItemMatches[map.itemIndex] = [];[cite: 1]
                  dItemMatches[map.itemIndex].push(map.charIndex);[cite: 1]
                }
              }
              for (const itemIdxStr of Object.keys(dItemMatches)) {[cite: 1]
                const itemIdx = parseInt(itemIdxStr, 10);[cite: 1]
                const charIndices = dItemMatches[itemIdx];[cite: 1]
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

          const shearRegex = /\b\d{5}[A-Za-z ]\d{3}\s+([0-9]{2})\b/g;[cite: 1]
          let shrM;[cite: 1]
          let lastShrIdx = -1;[cite: 1]
          if (lineTextFromMapping.includes('---')) {[cite: 1]
            while ((shrM = shearRegex.exec(cleanLineText)) !== null) {[cite: 1]
              if (shearRegex.lastIndex === lastShrIdx) { shearRegex.lastIndex++; continue; }[cite: 1]
              lastShrIdx = shearRegex.lastIndex;[cite: 1]
              const shearVal = parseInt(shrM[1], 10);[cite: 1]
              if (shearVal >= 5) {[cite: 1]
                const startIdx = shrM.index + shrM[0].length - shrM[1].length;[cite: 1]
                const endIdx = startIdx + shrM[1].length;[cite: 1]
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
                  const matchCharCount = maxCharIdx - minCharIdx + 1;[cite: 1]
                  const item = lineItems[itemIdx];[cite: 1]
                  const s = cleanAndDecodeItem(item.str, pageOffset) || '';[cite: 1]
                  const tx = item.transform;[cite: 1]
                  const itemX = tx[4], itemY = tx[5];[cite: 1]
                  const itemW = item.width || 0;[cite: 1]
                  const itemH = Math.abs(tx[3]) || 10;[cite: 1]
                  const charW = itemW / Math.max(s.length, 1);[cite: 1]
                  const rx = (itemX + minCharIdx * charW) * sx;[cite: 1]
                  const ry = itemY * sy;[cite: 1]
                  const rw = matchCharCount * charW * sx;[cite: 1]
                  const rh = itemH * sy;[cite: 1]
                  libPage.drawRectangle({[cite: 1]
                    x: rx, y: ry - (rh * 0.2),[cite: 1]
                    width: Math.max(rw, 4), height: Math.max(rh * 1.2, 8),[cite: 1]
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),[cite: 1]
                    opacity: 0.25[cite: 1]
                  });
                  totalHits++;[cite: 1]
                }
              }
            }
          }

          const msaRegex = /---\s*\/\s*(\d{3})\b/i;[cite: 1]
          const msaMatch = lineText.match(msaRegex);[cite: 1]
          if (msaMatch) {[cite: 1]
            const msaVal = parseInt(msaMatch[1], 10);[cite: 1]
            if (msaVal >= 100) {[cite: 1]
              const targetMsaStr = msaMatch[1];[cite: 1]
              for (const item of lineItems) {[cite: 1]
                const s = cleanAndDecodeItem(item.str, pageOffset);[cite: 1]
                let idx = s.indexOf("/" + targetMsaStr);[cite: 1]
                if (idx !== -1) {[cite: 1]
                  idx += 1;[cite: 1]
                  const tx = item.transform;[cite: 1]
                  const charW = (item.width || 0) / Math.max(item.str.length, 1);[cite: 1]
                  const rx = (tx[4] + idx * charW) * sx;[cite: 1]
                  const ry = tx[5] * sy;[cite: 1]
                  const rw = targetMsaStr.length * charW * sx;[cite: 1]
                  const rh = (Math.abs(tx[3]) || 10) * sy;[cite: 1]
                  libPage.drawRectangle({[cite: 1]
                    x: rx - 1, y: ry - 1 - (rh * 0.2),[cite: 1]
                    width: Math.max(rw + 2, 4), height: Math.max(rh * 1.2 + 2, 8),[cite: 1]
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),[cite: 1]
                    opacity: 0.25[cite: 1]
                  });
                  totalHits++;[cite: 1]
                } else if (s === targetMsaStr) {[cite: 1]
                  const tx = item.transform;[cite: 1]
                  const rx = tx[4] * sx;[cite: 1]
                  const ry = tx[5] * sy;[cite: 1]
                  const rw = (item.width || 0) * sx;[cite: 1]
                  const rh = (Math.abs(tx[3]) || 10) * sy;[cite: 1]
                  libPage.drawRectangle({[cite: 1]
                    x: rx - 1, y: ry - 1 - (rh * 0.2),[cite: 1]
                    width: Math.max(rw + 2, 4), height: Math.max(rh * 1.2 + 2, 8),[cite: 1]
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),[cite: 1]
                    opacity: 0.25[cite: 1]
                  });
                  totalHits++;[cite: 1]
                }
              }
            }
          }
        }
      }
    }

    const ctx=pdfLibDoc.context;[cite: 1]
    const outlineItems=[];[cite: 1]
    const bmLabelToRef={};[cite: 1]

    for(const bm of BOOKMARK_PATTERNS){[cite: 1]
      const pi=bmPages[bm.label];if(pi===undefined)continue;[cite: 1]
      const pageRef=pdfLibDoc.getPage(pi).ref;[cite: 1]
      let dest;[cite: 1]
      if (bm.label === 'EQUAL TIME POINT DATA' && typeof edtoBookmarkY === 'number') {[cite: 1]
        const pageObj = pdfLibDoc.getPage(pi);[cite: 1]
        const pageHeight = pageObj.getHeight();[cite: 1]
        const topMargin = 30;[cite: 1]
        const topY = Math.max(0, Math.min(pageHeight, edtoBookmarkY + topMargin));[cite: 1]
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)]);[cite: 1]
      } else {
        dest=ctx.obj([pageRef,PDFLib.PDFName.of('Fit')]);[cite: 1]
      }
      const itemDict=ctx.obj({Title:PDFLib.PDFString.of(bm.label),Dest:dest});[cite: 1]
      const itemRef=ctx.register(itemDict);[cite: 1]
      outlineItems.push(itemRef);[cite: 1]
      bmLabelToRef[bm.label]=itemRef;[cite: 1]
    }

    function attachSubBookmarks(parentLabel, subAirports){[cite: 1]
      const parentRef=bmLabelToRef[parentLabel];[cite: 1]
      if(!parentRef||!subAirports||subAirports.length===0)return;[cite: 1]
      const parentDict=ctx.lookup(parentRef);[cite: 1]
      const childRefs=subAirports.map(item=>{[cite: 1]
        const childPage=pdfLibDoc.getPage(item.pageIdx);[cite: 1]
        const childPageRef=childPage.ref;[cite: 1]
        const pageHeight = childPage.getHeight();[cite: 1]
        const topMargin = 30;[cite: 1]
        let topY = (typeof item.y === 'number') ? (item.y + topMargin) : pageHeight;[cite: 1]
        topY = Math.max(0, Math.min(pageHeight, topY));[cite: 1]
        const childDest = (typeof item.y === 'number')[cite: 1]
          ? ctx.obj([childPageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)])[cite: 1]
          : ctx.obj([childPageRef, PDFLib.PDFName.of('Fit')]);[cite: 1]
        const childTitle = item.title || `${item.tag} ${item.code}`.trim();[cite: 1]
        const childDict=ctx.obj({Title:PDFLib.PDFString.of(childTitle),Dest:childDest,Parent:parentRef});[cite: 1]
        return ctx.register(childDict);[cite: 1]
      });
      for(let i=0;i<childRefs.length;i++){[cite: 1]
        const d=ctx.lookup(childRefs[i]);[cite: 1]
        if(i>0)d.set(PDFLib.PDFName.of('Prev'),childRefs[i-1]);[cite: 1]
        if(i<childRefs.length-1)d.set(PDFLib.PDFName.of('Next'),childRefs[i+1]);[cite: 1]
      }
      parentDict.set(PDFLib.PDFName.of('First'),childRefs[0]);[cite: 1]
      parentDict.set(PDFLib.PDFName.of('Last'),childRefs[childRefs.length-1]);[cite: 1]
      parentDict.set(PDFLib.PDFName.of('Count'),PDFLib.PDFNumber.of(childRefs.length));[cite: 1]
    }

    const weatherSubBookmarks = [];[cite: 1]
    if (notam1PageIdx !== undefined && notam1PageIdx > 0) {[cite: 1]
      weatherSubBookmarks.push({ title: 'Vertical Cross-Section', pageIdx: notam1PageIdx - 1, y: null });[cite: 1]
    }
    attachSubBookmarks('WEATHER BRIEFING', weatherSubBookmarks);[cite: 1]
    attachSubBookmarks('NOTAM 1', notam1SubAirports);[cite: 1]
    attachSubBookmarks('NOTAM 2', notam2SubAirports);[cite: 1]
    attachSubBookmarks('NOTAM 3', notam3SubAirports);[cite: 1]

    if(outlineItems.length>0){[cite: 1]
      for(let i=0;i<outlineItems.length;i++){[cite: 1]
        const d=ctx.lookup(outlineItems[i]);[cite: 1]
        if(i>0)d.set(PDFLib.PDFName.of('Prev'),outlineItems[i-1]);[cite: 1]
        if(i<outlineItems.length-1)d.set(PDFLib.PDFName.of('Next'),outlineItems[i+1]);[cite: 1]
      }
      const outlineDict=ctx.obj({Type:PDFLib.PDFName.of('Outlines'),First:outlineItems[0],Last:outlineItems[outlineItems.length-1],Count:PDFLib.PDFNumber.of(outlineItems.length)});[cite: 1]
      const outlineRef=ctx.register(outlineDict);[cite: 1]
      for(const ref of outlineItems)ctx.lookup(ref).set(PDFLib.PDFName.of('Parent'),outlineRef);[cite: 1]
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('Outlines'),outlineRef);[cite: 1]
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('PageMode'),PDFLib.PDFName.of('UseOutlines'));[cite: 1]
    }

    let routeTokens = [];[cite: 1]
    let discFuel = '', discTime = '';[cite: 1]
    let extractedEtd = '', extractedEta = '';[cite: 1]
    let suitableMap = {};[cite: 1]
    let wptTimeMap = new Map();[cite: 1]

    const cfpPageIdx = bmPages['CFP PLAN'];[cite: 1]
    const resolvedCoaPageIdx = bmPages['COPY OF ATS'] !== undefined ? bmPages['COPY OF ATS'] : -1;[cite: 1]
    const finalCoaAnnotIdx = coaAnnotIdx !== -1 ? coaAnnotIdx : resolvedCoaPageIdx;[cite: 1]

    let foundCoaPageOffset = 0;[cite: 1]
    if (finalCoaAnnotIdx !== -1) {[cite: 1]
      const coaRawPage = await pdfJsDoc.getPage(finalCoaAnnotIdx + 1);[cite: 1]
      const coaRawContent = await coaRawPage.getTextContent();[cite: 1]
      foundCoaPageOffset = detectPageOffset(coaRawContent.items.map(it => it.str).join(' '));[cite: 1]
    }

    if(cfpPageIdx!==undefined) {[cite: 1]
      const cfpJsPage=await pdfJsDoc.getPage(cfpPageIdx+1);[cite: 1]
      const cfpContent=await cfpJsPage.getTextContent();[cite: 1]
      const rawCfpText = cfpContent.items.map(it => it.str).join(' ');[cite: 1]
      const cfpOffset = detectPageOffset(rawCfpText);[cite: 1]
      const cfpLibPage = libPages[cfpPageIdx];[cite: 1]
      const { width: cfpW, height: cfpH } = cfpLibPage.getSize();[cite: 1]
      const cfpVp = cfpJsPage.getViewport({ scale: 1.0 });[cite: 1]
      const cfpSx = cfpW / cfpVp.width;[cite: 1]
      const cfpSy = cfpH / cfpVp.height;[cite: 1]

      const cfpItems=cfpContent.items.slice().sort((a,b)=>{[cite: 1]
        const ay=a.transform[5],by2=b.transform[5];[cite: 1]
        if(Math.abs(ay-by2)>2)return by2-ay;[cite: 1]
        return a.transform[4]-b.transform[4];[cite: 1]
      });

      let cfpFirstPageText = "";[cite: 1]
      let lastY = null;[cite: 1]
      for (const item of cfpItems) {[cite: 1]
        const decodedStr = cleanAndDecodeItem(item.str, cfpOffset);[cite: 1]
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 4.5) {[cite: 1]
          cfpFirstPageText += "\n";[cite: 1]
        }
        cfpFirstPageText += decodedStr + " ";[cite: 1]
        lastY = item.transform[5];[cite: 1]
      }

      const cfpEndIdx = Math.min([cite: 1]
        numPages,
        ...[resolvedCoaPageIdx, dispatchReleaseIdx, weatherBriefingIdx, pkg1PageIdx]
          .filter(idx => idx !== -1 && idx > cfpPageIdx)
      );
      const safeCfpEndIdx = (cfpEndIdx === numPages || cfpEndIdx <= cfpPageIdx) ? Math.min(numPages, cfpPageIdx + 20) : cfpEndIdx;[cite: 1]

      let cfpFullSectionText = "";[cite: 1]
      for (let pi = cfpPageIdx; pi < safeCfpEndIdx; pi++) {[cite: 1]
        const p = await pdfJsDoc.getPage(pi + 1);[cite: 1]
        const tc = await p.getTextContent();[cite: 1]
        const raw = tc.items.map(it => it.str).join(' ');[cite: 1]
        const off = detectPageOffset(raw);[cite: 1]
        const sorted = tc.items.slice().sort((a,b)=>{[cite: 1]
          const ay=a.transform[5], by2=b.transform[5];[cite: 1]
          if(Math.abs(ay-by2)>2) return by2-ay;[cite: 1]
          return a.transform[4]-b.transform[4];[cite: 1]
        });
        let pageLastY = null;[cite: 1]
        for (const item of sorted) {[cite: 1]
          const s = cleanAndDecodeItem(item.str, off);[cite: 1]
          if (pageLastY !== null && Math.abs(item.transform[5] - pageLastY) > 4.5) cfpFullSectionText += "\n";[cite: 1]
          cfpFullSectionText += s + " ";[cite: 1]
          pageLastY = item.transform[5];[cite: 1]
        }
        cfpFullSectionText += "\n";[cite: 1]
      }

      wptTimeMap = buildWptTimeMap(cfpFullSectionText);[cite: 1]

      // TRIP 시간 계산 (Duty time 오버레이)[cite: 1]
      const tripMatch = cfpFirstPageText.match(/\bTRIP\s+(\d{3,5})\s+(\d{2})\.(\d{2})\b/i);[cite: 1]
      if (tripMatch) {[cite: 1]
        const hours = parseInt(tripMatch[2], 10);[cite: 1]
        const minutes = parseInt(tripMatch[3], 10);[cite: 1]
        const totalMinutes = hours * 60 + minutes;[cite: 1]

        const formatTime = (totalMins) => {[cite: 1]
          const h = Math.floor(totalMins / 60).toString().padStart(2, '0');[cite: 1]
          const m = (totalMins % 60).toString().padStart(2, '0');[cite: 1]
          return `${h}:${m}`;[cite: 1]
        };

        let formattedCalcText = "";[cite: 1]
        if (totalMinutes >= 690) {[cite: 1]
          const halfMin = Math.round(totalMinutes / 2);[cite: 1]
          formattedCalcText = `Duty time ${formatTime(halfMin)}`;[cite: 1]
        } else if (totalMinutes >= 450) {[cite: 1]
          const twoThirdsMin = Math.round((totalMinutes * 2) / 3);[cite: 1]
          const oneThirdMin = Math.round(totalMinutes / 3);[cite: 1]
          formattedCalcText = `Duty Time ${formatTime(twoThirdsMin)} (${formatTime(oneThirdMin)})`;[cite: 1]
        }

        if (formattedCalcText) {[cite: 1]
          let secondLineY = null, secondLineMaxX = null, secondLineFS = 10;[cite: 1]
          for (const item of cfpItems) {[cite: 1]
            const s = cleanAndDecodeItem(item.str, cfpOffset);[cite: 1]
            if (/2ND/i.test(s)) {[cite: 1]
              secondLineY = item.transform[5];[cite: 1]
              secondLineFS = Math.abs(item.transform[3]) || 10;[cite: 1]
              break;[cite: 1]
            }
          }
          if (secondLineY !== null) {[cite: 1]
            for (const item of cfpItems) {[cite: 1]
              if (Math.abs(item.transform[5] - secondLineY) < 4.0) {[cite: 1]
                const itemRightX = item.transform[4] + (item.width || 0);[cite: 1]
                if (secondLineMaxX === null || itemRightX > secondLineMaxX) secondLineMaxX = itemRightX;[cite: 1]
              }
            }
            const srcMidY = secondLineY + secondLineFS * SOURCE_TEXT_CENTER_RATIO;[cite: 1]
            const drawX = (secondLineMaxX + 10) * cfpSx;[cite: 1]

            drawDutyTimeStyleBadge(cfpLibPage, {[cite: 1]
              text: formattedCalcText,[cite: 1]
              x: drawX,[cite: 1]
              centerY: srcMidY * cfpSy,[cite: 1]
              font: boldFont,[cite: 1]
              fontSize: 9,[cite: 1]
              bgColor: [0.88, 0.90, 0.93],[cite: 1]
              bgOpacity: 0.75[cite: 1]
            });
            totalHits++;[cite: 1]
          }
        }
      }

      // Refile Fuel - RQRD Fuel 차이 계산 및 오버레이 배지 추가[cite: 1]
      const refileFuelMatch = cfpFullSectionText.match(/PLANNED\s+R\/F\s+AT\s+REFILE\s+POINT\s+(\d{4,5})/i);[cite: 1]
      if (refileFuelMatch) {[cite: 1]
        const refileFuel = parseInt(refileFuelMatch[1], 10);[cite: 1]

        const cfpLines = groupTextItemsByLine(cfpContent.items, cfpOffset);[cite: 1]
        let rqrdLine = null;[cite: 1]
        let rqrdFuel = null;[cite: 1]

        for (const line of cfpLines) {[cite: 1]
          const rqrdMatch = line.text.match(/\bRQRD\s+(\d{4,5})\b/i);[cite: 1]
          if (rqrdMatch) {[cite: 1]
            rqrdFuel = parseInt(rqrdMatch[1], 10);[cite: 1]
            rqrdLine = line;[cite: 1]
            break;[cite: 1]
          }
        }

        if (rqrdLine && rqrdFuel !== null) {[cite: 1]
          const fuelDiffHundreds = refileFuel - rqrdFuel;[cite: 1]
          if (fuelDiffHundreds > 0) {[cite: 1]
            const totalLbs = fuelDiffHundreds * 100;[cite: 1]
            const formattedLbsStr = totalLbs.toLocaleString('en-US').padStart(6, '0') + "lbs";[cite: 1]

            const rqrdMaxX = Math.max(...rqrdLine.parts.map(p => p.item.transform[4] + (p.item.width || 0)));[cite: 1]
            const rqrdFS = Math.abs(rqrdLine.parts[0].item.transform[3]) || 10;[cite: 1]
            const srcMidY = rqrdLine.y * cfpSy + rqrdFS * cfpSy * SOURCE_TEXT_CENTER_RATIO;[cite: 1]
            const drawX = (rqrdMaxX + 12) * cfpSx;[cite: 1]

            drawDutyTimeStyleBadge(cfpLibPage, {[cite: 1]
              text: formattedLbsStr,[cite: 1]
              x: drawX,[cite: 1]
              centerY: srcMidY,[cite: 1]
              font: boldFont,[cite: 1]
              fontSize: 9,[cite: 1]
              bgColor: [0.88, 0.90, 0.93],[cite: 1]
              bgOpacity: 0.85[cite: 1]
            });
            totalHits++;[cite: 1]
          }
        }
      }

      let extractedRoute = "";[cite: 1]
      {
        const distIdx = cfpFullSectionText.search(/DIST\s+LATITUDE/i);[cite: 1]
        if (distIdx !== -1) {[cite: 1]
          const beforeDist = cfpFullSectionText.substring(0, distIdx);[cite: 1]
          const lines = beforeDist.split('\n').map(l => l.trim()).filter(l => l);[cite: 1]
          let routeStartLine = -1;[cite: 1]
          for (let i = lines.length - 1; i >= 0; i--) {[cite: 1]
            if (/2ND/i.test(lines[i])) { routeStartLine = i + 1; break; }[cite: 1]
          }
          if (routeStartLine !== -1 && routeStartLine < lines.length) {[cite: 1]
            extractedRoute = lines.slice(routeStartLine).join(' ').trim();[cite: 1]
          }
        }
      }

      if (!extractedRoute && detectedAirports.length === 2) {[cite: 1]
        const depCode = detectedAirports[0], arrCode = detectedAirports[1];[cite: 1]
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');[cite: 1]
        const routePattern1 = new RegExp(`${escapeRegExp(depCode)}\\.\\.[\\s\\S]{5,800}?\\.\\.${escapeRegExp(arrCode)}`, 'i');[cite: 1]
        const routePattern2 = new RegExp(`\\b${escapeRegExp(depCode)}\\b[\\s\\S]{5,800}?\\b${escapeRegExp(arrCode)}\\b`, 'i');[cite: 1]
        let rMatch = cfpFullSectionText.match(routePattern1) || cfpFullSectionText.match(routePattern2);[cite: 1]
        if (rMatch) extractedRoute = rMatch[0].trim();[cite: 1]
      }

      if(extractedRoute) {[cite: 1]
        const noiseWords = ['FLIGHT', 'PLAN', 'FUEL', 'TIME', 'WIND', 'TEMP', 'DIST', 'COMP', 'FREQ', 'RMK', 'ALTN', 'AWY', 'POS', 'LAT', 'LONG', 'ETA', 'ETD', 'ACTL', 'TOC', 'CLB', 'CRZ', 'DSC', 'IFR', 'NAM', 'AGTOW', 'TRIP', 'SOW', 'RWY', 'RESERVE', 'FINAL', 'RES', 'CONT', 'REFILE', 'RQD', 'TAKEOFF', 'DISC', 'TANKERING', 'PLN', 'RAMP', 'OUT', 'FOD', 'ROD', 'TOW', 'MTOW', 'LDW', 'MLDW', 'TIF', 'TCAP', 'PAX', 'CGO'];[cite: 1]
        routeTokens = extractedRoute[cite: 1]
            .replace(/\.\./g, ' ')[cite: 1]
            .replace(/[^A-Za-z0-9\s]/g, ' ')[cite: 1]
            .split(/\s+/)[cite: 1]
            .filter(t => t.length >= 2 && !noiseWords.includes(t.toUpperCase()) && !/^\d+$/.test(t));[cite: 1]
      }

      const discMatch = cfpFullSectionText.match(/\bDISC\b\s+(\d{4})\s+(\d{2}\.\d{2})/i);[cite: 1]
      discFuel = discMatch ? discMatch[1] : '';[cite: 1]
      discTime = discMatch ? discMatch[2] : '';[cite: 1]

      const etdEtaMatch = cfpFullSectionText.match(/\bETD\s+([A-Z]{3,4})\s+(\d{4}Z)\s+ETA\s+([A-Z]{3,4})\s+(\d{4}Z)/i);[cite: 1]
      if (etdEtaMatch) {[cite: 1]
        extractedEtd = `${etdEtaMatch[1].toUpperCase()} ${etdEtaMatch[2].toUpperCase()}`;[cite: 1]
        extractedEta = `${etdEtaMatch[3].toUpperCase()} ${etdEtaMatch[4].toUpperCase()}`;[cite: 1]
      }

      if (finalCoaAnnotIdx !== -1) {[cite: 1]
        const coaJsPage=await pdfJsDoc.getPage(finalCoaAnnotIdx+1);[cite: 1]
        const coaContent=await coaJsPage.getTextContent();[cite: 1]
        const coaLibPage = libPages[finalCoaAnnotIdx];[cite: 1]
        const {width:coaW,height:coaH}=coaLibPage.getSize();[cite: 1]
        const coaVp=coaJsPage.getViewport({scale:1.0});[cite: 1]
        const coaSx=coaW/coaVp.width;[cite: 1]
        const coaSy=coaH/coaVp.height;[cite: 1]

        const sortedCoaItems = coaContent.items.slice().sort((a,b) => {[cite: 1]
          const ay = a.transform[5], by = b.transform[5];[cite: 1]
          if (Math.abs(ay - by) > 4) return by - ay;[cite: 1]
          return a.transform[4] - b.transform[4];[cite: 1]
        });

        let coaFullTextWithNewlines = "";[cite: 1]
        const coaCharMapping = [];[cite: 1]

        for (let i = 0; i < sortedCoaItems.length; i++) {[cite: 1]
          const item = sortedCoaItems[i];[cite: 1]
          const prevItem = i > 0 ? sortedCoaItems[i-1] : null;[cite: 1]
          const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';[cite: 1]

          if (prevItem) {[cite: 1]
             const dy = Math.abs(prevItem.transform[5] - item.transform[5]);[cite: 1]
             const dx = item.transform[4] - (prevItem.transform[4] + prevItem.width);[cite: 1]
             if (dy > 4 || dx > 2) {[cite: 1]
                 coaFullTextWithNewlines += "\n";[cite: 1]
                 coaCharMapping.push({ isSeparator: true, itemIndex: -1, charIndex: -1 });[cite: 1]
             }
          }

          for (let c = 0; c < s.length; c++) {[cite: 1]
             let charToMatch = s[c].toUpperCase();[cite: 1]
             if (!/[A-Z0-9\/\-]/.test(charToMatch)) charToMatch = ' ';[cite: 1]
             coaFullTextWithNewlines += charToMatch;[cite: 1]
             coaCharMapping.push({ itemIndex: i, charIndex: c });[cite: 1]
          }
        }

        const speedAltRegex = /-(K|N|M)\s*\d\s*\d\s*\d\s*\d\s*(F|S|M|A)\s*\d\s*\d\s*\d/i;[cite: 1]
        let destRegex = detectedAirports.length === 2[cite: 1]
          ? new RegExp(`-\\s*${detectedAirports[1].split('').join('\\s*')}\\s*\\d\\s*\\d\\s*\\d\\s*\\d`, 'i')[cite: 1]
          : /-\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*\d\s*\d\s*\d\s*\d/i;[cite: 1]

        const startMatch = coaFullTextWithNewlines.match(speedAltRegex);[cite: 1]
        const endMatch = coaFullTextWithNewlines.match(destRegex);[cite: 1]
        let highlightedSomething = false;[cite: 1]

        if (startMatch && endMatch && startMatch.index < endMatch.index) {[cite: 1]
            const routeStart = startMatch.index + startMatch[0].length;[cite: 1]
            const routeEnd = endMatch.index;[cite: 1]
            let currentWord = { text: "", chars: [] };[cite: 1]
            const atsWordsToHighlight = [];[cite: 1]

            for (let i = routeStart; i < routeEnd; i++) {[cite: 1]
                const char = coaFullTextWithNewlines[i];[cite: 1]
                if (char === '/') {[cite: 1]
                    if (currentWord.text.length > 0) {[cite: 1]
                        atsWordsToHighlight.push(currentWord);[cite: 1]
                        currentWord = { text: "", chars: [] };[cite: 1]
                    }
                    while (i < routeEnd && coaFullTextWithNewlines[i] !== ' ' && coaFullTextWithNewlines[i] !== '\n') i++;[cite: 1]
                    continue;[cite: 1]
                }
                if (/[A-Z0-9]/i.test(char)) {[cite: 1]
                    currentWord.text += char;[cite: 1]
                    currentWord.chars.push(i);[cite: 1]
                } else {
                    if (currentWord.text.length > 0) {[cite: 1]
                        atsWordsToHighlight.push(currentWord);[cite: 1]
                        currentWord = { text: "", chars: [] };[cite: 1]
                    }
                }
            }
            if (currentWord.text.length > 0) atsWordsToHighlight.push(currentWord);[cite: 1]

            const validAtsWords = atsWordsToHighlight.filter(w => w.text.toUpperCase() !== "DCT" && !/^\d+$/.test(w.text));[cite: 1]
            if (validAtsWords.length > 0) highlightedSomething = true;[cite: 1]

            for (const wordObj of validAtsWords) {[cite: 1]
                const itemMatches = {};[cite: 1]
                for (let c of wordObj.chars) {[cite: 1]
                    const map = coaCharMapping[c];[cite: 1]
                    if (map && map.itemIndex !== -1) {[cite: 1]
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
                    const matchCharCount = maxCharIdx - minCharIdx + 1;[cite: 1]
                    const item = sortedCoaItems[itemIdx];[cite: 1]
                    const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';[cite: 1]
                    const tx = item.transform;[cite: 1]
                    const charW = (item.width || 0) / Math.max(s.length, 1);[cite: 1]
                    const underlineX1 = (tx[4] + minCharIdx * charW) * coaSx;[cite: 1]
                    const underlineX2 = underlineX1 + Math.max(matchCharCount * charW * coaSx, 4);[cite: 1]
                    const underlineY = (tx[5] * coaSy) - ((Math.abs(tx[3]) || 10) * coaSy * 0.1);[cite: 1]
                    coaLibPage.drawLine({[cite: 1]
                        start: { x: underlineX1, y: underlineY },[cite: 1]
                        end: { x: underlineX2, y: underlineY },[cite: 1]
                        color: PDFLib.rgb(1, 0, 0), thickness: 2.0, opacity: 0.5[cite: 1]
                    });
                    totalHits++;[cite: 1]
                }
            }
        }

        if (!highlightedSomething && routeTokens.length > 0) {[cite: 1]
            let searchStartIndex = 0;[cite: 1]
            const coaTokens = [];[cite: 1]
            let currentToken = null;[cite: 1]

            for (let i = 0; i < coaCharMapping.length; i++) {[cite: 1]
                const map = coaCharMapping[i];[cite: 1]
                if (!map.isSeparator && /[A-Z0-9]/.test(coaFullTextWithNewlines[i])) {[cite: 1]
                    if (!currentToken) currentToken = { text: '', chars: [] };[cite: 1]
                    currentToken.text += coaFullTextWithNewlines[i];[cite: 1]
                    currentToken.chars.push(i);[cite: 1]
                } else {
                    if (currentToken) { coaTokens.push(currentToken); currentToken = null; }[cite: 1]
                }
            }
            if (currentToken) coaTokens.push(currentToken);[cite: 1]

            for (const rToken of routeTokens) {[cite: 1]
                const expectedToken = rToken.toUpperCase();[cite: 1]
                let bestMatchIdx = -1;[cite: 1]
                for (let i = searchStartIndex; i < coaTokens.length; i++) {[cite: 1]
                    const cToken = coaTokens[i].text.toUpperCase();[cite: 1]
                    if (cToken === expectedToken || cToken.includes(expectedToken) || expectedToken.includes(cToken)) {[cite: 1]
                        bestMatchIdx = i;[cite: 1]
                        break;[cite: 1]
                    }
                }
                if (bestMatchIdx !== -1) {[cite: 1]
                    const matchedCToken = coaTokens[bestMatchIdx];[cite: 1]
                    const itemMatches = {};[cite: 1]
                    for (let c of matchedCToken.chars) {[cite: 1]
                        const map = coaCharMapping[c];[cite: 1]
                        if (map && map.itemIndex !== -1) {[cite: 1]
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
                        const matchCharCount = maxCharIdx - minCharIdx + 1;[cite: 1]
                        const item = sortedCoaItems[itemIdx];[cite: 1]
                        const s = cleanAndDecodeItem(item.str, foundCoaPageOffset) || '';[cite: 1]
                        const tx = item.transform;[cite: 1]
                        const charW = (item.width || 0) / Math.max(s.length, 1);[cite: 1]
                        const underlineX1 = (tx[4] + minCharIdx * charW) * coaSx;[cite: 1]
                        const underlineX2 = underlineX1 + Math.max(matchCharCount * charW * coaSx, 4);[cite: 1]
                        const underlineY = (tx[5] * coaSy) - ((Math.abs(tx[3]) || 10) * coaSy * 0.1);[cite: 1]
                        coaLibPage.drawLine({[cite: 1]
                            start: { x: underlineX1, y: underlineY },[cite: 1]
                            end: { x: underlineX2, y: underlineY },[cite: 1]
                            color: PDFLib.rgb(1, 0, 0), thickness: 2.0, opacity: 0.5[cite: 1]
                        });
                        totalHits++;[cite: 1]
                    }
                    searchStartIndex = bestMatchIdx + 1;[cite: 1]
                }
            }
        }

        if (extractedRoute) {[cite: 1]
          const routeDisplay = extractedRoute.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();[cite: 1]
          let anchorY = null, anchorX = null;[cite: 1]
          for (const item of sortedCoaItems) {[cite: 1]
            const s = cleanAndDecodeItem(item.str, foundCoaPageOffset).trim();[cite: 1]
            if (s && /SUBMITTED\s+AT/i.test(s)) {[cite: 1]
              anchorY = item.transform[5]; anchorX = item.transform[4];[cite: 1]
            }
          }
          if (anchorY === null) {[cite: 1]
            for (const item of sortedCoaItems) {[cite: 1]
              const s = cleanAndDecodeItem(item.str, foundCoaPageOffset).trim();[cite: 1]
              if (s) {[cite: 1]
                const y = item.transform[5];[cite: 1]
                if (anchorY === null || y < anchorY) { anchorY = y; anchorX = item.transform[4]; }[cite: 1]
              }
            }
          }
          if (anchorY !== null) {[cite: 1]
            const rSize = 11;[cite: 1]
            const rStartX = (anchorX || 36) * coaSx;[cite: 1]
            const rMaxW = coaW * 0.75;[cite: 1]
            const rStartY = (anchorY - 14 - rSize * 1.4) * coaSy;[cite: 1]
            const words = routeDisplay.split(' ');[cite: 1]
            const rLines = [];[cite: 1]
            let cur = '';[cite: 1]
            for (const w of words) {[cite: 1]
              const test = cur ? cur + ' ' + w : w;[cite: 1]
              if (stdFont.widthOfTextAtSize(test, rSize) <= rMaxW) cur = test;[cite: 1]
              else { if (cur) rLines.push(cur); cur = w; }[cite: 1]
            }
            if (cur) rLines.push(cur);[cite: 1]
            const lineH = rSize * 1.4;[cite: 1]
            for (let li = 0; li < rLines.length; li++) {[cite: 1]
              coaLibPage.drawText(rLines[li], {[cite: 1]
                x: rStartX, y: rStartY - li * lineH,[cite: 1]
                size: rSize, font: stdFont, color: PDFLib.rgb(1, 0, 0), opacity: 0.7[cite: 1]
              });
            }
          }
        }
      }
    }

    // DISC FUEL 정보 오버레이[cite: 1]
    if (discFuel && discTime && dispatchReleaseIdx !== -1) {[cite: 1]
      const drJsPage = await pdfJsDoc.getPage(dispatchReleaseIdx + 1);[cite: 1]
      const drContent = await drJsPage.getTextContent();[cite: 1]
      const drOffset = detectPageOffset(drContent.items.map(it => it.str).join(' '));[cite: 1]
      const drLibPage = libPages[dispatchReleaseIdx];[cite: 1]
      const { width: drW, height: drH } = drLibPage.getSize();[cite: 1]
      const drVp = drJsPage.getViewport({ scale: 1.0 });[cite: 1]
      const drSx = drW / drVp.width, drSy = drH / drVp.height;[cite: 1]
      let notesY = null, notesRightX = null, notesFS = 10;[cite: 1]
      let dispatchItem = null;[cite: 1]

      for (const item of drContent.items) {[cite: 1]
        const s = cleanAndDecodeItem(item.str, drOffset);[cite: 1]
        const su = s.trim().toUpperCase();[cite: 1]
        if (/DISPATCH\s*NOTES/i.test(s)) {[cite: 1]
          notesY = item.transform[5];[cite: 1]
          notesFS = Math.abs(item.transform[3]) || 10;[cite: 1]
          notesRightX = item.transform[4] + (item.width || 0);[cite: 1]
          break;[cite: 1]
        }
        if (su === 'DISPATCH') { dispatchItem = item; continue; }[cite: 1]
        if (su === 'NOTES' && dispatchItem && Math.abs(item.transform[5] - dispatchItem.transform[5]) < 5) {[cite: 1]
          notesY = item.transform[5];[cite: 1]
          notesFS = Math.abs(item.transform[3]) || 10;[cite: 1]
          notesRightX = item.transform[4] + (item.width || 0);[cite: 1]
          break;[cite: 1]
        }
      }

      if (notesY !== null) {[cite: 1]
        const notesMidY = notesY + notesFS * SOURCE_TEXT_CENTER_RATIO;[cite: 1]
        drawDutyTimeStyleBadge(drLibPage, {[cite: 1]
          text: `DISC FUEL INFO  ${discFuel}  ${discTime}`,[cite: 1]
          x: (notesRightX + 10) * drSx,[cite: 1]
          centerY: notesMidY * drSy,[cite: 1]
          font: boldFont,[cite: 1]
          fontSize: 9,[cite: 1]
          bgColor: [0.88, 0.90, 0.93],[cite: 1]
          bgOpacity: 0.75[cite: 1]
        });
      }
    }

    if (cfpPageIdx !== undefined) {[cite: 1]
      const cfpSectionEnd = Math.min([cite: 1]
        notam1PageIdx !== undefined ? notam1PageIdx : cfpPageIdx + 20,[cite: 1]
        numPages[cite: 1]
      );
      for (let pi = cfpPageIdx; pi < cfpSectionEnd; pi++) {[cite: 1]
        const scanPage = await pdfJsDoc.getPage(pi + 1);[cite: 1]
        const scanTc = await scanPage.getTextContent();[cite: 1]
        const scanRaw = scanTc.items.map(it => it.str).join(' ');[cite: 1]
        const scanOff = detectPageOffset(scanRaw);[cite: 1]
        const scanText = scanTc.items.map(it => cleanAndDecodeItem(it.str, scanOff)).join(' ');[cite: 1]
        if (/ENROUTE\s+ALTERNATES/i.test(scanText)) {[cite: 1]
          const suitRe = /\b([A-Z]{3,4})\s+SUITABLE\s+FROM\s+(\d{4})\s+UTC\s*\/\s*TO\s+(\d{4})\s+UTC/gi;[cite: 1]
          let sm;[cite: 1]
          while ((sm = suitRe.exec(scanText)) !== null) {[cite: 1]
            suitableMap[sm[1].toUpperCase()] = `From ${sm[2]}Z To ${sm[3]}Z`;[cite: 1]
          }
          break;[cite: 1]
        }
      }
    }

    // Suitable Enroute Alternate 표시[cite: 1]
    if (Object.keys(suitableMap).length > 0 && notam1PageIdx !== undefined) {[cite: 1]
      const tagRe = /\[\s*(ERA|EDTO|REFILE|\d+\s*%\s*ERA)\s*\]\s*([A-Z]{3,4})\b/gi;[cite: 1]
      for (let pi = notam1PageIdx; pi < numPages; pi++) {[cite: 1]
        const jsPage = await pdfJsDoc.getPage(pi + 1);[cite: 1]
        const tc = await jsPage.getTextContent();[cite: 1]
        const rawText = tc.items.map(it => it.str).join(' ');[cite: 1]
        const offset = detectPageOffset(rawText);[cite: 1]
        const lines = groupTextItemsByLine(tc.items, offset);[cite: 1]
        const libPage = libPages[pi];[cite: 1]
        const { width: lw, height: lh } = libPage.getSize();[cite: 1]
        const vp = jsPage.getViewport({ scale: 1.0 });[cite: 1]
        const sy = lh / vp.height;[cite: 1]

        for (const line of lines) {[cite: 1]
          tagRe.lastIndex = 0;[cite: 1]
          let m;[cite: 1]
          while ((m = tagRe.exec(line.text)) !== null) {[cite: 1]
            const airport = m[2].toUpperCase();[cite: 1]
            if (!suitableMap[airport]) continue;[cite: 1]
            const annotSize = 9;[cite: 1]
            const fullText = `${airport} ${suitableMap[airport]}`;[cite: 1]
            const textWidth = boldFont.widthOfTextAtSize(fullText, annotSize);[cite: 1]
            const annotStartX = lw - textWidth - 36;[cite: 1]
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;[cite: 1]
            const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;[cite: 1]
            drawDutyTimeStyleBadge(libPage, {[cite: 1]
              text: fullText,[cite: 1]
              x: annotStartX,[cite: 1]
              centerY: srcMidY,[cite: 1]
              font: boldFont,[cite: 1]
              fontSize: annotSize,[cite: 1]
              bgColor: [0.88, 0.90, 0.93],[cite: 1]
              bgOpacity: 0.75[cite: 1]
            });
            totalHits++;[cite: 1]
          }
        }
      }
    }

    // DEP/DEST 시간 표시[cite: 1]
    const tagTimeMap = {};[cite: 1]
    if (extractedEtd) tagTimeMap['DEP'] = extractedEtd;[cite: 1]
    if (extractedEta) tagTimeMap['DEST'] = extractedEta;[cite: 1]

    if (Object.keys(tagTimeMap).length > 0 && notam1SubAirports.length > 0) {[cite: 1]
      const pageScaleCache = {};[cite: 1]
      for (const subAirport of notam1SubAirports) {[cite: 1]
        const timeText = tagTimeMap[subAirport.tag];[cite: 1]
        if (!timeText || subAirport.maxX === undefined) continue;[cite: 1]
        const pi = subAirport.pageIdx;[cite: 1]
        if (!pageScaleCache[pi]) {[cite: 1]
          const jsP = await pdfJsDoc.getPage(pi + 1);[cite: 1]
          const vp = jsP.getViewport({ scale: 1.0 });[cite: 1]
          const lp = libPages[pi];[cite: 1]
          const { width: lw, height: lh } = lp.getSize();[cite: 1]
          pageScaleCache[pi] = { sx: lw / vp.width, sy: lh / vp.height };[cite: 1]
        }
        const { sx, sy } = pageScaleCache[pi];[cite: 1]
        const depAnnotSize = 9;[cite: 1]
        const depSrcFS = subAirport.fontSize || 10;[cite: 1]
        const depSrcMidY = subAirport.y * sy + depSrcFS * sy * SOURCE_TEXT_CENTER_RATIO;[cite: 1]

        drawDutyTimeStyleBadge(libPages[pi], {[cite: 1]
          text: timeText,[cite: 1]
          x: (subAirport.maxX + 8) * sx,[cite: 1]
          centerY: depSrcMidY,[cite: 1]
          font: boldFont,[cite: 1]
          fontSize: depAnnotSize,[cite: 1]
          bgColor: [0.88, 0.90, 0.93],[cite: 1]
          bgOpacity: 0.75[cite: 1]
        });
      }
    }

    // FROM [WPT1] TO [WPT2] 구문 탐색 및 주석(Badge) 추가[cite: 1]
    const expectedRegex = /FROM\s+([A-Z0-9]{3,10})\s+TO\s+([A-Z0-9]{3,10})/gi;[cite: 1]
    const expectedStartIdx = dispatchReleaseIdx !== -1 ? dispatchReleaseIdx : 0;[cite: 1]
    const expectedEndIdx = dispatchReleaseIdx !== -1 ? dispatchEndIdx : numPages;[cite: 1]
    
    for (let pi = expectedStartIdx; pi < expectedEndIdx; pi++) {[cite: 1]
      const jsPage = await pdfJsDoc.getPage(pi + 1);[cite: 1]
      const tc = await jsPage.getTextContent();[cite: 1]
      const rawText = tc.items.map(it => it.str).join(' ');[cite: 1]
      const offset = detectPageOffset(rawText);[cite: 1]
      const lines = groupTextItemsByLine(tc.items, offset);[cite: 1]
      const libPage = libPages[pi];[cite: 1]
      const { width: lw, height: lh } = libPage.getSize();[cite: 1]
      const vp = jsPage.getViewport({ scale: 1.0 });[cite: 1]
      const sx = lw / vp.width;[cite: 1]
      const sy = lh / vp.height;[cite: 1]
      const expectedBadges = [];[cite: 1]
    
      for (const line of lines) {[cite: 1]
        let match;[cite: 1]
        expectedRegex.lastIndex = 0;[cite: 1]
        while ((match = expectedRegex.exec(line.text)) !== null) {[cite: 1]
          const fromWpt = match[1].toUpperCase();[cite: 1]
          const toWpt = match[2].toUpperCase();[cite: 1]
    
          let fromTime = "";[cite: 1]
          if (typeof depApt !== "undefined" && fromWpt === depApt.toUpperCase()) {[cite: 1]
            fromTime = "00.00";[cite: 1]
          } else if (fromWpt === "RKSI") {[cite: 1]
            fromTime = "00.00";[cite: 1]
          } else {
            fromTime = wptTimeMap.get(fromWpt);[cite: 1]
          }
    
          const toTime = wptTimeMap.get(toWpt);[cite: 1]
    
          if (fromTime && toTime) {[cite: 1]
            const badgeText = `${fromTime} ~ ${toTime}`;[cite: 1]
            const lineMaxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));[cite: 1]
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;[cite: 1]
            const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;[cite: 1]
    
            const badgeSize = 9;[cite: 1]
            const textWidth = boldFont.widthOfTextAtSize(badgeText, badgeSize);[cite: 1]
            expectedBadges.push({[cite: 1]
              text: badgeText,[cite: 1]
              centerY: srcMidY,[cite: 1]
              size: badgeSize,[cite: 1]
              textWidth,[cite: 1]
              naturalRightX: (lineMaxX + 12) * sx + textWidth + 4[cite: 1]
            });
          }
        }
      }

      if (expectedBadges.length > 0) {[cite: 1]
        const rightEdge = Math.max(...expectedBadges.map(badge => badge.naturalRightX));[cite: 1]
        for (const badge of expectedBadges) {[cite: 1]
          drawDutyTimeStyleBadge(libPage, {[cite: 1]
            text: badge.text,[cite: 1]
            x: rightEdge - badge.textWidth - 4,[cite: 1]
            centerY: badge.centerY,[cite: 1]
            font: boldFont,[cite: 1]
            fontSize: badge.size,[cite: 1]
            bgColor: [0.88, 0.90, 0.93],[cite: 1]
            bgOpacity: 0.85[cite: 1]
          });
          totalHits++;[cite: 1]
        }
      }
    }

    outBytes=await pdfLibDoc.save();[cite: 1]
    done=true;[cite: 1]
    if (runBtn) {
      runBtn.className='action-btn dl-btn active';[cite: 1]
      runBtn.innerHTML='DOWNLOAD PDF FILE';[cite: 1]
    }

    setStatus('done',`Completed! ${numPages} pages, ${totalHits} elements highlighted, ${Object.keys(bmPages).length} bookmarks set.`);[cite: 1]
    if (previewCard) previewCard.style.display='block';[cite: 1]

    dlPDF();[cite: 1]
  } catch(err) {
    setStatus('error','Execution error: '+err.message);[cite: 1]
    if (runBtn) {
      runBtn.className='action-btn run-btn active';[cite: 1]
      runBtn.innerHTML='RUN ENGINE';[cite: 1]
    }
  }
}
