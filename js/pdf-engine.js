// 전역 변수(pdfBytes)가 올바르게 로드되었는지 확인하는 함수
function canRun() {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    alert('PDF 파일을 먼저 선택하거나 업로드하세요.');
    return false;
  }
  return true;
}

// PDF Document에서 메타데이터(항공기 등록번호, 편명, 날짜 등) 추출
async function extractMetadata(pdfJsDoc) {
  try {
    const meta = await pdfJsDoc.getMetadata();
    if (meta && meta.info) {
      if (meta.info.Title) {
        const fnMatch = meta.info.Title.match(/\b(KE\d{3,4}|KAL\d{3,4})\b/i);
        if (fnMatch) extractedFlightNum = fnMatch[1].toUpperCase();
      }
    }

    const page1 = await pdfJsDoc.getPage(1);
    const tc = await page1.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');

    const acMatch = rawText.match(/\b(HL\d{4})\b/i);
    if (acMatch) extractedAcReg = acMatch[1].toUpperCase();

    if (!extractedFlightNum) {
      const fnMatch = rawText.match(/\b(KE\d{3,4}|KAL\d{3,4})\b/i);
      if (fnMatch) extractedFlightNum = fnMatch[1].toUpperCase();
    }

    const dateMatch = rawText.match(/\b(\d{2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2})\b/i);
    if (dateMatch) extractedFileDate = dateMatch[1].toUpperCase();

  } catch (e) {
    console.warn("extractMetadata processing warning:", e);
  }
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
      const offset = (typeof detectPageOffset === 'function') ? detectPageOffset(rawText) : 0;
      const pageText=tc.items.map(it=> (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, offset) : it.str).join(' ');

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
            const matchItem = tc.items.find(it => /EQUAL/i.test((typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, offset) : it.str));
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

    if (notam1PageIdx !== undefined && typeof extractFirstTagAirports === 'function') {
      const notam1EndIdx = notam2PageIdx !== undefined ? notam2PageIdx : (notam3PageIdx !== undefined ? notam3PageIdx : numPages);
      notam1SubAirports = await extractFirstTagAirports(pdfJsDoc, notam1PageIdx, notam1EndIdx, ['DEP', 'DEST', 'ALTN']);
    }
    if (notam2PageIdx !== undefined && typeof extractAllTaggedAirports === 'function') {
      const notam2EndIdx = notam3PageIdx !== undefined ? notam3PageIdx : numPages;
      notam2SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam2PageIdx, notam2EndIdx, '(?:\\d+\\s*%\\s*)?ERA|EDTO|REFILE');
    }
    if (notam3PageIdx !== undefined && typeof extractAllTaggedAirports === 'function') {
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
        const pageOffset = (typeof detectPageOffset === 'function') ? detectPageOffset(rawPageText) : 0;

        const isDispatchPage = (dispatchReleaseIdx !== -1 && pi >= dispatchReleaseIdx && pi < dispatchEndIdx);
        const isNotamPage = (pkg1PageIdx !== -1 && pi >= pkg1PageIdx);

        if (pageOffset !== 0) {
          for (const item of content.items) {
            const originalStr = (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(item.str, pageOffset) : item.str;
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
            const sDec = (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, pageOffset) : it.str;
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
          const lineText = lineItems.map(it => (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(it.str, pageOffset) : it.str).join(' ');

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
                  const s = (typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(item.str, pageOffset) : item.str;
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

          const hasSentenceKw = SENTENCE_KW.some(kw => (typeof checkKeywordMatch === 'function') ? checkKeywordMatch(lineText, kw) : lineText.includes(kw));
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
            const decodedStr = ((typeof cleanAndDecodeItem === 'function') ? cleanAndDecodeItem(item.str, pageOffset) : item.str) || '';
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
                if (typeof drawCharRangeHighlight === 'function') {
                  drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                    PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);
                }
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
                if (typeof drawCharRangeHighlight === 'function') {
                  drawCharRangeHighlight(libPage, item, minCharIdx, maxCharIdx, sx, sy, pageOffset,
                    PDFLib.rgb(hlRGB[0], hlRGB[1], hlRGB[2]), 0.25, stdFont);
                }
                totalHits++;
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
