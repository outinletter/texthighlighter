// 전역 변수(pdfBytes)가 올바르게 로드되었는지 확인하는 함수
function canRun() {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    alert('PDF 파일을 먼저 선택하거나 업로드하세요.');
    return false;
  }
  return true;
}

// 디스패치 문서 및 CFP에서 공항 코드를 추출하는 헬퍼 함수
async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = [];
  try {
    const page1 = await pdfJsDoc.getPage(1);
    const tc = await page1.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = (typeof detectPageOffset === 'function') ? detectPageOffset(rawText) : 0;
    
    let text = tc.items.map(it => {
      return (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, offset) : it.str;
    }).join(' ');

    // 1. "BEROK TO LEMD" 또는 "RKSI TO LEMD" 패턴 검색
    const routeMatch = text.match(/\b([A-Z]{4})\s+TO\s+([A-Z]{4})\b/i);
    if (routeMatch) {
      airports.push(routeMatch[1].toUpperCase(), routeMatch[2].toUpperCase());
      return airports;
    }

    // 2. "RKSI/LEMD" 또는 "RKSI-LEMD" 패턴 검색
    const pairMatch = text.match(/\b([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i);
    if (pairMatch) {
      airports.push(pairMatch[1].toUpperCase(), pairMatch[2].toUpperCase());
      return airports;
    }

    // 3. "DEP/ARR" 명시적 구문 탐색
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



async function runHL(){
  if(!canRun())return;
  if(!libsReady){setStatus('error','Required libraries not fully loaded.');return;}

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'SHALL', 'PROHIBIT', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4',
  'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS',
  'MUST', 'MAY NOT', 'SHALL NOT', 'NA', 'U/S', 'DUE TO', 'EXP', 'CAUTION', 'AWARE OF'];

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
    const keywords=[...sel, ...extraKws].sort((a,b)=>b.length-a.length);
    const hlRGB = activeHlColorRGB;

    const numPages=pdfJsDoc.numPages;
    const pdfLibDoc=await PDFLib.PDFDocument.load(pdfBytes,{ignoreEncryption:true});
    const libPages=pdfLibDoc.getPages();
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);
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
                if (/SUBMITTED\s+AT/i.test(pageText)) coaAnnotIdx = pi;
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

    let totalHits=0;

    if(sel.size > 0){
      setStatus('processing','Calculating highlight positions and drawing...');
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

            if (iataAirports.length === 2) {
              const a = iataAirports[0].toUpperCase(), b = iataAirports[1].toUpperCase();
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
                    const ry = itemY * sy;
                    const rw = actualHlWidth * sx;
                    const rh = itemH * sy;

                    libPage.drawRectangle({
                      x: rx - 1, y: ry - (rh * 0.15),
                      width: Math.max(rw + 2, 4), height: Math.max(rh * 1.15, 8),
                      color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
                      opacity: 0.25
                    });
                    totalHits++;
                  }
                }
              }
            }
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
            let lastIndex = -1;
            while ((m = re.exec(cleanLineText)) !== null) {
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

          // Highlight DOF
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
                drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                  PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);
                totalHits++;
              }
            }
          }

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
                  const ry = itemY * sy;
                  const rw = matchCharCount * charW * sx;
                  const rh = itemH * sy;
                  libPage.drawRectangle({
                    x: rx, y: ry - (rh * 0.2),
                    width: Math.max(rw, 4), height: Math.max(rh * 1.2, 8),
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
                    opacity: 0.25
                  });
                  totalHits++;
                }
              }
            }
          }

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
                  const ry = tx[5] * sy;
                  const rw = targetMsaStr.length * charW * sx;
                  const rh = (Math.abs(tx[3]) || 10) * sy;
                  libPage.drawRectangle({
                    x: rx - 1, y: ry - 1 - (rh * 0.2),
                    width: Math.max(rw + 2, 4), height: Math.max(rh * 1.2 + 2, 8),
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
                    opacity: 0.25
                  });
                  totalHits++;
                } else if (s === targetMsaStr) {
                  const tx = item.transform;
                  const rx = tx[4] * sx;
                  const ry = tx[5] * sy;
                  const rw = (item.width || 0) * sx;
                  const rh = (Math.abs(tx[3]) || 10) * sy;
                  libPage.drawRectangle({
                    x: rx - 1, y: ry - 1 - (rh * 0.2),
                    width: Math.max(rw + 2, 4), height: Math.max(rh * 1.2 + 2, 8),
                    color: PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]),
                    opacity: 0.25
                  });
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
      const pi=bmPages[bm.label];if(pi===undefined)continue;
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
        const childTitle = item.title || `${item.tag} ${item.code}`.trim();
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
    let suitableMap = {};
    let wptTimeMap = new Map();

    const cfpPageIdx = bmPages['CFP PLAN'];
    const resolvedCoaPageIdx = bmPages['COPY OF ATS'] !== undefined ? bmPages['COPY OF ATS'] : -1;
    const finalCoaAnnotIdx = coaAnnotIdx !== -1 ? coaAnnotIdx : resolvedCoaPageIdx;

    let foundCoaPageOffset = 0;
    if (finalCoaAnnotIdx !== -1) {
      const coaRawPage = await pdfJsDoc.getPage(finalCoaAnnotIdx + 1);
      const coaRawContent = await coaRawPage.getTextContent();
      foundCoaPageOffset = detectPageOffset(coaRawContent.items.map(it => it.str).join(' '));
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

      const cfpEndIdx = Math.min(
        numPages,
        ...[resolvedCoaPageIdx, dispatchReleaseIdx, weatherBriefingIdx, pkg1PageIdx]
          .filter(idx => idx !== -1 && idx > cfpPageIdx)
      );
      const safeCfpEndIdx = (cfpEndIdx === numPages || cfpEndIdx <= cfpPageIdx) ? Math.min(numPages, cfpPageIdx + 20) : cfpEndIdx;

      let cfpFullSectionText = "";
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

      // TRIP 시간 계산 (Duty time 오버레이)
      const tripMatch = cfpFirstPageText.match(/\bTRIP\s+(\d{3,5})\s+(\d{2})\.(\d{2})\b/i);
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
          formattedCalcText = `Duty time ${formatTime(halfMin)}`;
        } else if (totalMinutes >= 450) {
          const twoThirdsMin = Math.round((totalMinutes * 2) / 3);
          const oneThirdMin = Math.round(totalMinutes / 3);
          formattedCalcText = `Duty Time ${formatTime(twoThirdsMin)} (${formatTime(oneThirdMin)})`;
        }

        if (formattedCalcText) {
          let secondLineY = null, secondLineMaxX = null, secondLineFS = 10;
          for (const item of cfpItems) {
            const s = cleanAndDecodeItem(item.str, cfpOffset);
            if (/2ND/i.test(s)) {
              secondLineY = item.transform[5];
              secondLineFS = Math.abs(item.transform[3]) || 10;
              break;
            }
          }
          if (secondLineY !== null) {
            for (const item of cfpItems) {
              if (Math.abs(item.transform[5] - secondLineY) < 4.0) {
                const itemRightX = item.transform[4] + (item.width || 0);
                if (secondLineMaxX === null || itemRightX > secondLineMaxX) secondLineMaxX = itemRightX;
              }
            }
            const srcMidY = secondLineY + secondLineFS * SOURCE_TEXT_CENTER_RATIO;
            const drawX = (secondLineMaxX + 10) * cfpSx;

            drawDutyTimeStyleBadge(cfpLibPage, {
              text: formattedCalcText,
              x: drawX,
              centerY: srcMidY * cfpSy,
              font: boldFont,
              fontSize: 9,
              bgColor: [0.88, 0.90, 0.93],
              bgOpacity: 0.75
            });
            totalHits++;
          }
        }
      }

      // Refile Fuel - RQRD Fuel 차이 계산 및 오버레이 배지 추가
      const refileFuelMatch = cfpFullSectionText.match(/PLANNED\s+R\/F\s+AT\s+REFILE\s+POINT\s+(\d{4,5})/i);
      if (refileFuelMatch) {
        const refileFuel = parseInt(refileFuelMatch[1], 10); 

        const cfpLines = groupTextItemsByLine(cfpContent.items, cfpOffset);
        let rqrdLine = null;
        let rqrdFuel = null;

        for (const line of cfpLines) {
          const rqrdMatch = line.text.match(/\bRQRD\s+(\d{4,5})\b/i);
          if (rqrdMatch) {
            rqrdFuel = parseInt(rqrdMatch[1], 10); 
            rqrdLine = line;
            break;
          }
        }

        if (rqrdLine && rqrdFuel !== null) {
          const fuelDiffHundreds = refileFuel - rqrdFuel; 
          if (fuelDiffHundreds > 0) {
            const totalLbs = fuelDiffHundreds * 100; 
            const formattedLbsStr = totalLbs.toLocaleString('en-US').padStart(6, '0') + "lbs"; 

            const rqrdMaxX = Math.max(...rqrdLine.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
            const rqrdFS = Math.abs(rqrdLine.parts[0].item.transform[3]) || 10;
            const srcMidY = rqrdLine.y * cfpSy + rqrdFS * cfpSy * SOURCE_TEXT_CENTER_RATIO;
            const drawX = (rqrdMaxX + 12) * cfpSx;

            drawDutyTimeStyleBadge(cfpLibPage, {
              text: formattedLbsStr,
              x: drawX,
              centerY: srcMidY,
              font: boldFont,
              fontSize: 9,
              bgColor: [0.88, 0.90, 0.93],
              bgOpacity: 0.85
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
        routeTokens = extractedRoute
            .replace(/\.\./g, ' ')
            .replace(/[^A-Za-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 2 && !noiseWords.includes(t.toUpperCase()) && !/^\d+$/.test(t));
      }

      const discMatch = cfpFullSectionText.match(/\bDISC\b\s+(\d{4})\s+(\d{2}\.\d{2})/i);
      discFuel = discMatch ? discMatch[1] : '';
      discTime = discMatch ? discMatch[2] : '';

      const etdEtaMatch = cfpFullSectionText.match(/\bETD\s+([A-Z]{3,4})\s+(\d{4}Z)\s+ETA\s+([A-Z]{3,4})\s+(\d{4}Z)/i);
      if (etdEtaMatch) {
        extractedEtd = `${etdEtaMatch[1].toUpperCase()} ${etdEtaMatch[2].toUpperCase()}`;
        extractedEta = `${etdEtaMatch[3].toUpperCase()} ${etdEtaMatch[4].toUpperCase()}`;
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

        const speedAltRegex = /-(K|N|M)\s*\d\s*\d\s*\d\s*\d\s*(F|S|M|A)\s*\d\s*\d\s*\d/i;
        let destRegex = detectedAirports.length === 2
          ? new RegExp(`-\\s*${detectedAirports[1].split('').join('\\s*')}\\s*\\d\\s*\\d\\s*\\d\\s*\\d`, 'i')
          : /-\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*[A-Z]\s*\d\s*\d\s*\d\s*\d/i;

        const startMatch = coaFullTextWithNewlines.match(speedAltRegex);
        const endMatch = coaFullTextWithNewlines.match(destRegex);
        let highlightedSomething = false;

        if (startMatch && endMatch && startMatch.index < endMatch.index) {
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

            const validAtsWords = atsWordsToHighlight.filter(w => w.text.toUpperCase() !== "DCT" && !/^\d+$/.test(w.text));
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
                    const underlineY = (tx[5] * coaSy) - ((Math.abs(tx[3]) || 10) * coaSy * 0.1);
                    coaLibPage.drawLine({
                        start: { x: underlineX1, y: underlineY },
                        end: { x: underlineX2, y: underlineY },
                        color: PDFLib.rgb(1, 0, 0), thickness: 2.0, opacity: 0.5
                    });
                    totalHits++;
                }
            }
        }

        if (!highlightedSomething && routeTokens.length > 0) {
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
                    if (cToken === expectedToken || cToken.includes(expectedToken) || expectedToken.includes(cToken)) {
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
                        const underlineY = (tx[5] * coaSy) - ((Math.abs(tx[3]) || 10) * coaSy * 0.1);
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
            if (s && /SUBMITTED\s+AT/i.test(s)) {
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
            const rSize = 11;
            const rStartX = (anchorX || 36) * coaSx;
            const rMaxW = coaW * 0.75;
            const rStartY = (anchorY - 14 - rSize * 1.4) * coaSy;
            const words = routeDisplay.split(' ');
            const rLines = [];
            let cur = '';
            for (const w of words) {
              const test = cur ? cur + ' ' + w : w;
              if (stdFont.widthOfTextAtSize(test, rSize) <= rMaxW) cur = test;
              else { if (cur) rLines.push(cur); cur = w; }
            }
            if (cur) rLines.push(cur);
            const lineH = rSize * 1.4;
            for (let li = 0; li < rLines.length; li++) {
              coaLibPage.drawText(rLines[li], {
                x: rStartX, y: rStartY - li * lineH,
                size: rSize, font: stdFont, color: PDFLib.rgb(1, 0, 0), opacity: 0.7
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
      let notesY = null, notesRightX = null, notesFS = 10;
      let dispatchItem = null;

      for (const item of drContent.items) {
        const s = cleanAndDecodeItem(item.str, drOffset);
        const su = s.trim().toUpperCase();
        if (/DISPATCH\s*NOTES/i.test(s)) {
          notesY = item.transform[5];
          notesFS = Math.abs(item.transform[3]) || 10;
          notesRightX = item.transform[4] + (item.width || 0);
          break;
        }
        if (su === 'DISPATCH') { dispatchItem = item; continue; }
        if (su === 'NOTES' && dispatchItem && Math.abs(item.transform[5] - dispatchItem.transform[5]) < 5) {
          notesY = item.transform[5];
          notesFS = Math.abs(item.transform[3]) || 10;
          notesRightX = item.transform[4] + (item.width || 0);
          break;
        }
      }

      if (notesY !== null) {
        const notesMidY = notesY + notesFS * SOURCE_TEXT_CENTER_RATIO;
        drawDutyTimeStyleBadge(drLibPage, {
          text: `DISC FUEL INFO  ${discFuel}  ${discTime}`,
          x: (notesRightX + 10) * drSx,
          centerY: notesMidY * drSy,
          font: boldFont,
          fontSize: 9,
          bgColor: [0.88, 0.90, 0.93],
          bgOpacity: 0.75
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
            const annotSize = 9;
            const fullText = `${airport} ${suitableMap[airport]}`;
            const textWidth = boldFont.widthOfTextAtSize(fullText, annotSize);
            const annotStartX = lw - textWidth - 36;
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
            const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;
            drawDutyTimeStyleBadge(libPage, {
              text: fullText,
              x: annotStartX,
              centerY: srcMidY,
              font: boldFont,
              fontSize: annotSize,
              bgColor: [0.88, 0.90, 0.93],
              bgOpacity: 0.75
            });
            totalHits++;
          }
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
          pageScaleCache[pi] = { sx: lw / vp.width, sy: lh / vp.height };
        }
        const { sx, sy } = pageScaleCache[pi];
        const depAnnotSize = 9;
        const depSrcFS = subAirport.fontSize || 10;
        const depSrcMidY = subAirport.y * sy + depSrcFS * sy * SOURCE_TEXT_CENTER_RATIO;

        drawDutyTimeStyleBadge(libPages[pi], {
          text: timeText,
          x: (subAirport.maxX + 8) * sx,
          centerY: depSrcMidY,
          font: boldFont,
          fontSize: depAnnotSize,
          bgColor: [0.88, 0.90, 0.93],
          bgOpacity: 0.75
        });
      }
    }

    // FROM [WPT1] TO [WPT2] 구문 탐색 및 주석(Badge) 추가
    const expectedRegex = /FROM\s+([A-Z0-9]{3,10})\s+TO\s+([A-Z0-9]{3,10})/gi;
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
    
          let fromTime = "";
          if (typeof depApt !== "undefined" && fromWpt === depApt.toUpperCase()) {
            fromTime = "00.00";
          } else if (fromWpt === "RKSI") {
            fromTime = "00.00";
          } else {
            fromTime = wptTimeMap.get(fromWpt);
          }
    
          const toTime = wptTimeMap.get(toWpt);
    
          if (fromTime && toTime) {
            const badgeText = `${fromTime} ~ ${toTime}`;
            const lineMaxX = Math.max(...line.parts.map(p => p.item.transform[4] + (p.item.width || 0)));
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
            const srcMidY = line.y * sy + srcFS * sy * SOURCE_TEXT_CENTER_RATIO;
    
            const badgeSize = 9;
            const textWidth = boldFont.widthOfTextAtSize(badgeText, badgeSize);
            expectedBadges.push({
              text: badgeText,
              centerY: srcMidY,
              size: badgeSize,
              textWidth,
              naturalRightX: (lineMaxX + 12) * sx + textWidth + 4
            });
          }
        }
      }

      if (expectedBadges.length > 0) {
        const rightEdge = Math.max(...expectedBadges.map(badge => badge.naturalRightX));
        for (const badge of expectedBadges) {
          drawDutyTimeStyleBadge(libPage, {
            text: badge.text,
            x: rightEdge - badge.textWidth - 4,
            centerY: badge.centerY,
            font: boldFont,
            fontSize: badge.size,
            bgColor: [0.88, 0.90, 0.93],
            bgOpacity: 0.85
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
