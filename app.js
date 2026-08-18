/**
 * app.js - Main Application logic for NOTAM Highlighter
 */

let resolvedWorkerUrl = '';
let libsReady = false;

const PRESETS = [
  'A/C','ACTUAL','AGTOW','ALERT LEVEL','ALTN','AMD','AMEND','AMDT','APMS','APPLY',
  'CAUTION','CCF','CDL','CFP PLAN','CHANGES','CLOSURE','CRZ','DIFFERENCE','DISC',
  'DO NOT USE','EDTO','EFB','ELDW','EMERGENCY','ENTRY POINT','ERA','ETP','EXC SKED',
  'EXC  SKED','FOD','FOM','ILS','KAL','KE NOT','KE ROUTE','LDW','MEL','MINIMA',
  'MOD TURB','MTOW','NO AFFECTED','NO KE','NO OPS RTE','NOT TO','OUT OF SERVICE',
  'OUTAGE','OVC','RA','REFILE','RQRD','RUNWAY','SH','TAKE OFF WEIGHT','TOW','TRIP',
  'TS','U/S','UNRELIABLE','UNSERVICEABLE','WX DEV'
];

let currentThemeName = 'blue';
let activeHlColorRGB = [0.36, 0.78, 1.0];
let sel = new Set();
let custom = [];
let pdfBytes = null;
let fname = 'document';
let done = false;
let outBytes = null;
let detectedAirports = [];
let iataAirports = [];
let bmEnabled = false; 
let extractedFileDate = '';
let extractedFlightNum = '';
let extractedAcReg = '';

// COLOR CHIP CONFIG
const COLOR_CONFIGS = {
  blue: [0.36, 0.78, 1.0],
  pink: [1.0, 0.45, 0.65],
  yellow: [1.0, 0.75, 0.0],
  green: [0.22, 0.85, 0.48]
};

// INITIALIZATION
async function initLibraries() {
  try {
    await loadScript('./pdf.min.js');
  } catch (e) {
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'); } 
    catch (err) { setStatus('error', 'Failed to load main PDF.js core.'); return; }
  }

  try {
    await loadScript('./pdf.worker.min.js');
    resolvedWorkerUrl = './pdf.worker.min.js';
  } catch (e) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js');
      resolvedWorkerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    } catch (err) { console.warn('Worker script pre-load skipped.'); }
  }

  try {
    await loadScript('./pdf-lib.min.js');
  } catch (e) {
    try { await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); } 
    catch (err) { setStatus('error', 'Failed to load PDF-Lib engine.'); return; }
  }

  if (window.location.protocol === 'file:') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = resolvedWorkerUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  libsReady = true;
  setStatus('ready', 'Engine ready. Upload PDF to start.');
}

initLibraries();


// DOM EVENT BINDING
document.addEventListener('DOMContentLoaded', () => {
  renderPresets();
  
  // Handlers
  const hlEnabled = document.getElementById('hlEnabled');
  if (hlEnabled) hlEnabled.addEventListener('change', toggleAllKeywords);

  const bmEnabledEl = document.getElementById('bmEnabled');
  if (bmEnabledEl) {
    bmEnabledEl.addEventListener('change', (e) => { 
      bmEnabled = e.target.checked; 
      done = false; 
      updRun(); 
    });
  }

  const dropBtn = document.getElementById('dropBtn');
  if (dropBtn) dropBtn.addEventListener('click', toggleDD);

  const cwInput = document.getElementById('cwInput');
  if (cwInput) cwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustom(); });

  const addCustomBtn = document.getElementById('addCustomBtn');
  if (addCustomBtn) addCustomBtn.addEventListener('click', addCustom);

  const runBtn = document.getElementById('runBtn');
  if (runBtn) runBtn.addEventListener('click', handleBtn);

  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', dlPDF);

  const downloadSelfBtn = document.getElementById('downloadSelfBtn');
  if (downloadSelfBtn) downloadSelfBtn.addEventListener('click', downloadSelf);

  // ==========================================
  // [수정된 파일 업로드 영역 이벤트 핸들러]
  // ==========================================
  const fi = document.getElementById('fi');
  const ua = document.getElementById('uploadArea');

  if (fi && ua) {
    // 1. Drop Area 및 Browse 버튼 클릭 시 hidden input 연결
    ua.addEventListener('click', (e) => {
      if (e.target !== fi) {
        fi.click();
      }
    });

    // 2. 파일 선택 창에서 파일이 선택되었을 때
    fi.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadFile(e.target.files[0]);
        e.target.value = ''; // 재업로드가 가능하도록 초기화
      }
    });

    // 3. 드래그 앤 드롭 지원
    ua.addEventListener('dragover', (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      ua.style.borderColor = '#3b82f6'; 
    });

    ua.addEventListener('dragleave', (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      ua.style.borderColor = ''; 
    });

    ua.addEventListener('drop', (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      ua.style.borderColor = '';
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles && droppedFiles[0] && droppedFiles[0].type === 'application/pdf') {
        loadFile(droppedFiles[0]);
      } else {
        alert('PDF 파일만 업로드할 수 있습니다.');
      }
    });
  }

  // Color chips
  document.querySelectorAll('.color-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const colorKey = e.currentTarget.getAttribute('data-color');
      if (COLOR_CONFIGS[colorKey]) {
        selectColor(colorKey, COLOR_CONFIGS[colorKey]);
      }
    });
  });

  // Library Download anchors
  document.querySelectorAll('.lib-download').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      forceDownload(e, a.href, a.getAttribute('data-file'));
    });
  });

  // Outside click for dropdown
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-wrap')) {
      const dropMenu = document.getElementById('dropMenu');
      const dropBtn = document.getElementById('dropBtn');
      if (dropMenu) dropMenu.style.display = 'none';
      if (dropBtn) dropBtn.classList.remove('open');
    }
  });
});

// UI HELPER FUNCTIONS
function canRun() { return (sel.size > 0 || bmEnabled) && pdfBytes !== null; }
function updRun() { document.getElementById('runBtn').className = 'action-btn run-btn' + (canRun() ? ' active' : ''); }
function handleBtn() { if (done) dlPDF(); else runHL(); }

function setStatus(cls, txt) {
  const b = document.getElementById('sb');
  b.className = 'status-bar' + (cls ? ' ' + cls : '');
  document.getElementById('st').textContent = txt;
}

function renderPresets() {
  const pl = document.getElementById('presetList');
  PRESETS.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'menu-item';
    d.innerHTML = `<input type="checkbox" id="p${i}"><label for="p${i}" style="cursor:pointer;flex:1">${w}</label>`;
    d.querySelector('input').addEventListener('change', e => {
      e.target.checked ? sel.add(w) : sel.delete(w);
      updBadge(); done = false; updRun();
    });
    pl.appendChild(d);
  });
}

function toggleAllKeywords(e) {
  const pl = document.getElementById('presetList');
  if (e.target.checked) {
    PRESETS.forEach(w => sel.add(w));
    pl.querySelectorAll('input').forEach(c => c.checked = true);
    custom.forEach(w => sel.add(w));
  } else {
    sel.clear();
    pl.querySelectorAll('input').forEach(c => c.checked = false);
  }
  updBadge(); done = false; updRun();
}

function selectColor(name, rgbArray) {
  currentThemeName = name;
  activeHlColorRGB = rgbArray;
  document.querySelectorAll('.color-chip').forEach(chip => chip.classList.remove('active'));
  document.getElementById('chip-' + name).classList.add('active');
  done = false;
  updRun();
}

function updBadge() {
  const t = sel.size, el = document.getElementById('selCount');
  el.textContent = t;
  el.className = 'badge-count' + (t > 0 && t >= PRESETS.length + custom.length ? ' all' : '');
}

function toggleDD() {
  const m = document.getElementById('dropMenu'), b = document.getElementById('dropBtn');
  const o = m.style.display === 'none';
  m.style.display = o ? 'block' : 'none';
  b.classList.toggle('open', o);
}

function addCustom() {
  const inp = document.getElementById('cwInput');
  inp.value.split(/[\s,]+/).map(w => w.trim().toUpperCase()).filter(w => w)
    .forEach(w => { if (!custom.includes(w) && !PRESETS.includes(w)) custom.push(w); });
  inp.value = '';
  custom.forEach(w => sel.add(w));
  renderTags(); updBadge(); done = false; updRun();
}

function renderTags() {
  const list = document.getElementById('tagList'); list.innerHTML = '';
  const tc = [['#ffe066','#1a1400'],['#5bde8a','#062210'],['#ff8fa3','#2a0008'],['#5bc8ff','#001a26'],['#ffa94d','#2a1000'],['#c084fc','#1a0030']];
  custom.forEach((w, i) => {
    const [bg, fg] = tc[i % tc.length];
    const t = document.createElement('div'); t.className = 'tag';
    t.style.cssText = `background:${bg};color:${fg}`;
    t.innerHTML = `${w}<span class="tag-remove" onclick="rmCustom(${i})">✕</span>`;
    list.appendChild(t);
  });
}

function rmCustom(i) {
  sel.delete(custom[i]);
  custom.splice(i, 1);
  renderTags(); updBadge(); done = false; updRun();
}

function loadFile(file) {
  fname = file.name.replace(/\.pdf$/i, '');
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('uploadArea').classList.add('has-file');
  pdfBytes = null; done = false; outBytes = null; 
  detectedAirports = []; iataAirports = [];
  extractedFileDate = ''; extractedFlightNum = ''; extractedAcReg = '';
  document.getElementById('previewCard').style.display = 'none';
  updRun();
  setStatus('processing', 'Loading local memory dump...');
  
  const r = new FileReader();
  r.onload = e => {
    pdfBytes = new Uint8Array(e.target.result);
    updRun();
    setStatus('ready', `${file.name} loaded. Press RUN to start with automatic auto-decoding.`);
  };
  r.onerror = () => setStatus('error', 'Failed to read local document.');
  r.readAsArrayBuffer(file);
}

// METADATA EXTRACTION
async function extractReleaseAirportsByRule2(pdfJsDoc) {
  const airports = []; iataAirports = [];
  try {
    for (let pNum = 1; pNum <= Math.min(30, pdfJsDoc.numPages); pNum++) {
      const page = await pdfJsDoc.getPage(pNum);
      const textContent = await page.getTextContent();
      const rawText = textContent.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const decodedRawText = textContent.items.map(it => decodeStr(it.str, offset)).join(' ');
      
      const isDispatchReleasePage = /DISPATCH\s+RELEASE\s+INFORMATION/i.test(decodedRawText) || /I\s+HEREBY\s+RELEASE/i.test(decodedRawText);

      if (airports.length === 0) {
        const m1 = /\bFLIGHT\s+RELEASE\s+[A-Z0-9]+\s+([A-Z]{4})[\/-]([A-Z]{4})\b/i.exec(decodedRawText);
        if (m1) airports.push(m1[1].toUpperCase().trim(), m1[2].toUpperCase().trim());
        else {
          const m2 = /\bETD\s+([A-Z]{4})\s+[A-Z0-9]+\s+ETA\s+([A-Z]{4})\b/i.exec(decodedRawText);
          if (m2) airports.push(m2[1].toUpperCase().trim(), m2[2].toUpperCase().trim());
          else if (isDispatchReleasePage) {
            const m3 = /I\s+HEREBY\s+RELEASE\s+(?:THE\s+)?FLIGHT.*?([A-Z]{4})\s*[\/-]\s*([A-Z]{4})\b/i.exec(decodedRawText);
            if (m3) airports.push(m3[1].toUpperCase().trim(), m3[2].toUpperCase().trim());
          }
        }
      }

      if (iataAirports.length === 0 && isDispatchReleasePage) {
        const mIata = /\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/g;
        let match;
        while ((match = mIata.exec(decodedRawText)) !== null) {
          const a = match[1].toUpperCase(), b = match[2].toUpperCase();
          const ignoreList = ['MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','JAN','FEB','MAR','APR'];
          if (!ignoreList.includes(a) && !ignoreList.includes(b)) {
            iataAirports.push(a, b);
            break;
          }
        }
      }

      if (iataAirports.length === 0) {
         const mHeader = /\b(?:KAL|KE)\s*\d+\s*\/\s*([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/i.exec(decodedRawText);
         if (mHeader) iataAirports.push(mHeader[1].toUpperCase().trim(), mHeader[2].toUpperCase().trim());
      }

      if (airports.length === 2 && iataAirports.length === 2) break; 
    }
  } catch (err) { console.warn("Airport code extraction failed: ", err); }
  return airports;
}

async function extractFirstTagAirports(pdfJsDoc, startPageIdx, endPageIdxExclusive, tags) {
  const found = {};
  if (startPageIdx === undefined || startPageIdx === -1) return [];
  const from = Math.max(0, startPageIdx);
  const to = Math.min(pdfJsDoc.numPages, endPageIdxExclusive);

  for (let pi = from; pi < to; pi++) {
    if (Object.keys(found).length === tags.length) break;
    const jsPage = await pdfJsDoc.getPage(pi + 1);
    const tc = await jsPage.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const lines = groupItemsIntoLines(tc.items, offset);

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
  const to = Math.min(pdfJsDoc.numPages, endPageIdxExclusive);
  const re = new RegExp('\\[\\s*(' + tagPattern + ')\\s*\\]\\s*([A-Z]{3,4})\\b', 'gi');

  for (let pi = from; pi < to; pi++) {
    const jsPage = await pdfJsDoc.getPage(pi + 1);
    const tc = await jsPage.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');
    const offset = detectPageOffset(rawText);
    const lines = groupItemsIntoLines(tc.items, offset);

    for (const line of lines) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line.text)) !== null) {
        const tagLabel = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
        const code = m[2].toUpperCase();
        results.push({ tag: tagLabel, code, pageIdx: pi, y: line.y });
      }
    }
  }
  return results;
}

async function extractMetadata(pdfJsDoc) {
  try {
    const scanPages = Math.min(5, pdfJsDoc.numPages);
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

    const acRegMatch = decodedText.match(/\bHL\d{4}\b/i);
    if (acRegMatch) extractedAcReg = acRegMatch[0].toUpperCase();

    const monthsMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
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
        if (dateMatchC) extractedFileDate = (monthsMap[dateMatchC[2].toLowerCase()] || '01') + dateMatchC[2].toLowerCase();
      }
    }
  } catch (err) { console.warn("Metadata extraction failed: ", err); }
}

// MAIN RUN ENGINE
async function runHL() {
  if (!canRun()) return;
  if (!libsReady) { setStatus('error', 'Required libraries not fully loaded.'); return; }

  const SENTENCE_KW = ['CLSD', 'CLOSED', 'RESTRICT', 'NOT AVBL', 'ALERT 4', 'ALERT4', 'TSRA', 'TSGR', 'TSGS', 'TSSN', 'FZRA', 'FZDZ', 'FZFG', 'GR', 'FC', 'SN', 'RA', 'BLSN', 'DS', 'SS'];
  const runBtn = document.getElementById('runBtn');
  runBtn.className = 'action-btn run-btn';
  runBtn.innerHTML = 'Processing locally...';
  setStatus('processing', 'Restoring text encoding & analyzing highlights...');
  done = false; outBytes = null; detectedAirports = []; iataAirports = [];
  document.getElementById('previewCard').style.display = 'none';

  await new Promise(r => setTimeout(r, 50));

  try {
    const extraKws = [];
    if (extractedAcReg) extraKws.push(extractedAcReg);
    const keywords = [...sel, ...extraKws].sort((a,b) => b.length - a.length);
    const hlRGB = activeHlColorRGB;

    let pdfJsDoc;
    try {
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;
    } catch(err) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      pdfJsDoc = await pdfjsLib.getDocument({data: pdfBytes.buffer.slice(0)}).promise;
    }
    
    const numPages = pdfJsDoc.numPages;
    const pdfLibDoc = await PDFLib.PDFDocument.load(pdfBytes, {ignoreEncryption: true});
    const libPages = pdfLibDoc.getPages();
    const stdFont = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    detectedAirports = await extractReleaseAirportsByRule2(pdfJsDoc);
    await extractMetadata(pdfJsDoc);

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
    for (let pi = 0; pi < numPages; pi++) {
      const jsPage2 = await pdfJsDoc.getPage(pi + 1);
      const tc = await jsPage2.getTextContent();
      const rawText = tc.items.map(it => it.str).join(' ');
      const offset = detectPageOffset(rawText);
      const pageText = tc.items.map(it => cleanAndDecodeItem(it.str, offset)).join(' ');
      
      for (const bm of BOOKMARK_PATTERNS) {
        if (bmPages[bm.label] !== undefined) continue;
        if (bm.pattern.test(pageText)) {
          bmPages[bm.label] = pi;
          if (bm.label === 'EQUAL TIME POINT DATA') {
            const matchItem = tc.items.find(it => /EQUAL/i.test(cleanAndDecodeItem(it.str, offset)));
            if (matchItem) edtoBookmarkY = matchItem.transform[5];
          }
        }
      }
    }

    const pkg3StartIdx = bmPages['NOTAM 3'] ?? -1;
    const dispatchReleaseIdx = bmPages['DISPATCH RELEASE INFORMATION'] ?? -1;
    const weatherBriefingIdx = bmPages['WEATHER BRIEFING'] ?? -1;
    const pkg1PageIdx = bmPages['NOTAM 1'] ?? -1;

    let dispatchEndIdx = numPages;
    if (weatherBriefingIdx !== -1) dispatchEndIdx = weatherBriefingIdx;
    else if (pkg1PageIdx !== -1) dispatchEndIdx = pkg1PageIdx;
    else if (pkg3StartIdx !== -1) dispatchEndIdx = pkg3StartIdx;

    const notam1PageIdx = bmPages['NOTAM 1'];
    const notam2PageIdx = bmPages['NOTAM 2'];
    const notam3PageIdx = bmPages['NOTAM 3'];

    let notam1SubAirports = [], notam2SubAirports = [], notam3SubAirports = [];
    if (notam1PageIdx !== undefined) {
      const notam1EndIdx = notam2PageIdx ?? (notam3PageIdx ?? numPages);
      notam1SubAirports = await extractFirstTagAirports(pdfJsDoc, notam1PageIdx, notam1EndIdx, ['DEP', 'DEST', 'ALTN']);
    }
    if (notam2PageIdx !== undefined) {
      const notam2EndIdx = notam3PageIdx ?? numPages;
      notam2SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam2PageIdx, notam2EndIdx, '(?:\\d+\\s*%\\s*)?ERA|EDTO');
    }
    if (notam3PageIdx !== undefined) {
      notam3SubAirports = await extractAllTaggedAirports(pdfJsDoc, notam3PageIdx, numPages, 'FIR');
    }

    const edtoPointDataPageIdx = bmPages['EQUAL TIME POINT DATA'] ?? -1;
    let totalHits = 0;

    if (sel.size > 0) {
      setStatus('processing', 'Calculating highlight positions and drawing...');

      for (let pi = 0; pi < numPages; pi++) {
        const jsPage = await pdfJsDoc.getPage(pi + 1);
        const vp = jsPage.getViewport({scale: 1.0});
        const libPage = libPages[pi];
        const {width: lw, height: lh} = libPage.getSize();
        const sx = lw / vp.width, sy = lh / vp.height;
        const content = await jsPage.getTextContent();
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
              try {
                libPage.drawText(asciiStr, {
                  x: tx[4] * sx,
                  y: tx[5] * sy,
                  size: (Math.abs(tx[3]) || 10) * sy,
                  font: stdFont,
                  color: PDFLib.rgb(0, 0, 0),
                  opacity: 0.0 
                });
              } catch (err) { console.warn("Search layer injection skipped", err); }
            }
          }
        }

        const groupedLines = [];
        const sortedItems = content.items
          .filter(it => cleanAndDecodeItem(it.str, pageOffset)?.trim())
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
            
            for (const pair of [detectedAirports, iataAirports]) {
              if (pair.length === 2) {
                const a = pair[0].toUpperCase(), b = pair[1].toUpperCase();
                if (cleanLineTextUpper.includes(`${a}/${b}`) || cleanLineTextUpper.includes(`${a}-${b}`) || cleanLineTextUpper.includes(`${a}TO${b}`) || cleanLineTextUpper.includes(`${a}${b}`)) {
                  hasRouteStr = true; break;
                }
              }
            }

            if (hasRouteStr) {
              const minX = Math.min(...lineItems.map(it => it.transform[4]));
              const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
              const rh = (Math.abs(lineItems[0].transform[3]) || 10) * sy;

              libPage.drawRectangle({
                x: minX * sx - 2,
                y: (line.y * sy) - (rh * 0.2), 
                width: (maxX - minX) * sx + 4,
                height: Math.max(rh * 1.2, 8), 
                color: PDFLib.rgb(...hlRGB),
                opacity: 0.25 
              });
              totalHits++;
              continue;
            }
          }

          if (/\betp\s*[1-5]/i.test(lineText) && isAfterEdtoHeader) {
            const minX = Math.min(...lineItems.map(it => it.transform[4]));
            const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
            const rh = (Math.abs(lineItems[0].transform[3]) || 10) * sy;

            libPage.drawRectangle({
              x: minX * sx,
              y: (line.y * sy) - (rh * 0.2), 
              width: (maxX - minX) * sx,
              height: Math.max(rh * 1.2, 8), 
              color: PDFLib.rgb(...hlRGB),
              opacity: 0.25
            });
            totalHits++;
            continue; 
          }

          if (/\/\s*[A-Z]{4}\s+FIR/i.test(lineText)) {
            const match = /\bFIR\b/i.exec(lineText);
            if (match) {
              const wordMatch = lineText.substring(match.index + match[0].length).match(/[A-Za-z]{3,}/);
              if (wordMatch) {
                const targetWord = wordMatch[0];
                for (const item of lineItems) {
                  const s = cleanAndDecodeItem(item.str, pageOffset);
                  const idx = s.toUpperCase().indexOf(targetWord.toUpperCase());
                  if (idx !== -1) {
                    const charW = (item.width || 0) / Math.max(s.length, 1);
                    const itemH = Math.abs(item.transform[3]) || 10;
                    libPage.drawRectangle({
                      x: (item.transform[4] + idx * charW) * sx,
                      y: item.transform[5] * sy - (itemH * sy * 0.2),
                      width: Math.max(targetWord.length * charW * sx, 4),
                      height: Math.max(itemH * sy * 1.2, 8),
                      color: PDFLib.rgb(...hlRGB),
                      opacity: 0.25
                    });
                    totalHits++;
                  }
                }
              }
            }
            continue; 
          }

          if (SENTENCE_KW.some(kw => checkKeywordMatch(lineText, kw))) {
            const minX = Math.min(...lineItems.map(it => it.transform[4]));
            const maxX = Math.max(...lineItems.map(it => it.transform[4] + (it.width || 0)));
            const rh = (Math.abs(lineItems[0].transform[3]) || 10) * sy;

            libPage.drawRectangle({
              x: minX * sx,
              y: (line.y * sy) - (rh * 0.2), 
              width: (maxX - minX) * sx,
              height: Math.max(rh * 1.2, 8), 
              color: PDFLib.rgb(...hlRGB),
              opacity: 0.25
            });
            totalHits++;
            continue; 
          }

          const charMapping = [];
          for (let i = 0; i < lineItems.length; i++) {
            const decodedStr = cleanAndDecodeItem(lineItems[i].str, pageOffset) || '';
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

            let m, lastIndex = -1;
            while ((m = re.exec(cleanLineText)) !== null) {
              if (re.lastIndex === lastIndex) { re.lastIndex++; continue; }
              lastIndex = re.lastIndex;

              const startIdx = m.index, endIdx = startIdx + m[0].length;
              if ((kw.toUpperCase() === 'MEL' || kw.toUpperCase() === 'CDL') && (lineTextFromMapping[startIdx - 1] === '/' || lineTextFromMapping[endIdx] === '/')) continue;

              const itemMatches = {};
              for (let c = startIdx; c < endIdx; c++) {
                const map = charMapping[c];
                if (map && !map.isSeparator) {
                  (itemMatches[map.itemIndex] = itemMatches[map.itemIndex] || []).push(map.charIndex);
                }
              }

              for (const [itemIdxStr, charIndices] of Object.entries(itemMatches)) {
                if (charIndices.length === 0) continue;
                drawCharRangeHighlight(libPage, lineItems[itemIdxStr], Math.min(...charIndices), Math.max(...charIndices), sx, sy, pageOffset, PDFLib.rgb(...hlRGB), 0.25);
                totalHits++;
              }
            }
          }

          // DOF Highlight
          const dofMatch = /\bDOF\s+(\d{6})\b/i.exec(cleanLineText);
          if (dofMatch) {
            const dStart = dofMatch.index + dofMatch[0].length - 6, dEnd = dStart + 6;
            const dItemMatches = {};
            for (let c = dStart; c < dEnd; c++) {
              const map = charMapping[c];
              if (map && !map.isSeparator) (dItemMatches[map.itemIndex] = dItemMatches[map.itemIndex] || []).push(map.charIndex);
            }
            for (const [itemIdxStr, charIndices] of Object.entries(dItemMatches)) {
              if (charIndices.length === 0) continue;
              drawCharRangeHighlight(libPage, lineItems[itemIdxStr], Math.min(...charIndices), Math.max(...charIndices), sx, sy, pageOffset, PDFLib.rgb(...hlRGB), 0.25);
              totalHits++;
            }
          }

          // Wind Shear Highlight
          if (lineTextFromMapping.includes('---')) {
            const shearRegex = /\b\d{5}[A-Za-z ]\d{3}\s+([0-9]{2})\b/g;
            let shrM, lastShrIdx = -1;
            while ((shrM = shearRegex.exec(cleanLineText)) !== null) {
              if (shearRegex.lastIndex === lastShrIdx) { shearRegex.lastIndex++; continue; }
              lastShrIdx = shearRegex.lastIndex;

              if (parseInt(shrM[1], 10) >= 5) { 
                const startIdx = shrM.index + shrM[0].length - shrM[1].length;
                const endIdx = startIdx + shrM[1].length;
                const itemMatches = {};
                for (let c = startIdx; c < endIdx; c++) {
                  const map = charMapping[c];
                  if (map && !map.isSeparator) (itemMatches[map.itemIndex] = itemMatches[map.itemIndex] || []).push(map.charIndex);
                }
                for (const [itemIdxStr, charIndices] of Object.entries(itemMatches)) {
                  if (charIndices.length === 0) continue;
                  drawCharRangeHighlight(libPage, lineItems[itemIdxStr], Math.min(...charIndices), Math.max(...charIndices), sx, sy, pageOffset, PDFLib.rgb(...hlRGB), 0.25);
                  totalHits++;
                }
              }
            }
          }

          // MSA Highlight
          const msaMatch = lineText.match(/---\s*\/\s*(\d{3})\b/i);
          if (msaMatch && parseInt(msaMatch[1], 10) >= 100) {
            const targetMsaStr = msaMatch[1];
            for (const item of lineItems) {
              const s = cleanAndDecodeItem(item.str, pageOffset);
              let idx = s.indexOf("/" + targetMsaStr);
              if (idx !== -1) {
                drawCharRangeHighlight(libPage, item, idx + 1, idx + targetMsaStr.length, sx, sy, pageOffset, PDFLib.rgb(...hlRGB), 0.25);
                totalHits++;
              } else if (s === targetMsaStr) {
                drawCharRangeHighlight(libPage, item, 0, targetMsaStr.length - 1, sx, sy, pageOffset, PDFLib.rgb(...hlRGB), 0.25);
                totalHits++;
              }
            }
          }
        }
      }
    }

    // AC Registration Check
    if (extractedAcReg) {
      const regAlnum = extractedAcReg.replace(/[^A-Z0-9]/g, '');
      const regEsc = regAlnum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (let pi = 0; pi < numPages; pi++) {
        const aJsPage = await pdfJsDoc.getPage(pi + 1);
        const aLibPage = libPages[pi];
        const { width: aLw, height: aLh } = aLibPage.getSize();
        const aVp = aJsPage.getViewport({ scale: 1.0 });
        const aSx = aLw / aVp.width, aSy = aLh / aVp.height;
        const aContent = await aJsPage.getTextContent();
        const aOff = detectPageOffset(aContent.items.map(it => it.str).join(' '));

        const aLines = [];
        const aSorted = aContent.items
          .filter(it => cleanAndDecodeItem(it.str, aOff)?.trim())
          .sort((a, b) => b.transform[5] - a.transform[5]);

        for (const it of aSorted) {
          const y = it.transform[5];
          let joined = false;
          for (const ln of aLines) {
            if (Math.abs(ln.y - y) < 4.0) { ln.items.push(it); joined = true; break; }
          }
          if (!joined) aLines.push({ y, items: [it] });
        }

        for (const aLine of aLines) {
          const lineItems = aLine.items.sort((a, b) => a.transform[4] - b.transform[4]);
          const cm = [];
          for (let i = 0; i < lineItems.length; i++) {
            const dec = cleanAndDecodeItem(lineItems[i].str, aOff) || '';
            if (i > 0) cm.push({ sep: true });
            for (let ci = 0; ci < dec.length; ci++) cm.push({ ii: i, ci, ch: dec[ci] });
          }
          const lineRaw = cm.map(m => m.sep ? ' ' : m.ch).join('');
          const clean = lineRaw.replace(/[^A-Za-z0-9]/g, ' ');

          if (regEsc) {
            const lineUpper = lineRaw.toUpperCase().replace(/\s+/g, '');
            let isRouteLine = false;
            for (const pair of [detectedAirports, iataAirports]) {
              if (pair.length === 2) {
                const a = pair[0].toUpperCase(), b = pair[1].toUpperCase();
                if (lineUpper.includes(`${a}/${b}`) || lineUpper.includes(`${a}-${b}`) || lineUpper.includes(`${a}TO${b}`) || lineUpper.includes(`${a}${b}`)) {
                  isRouteLine = true; break;
                }
              }
            }
            if (!isRouteLine) {
              let re; try { re = new RegExp(`\\b${regEsc}\\b`, 'gi'); } catch(e) { re = new RegExp(regEsc, 'gi'); }
              let m;
              while ((m = re.exec(clean)) !== null) {
                const buckets = {};
                for (let c = m.index; c < m.index + m[0].length; c++) {
                  const map = cm[c];
                  if (map && !map.sep) (buckets[map.ii] = buckets[map.ii] || []).push(map.ci);
                }
                for (const [iiStr, cis] of Object.entries(buckets)) {
                  drawCharRangeHighlight(aLibPage, lineItems[+iiStr], Math.min(...cis), Math.max(...cis), aSx, aSy, aOff, PDFLib.rgb(...hlRGB), 0.25);
                  totalHits++;
                }
              }
            }
          }
        }
      }
    }

    // Outline / Bookmarks
    const ctx = pdfLibDoc.context;
    const outlineItems = [];
    const bmLabelToRef = {};
    for (const bm of BOOKMARK_PATTERNS) {
      const pi = bmPages[bm.label]; if (pi === undefined) continue;
      const pageRef = pdfLibDoc.getPage(pi).ref;
      let dest;
      if (bm.label === 'EQUAL TIME POINT DATA' && typeof edtoBookmarkY === 'number') {
        const topY = Math.max(0, Math.min(pdfLibDoc.getPage(pi).getHeight(), edtoBookmarkY + 30));
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)]);
      } else {
        dest = ctx.obj([pageRef, PDFLib.PDFName.of('Fit')]);
      }
      const itemRef = ctx.register(ctx.obj({Title: PDFLib.PDFString.of(bm.label), Dest: dest}));
      outlineItems.push(itemRef);
      bmLabelToRef[bm.label] = itemRef;
    }

    function attachSubBookmarks(parentLabel, subAirports) {
      const parentRef = bmLabelToRef[parentLabel];
      if (!parentRef || !subAirports || subAirports.length === 0) return;
      const parentDict = ctx.lookup(parentRef);
      const childRefs = subAirports.map(item => {
        const childPage = pdfLibDoc.getPage(item.pageIdx);
        const topY = Math.max(0, Math.min(childPage.getHeight(), (typeof item.y === 'number' ? item.y + 30 : childPage.getHeight())));
        const childDest = (typeof item.y === 'number')
          ? ctx.obj([childPage.ref, PDFLib.PDFName.of('XYZ'), PDFLib.PDFNumber.of(0), PDFLib.PDFNumber.of(topY), PDFLib.PDFNumber.of(0)])
          : ctx.obj([childPage.ref, PDFLib.PDFName.of('Fit')]);
        return ctx.register(ctx.obj({Title: PDFLib.PDFString.of(item.title || `${item.tag} ${item.code}`.trim()), Dest: childDest, Parent: parentRef}));
      });

      for (let i = 0; i < childRefs.length; i++) {
        const d = ctx.lookup(childRefs[i]);
        if (i > 0) d.set(PDFLib.PDFName.of('Prev'), childRefs[i-1]);
        if (i < childRefs.length - 1) d.set(PDFLib.PDFName.of('Next'), childRefs[i+1]);
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

    if (outlineItems.length > 0) {
      for (let i = 0; i < outlineItems.length; i++) {
        const d = ctx.lookup(outlineItems[i]);
        if (i > 0) d.set(PDFLib.PDFName.of('Prev'), outlineItems[i-1]);
        if (i < outlineItems.length - 1) d.set(PDFLib.PDFName.of('Next'), outlineItems[i+1]);
      }
      const outlineRef = ctx.register(ctx.obj({Type: PDFLib.PDFName.of('Outlines'), First: outlineItems[0], Last: outlineItems[outlineItems.length-1], Count: PDFLib.PDFNumber.of(outlineItems.length)}));
      for (const ref of outlineItems) ctx.lookup(ref).set(PDFLib.PDFName.of('Parent'), outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlineRef);
      pdfLibDoc.catalog.set(PDFLib.PDFName.of('PageMode'), PDFLib.PDFName.of('UseOutlines'));
    }

    // CFP PLAN Handling
    let routeTokens = [], discFuel = '', discTime = '', extractedEtd = '', extractedEta = '';
    let suitableMap = {};

    const cfpPageIdx = bmPages['CFP PLAN'];
    const resolvedCoaPageIdx = bmPages['COPY OF ATS'] ?? -1;
    let foundCoaPageOffset = 0;

    if (resolvedCoaPageIdx !== -1) {
      const coaRawContent = await (await pdfJsDoc.getPage(resolvedCoaPageIdx + 1)).getTextContent();
      foundCoaPageOffset = detectPageOffset(coaRawContent.items.map(it => it.str).join(' '));
    }

    if (cfpPageIdx !== undefined) {
      const cfpJsPage = await pdfJsDoc.getPage(cfpPageIdx + 1);
      const cfpContent = await cfpJsPage.getTextContent();
      const cfpOffset = detectPageOffset(cfpContent.items.map(it => it.str).join(' '));
      const cfpLibPage = libPages[cfpPageIdx];
      const { width: cfpW } = cfpLibPage.getSize();
      const cfpSx = cfpW / cfpJsPage.getViewport({scale: 1.0}).width;
      const cfpSy = cfpLibPage.getSize().height / cfpJsPage.getViewport({scale: 1.0}).height;

      const cfpItems = cfpContent.items.slice().sort((a,b) => (Math.abs(a.transform[5] - b.transform[5]) > 2) ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4]);
      
      let cfpFullTextWithNewlines = "";
      let lastY = null;
      for (const item of cfpItems) {
        const decodedStr = cleanAndDecodeItem(item.str, cfpOffset);
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 4.5) cfpFullTextWithNewlines += "\n";
        cfpFullTextWithNewlines += decodedStr + " ";
        lastY = item.transform[5];
      }

      // TRIP Calc Logic
      const tripMatch = cfpFullTextWithNewlines.match(/\bTRIP\s+(\d{3,5})\s+(\d{2})\.(\d{2})\b/i);
      if (tripMatch) {
        const totalMinutes = parseTripTimeToMinutes(tripMatch[2], tripMatch[3]);
        let formattedCalcText = "";

        if (totalMinutes >= 690) { // >= 11:30
          formattedCalcText = `(Duty time ${formatMinutesToHHMM(Math.round(totalMinutes / 2))})`;
        } else if (totalMinutes >= 450) { // >= 7:30
          formattedCalcText = `(Duty Time ${formatMinutesToHHMM(Math.round((totalMinutes * 2) / 3))} (${formatMinutesToHHMM(Math.round(totalMinutes / 3))}))`;
        }

        if (formattedCalcText) {
          let secondLineY = null, secondLineMaxX = null, secondLineFS = 10;
          for (const item of cfpItems) {
            if (/2ND/i.test(cleanAndDecodeItem(item.str, cfpOffset))) {
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

            const srcMidY = secondLineY + secondLineFS * (0.72 - 0.19) / 2;
            const annotBaseY = (srcMidY - 9 * (0.72 - 0.19) / 2) * cfpSy;
            drawAnnotatedBadge(cfpLibPage, formattedCalcText, stdFont, (secondLineMaxX + 10) * cfpSx, annotBaseY, cfpSy);
            totalHits++;
          }
        }
      }

      // Extract Route and ETD/ETA
      const distIdx = cfpFullTextWithNewlines.search(/DIST\s+LATITUDE/i);
      let extractedRoute = "";
      if (distIdx !== -1) {
        const lines = cfpFullTextWithNewlines.substring(0, distIdx).split('\n').map(l => l.trim()).filter(l => l);
        let routeStartLine = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (/2ND/i.test(lines[i])) { routeStartLine = i + 1; break; }
        }
        if (routeStartLine !== -1 && routeStartLine < lines.length) extractedRoute = lines.slice(routeStartLine).join(' ').trim();
      }

      if (extractedRoute) {
        const noiseWords = ['FLIGHT', 'PLAN', 'FUEL', 'TIME', 'WIND', 'TEMP', 'DIST', 'COMP', 'FREQ', 'RMK', 'ALTN', 'AWY', 'POS', 'LAT', 'LONG', 'ETA', 'ETD', 'ACTL', 'TOC', 'CLB', 'CRZ', 'DSC', 'IFR', 'NAM', 'AGTOW', 'TRIP', 'SOW', 'RWY', 'RESERVE', 'FINAL', 'RES', 'CONT', 'REFILE', 'RQD', 'TAKEOFF', 'DISC', 'TANKERING', 'PLN', 'RAMP', 'OUT', 'FOD', 'ROD', 'TOW', 'MTOW', 'LDW', 'MLDW', 'TIF', 'TCAP', 'PAX', 'CGO'];
        routeTokens = extractedRoute.replace(/\.\./g, ' ').replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/)
            .filter(t => t.length >= 2 && !noiseWords.includes(t.toUpperCase()) && !/^\d+$/.test(t));
      }

      const discMatch = cfpFullTextWithNewlines.match(/\bDISC\b\s+(\d{4})\s+(\d{2}\.\d{2})/i);
      if (discMatch) { discFuel = discMatch[1]; discTime = discMatch[2]; }

      const etdEtaMatch = cfpFullTextWithNewlines.match(/\bETD\s+([A-Z]{3,4})\s+(\d{4}Z)\s+ETA\s+([A-Z]{3,4})\s+(\d{4}Z)/i);
      if (etdEtaMatch) {
        extractedEtd = `${etdEtaMatch[1].toUpperCase()} ${etdEtaMatch[2].toUpperCase()}`;
        extractedEta = `${etdEtaMatch[3].toUpperCase()} ${etdEtaMatch[4].toUpperCase()}`;
      }
    }

    // DISC Fuel Badge in Dispatch Release
    if (discFuel && discTime && dispatchReleaseIdx !== -1) {
      const drJsPage = await pdfJsDoc.getPage(dispatchReleaseIdx + 1);
      const drContent = await drJsPage.getTextContent();
      const drOffset = detectPageOffset(drContent.items.map(it => it.str).join(' '));
      const drLibPage = libPages[dispatchReleaseIdx];
      const drSx = drLibPage.getSize().width / drJsPage.getViewport({scale:1.0}).width;
      const drSy = drLibPage.getSize().height / drJsPage.getViewport({scale:1.0}).height;

      let notesY = null, notesRightX = null, notesFS = 10, dispatchItem = null;
      for (const item of drContent.items) {
        const s = cleanAndDecodeItem(item.str, drOffset);
        if (/DISPATCH\s*NOTES/i.test(s)) {
          notesY = item.transform[5]; notesFS = Math.abs(item.transform[3]) || 10; notesRightX = item.transform[4] + (item.width || 0);
          break;
        }
        if (s.trim().toUpperCase() === 'DISPATCH') { dispatchItem = item; continue; }
        if (s.trim().toUpperCase() === 'NOTES' && dispatchItem && Math.abs(item.transform[5] - dispatchItem.transform[5]) < 5) {
          notesY = item.transform[5]; notesFS = Math.abs(item.transform[3]) || 10; notesRightX = item.transform[4] + (item.width || 0);
          break;
        }
      }

      if (notesY !== null) {
        const annotBaseY = (notesY + notesFS * (0.72 - 0.19) / 2 - 9 * (0.72 - 0.19) / 2) * drSy;
        drawAnnotatedBadge(drLibPage, `DISC FUEL INFO  ${discFuel}  ${discTime}`, stdFont, (notesRightX + 10) * drSx, annotBaseY, drSy, 9, [0.98, 0.50, 0.35]);
      }
    }

    // Suitable Map Search
    if (cfpPageIdx !== undefined) {
      const cfpSectionEnd = Math.min(notam1PageIdx ?? cfpPageIdx + 20, numPages);
      for (let pi = cfpPageIdx; pi < cfpSectionEnd; pi++) {
        const scanTc = await (await pdfJsDoc.getPage(pi + 1)).getTextContent();
        const scanText = scanTc.items.map(it => cleanAndDecodeItem(it.str, detectPageOffset(scanTc.items.map(it => it.str).join(' ')))).join(' ');
        if (/ENROUTE\s+ALTERNATES/i.test(scanText)) {
          const suitRe = /\b([A-Z]{3,4})\s+SUITABLE\s+FROM\s+(\d{4})\s+UTC\s*\/\s*TO\s+(\d{4})\s+UTC/gi;
          let sm;
          while ((sm = suitRe.exec(scanText)) !== null) suitableMap[sm[1].toUpperCase()] = `From ${sm[2]}Z To ${sm[3]}Z`;
          break;
        }
      }
    }

    // Draw Suitable Badges
    if (Object.keys(suitableMap).length > 0 && notam1PageIdx !== undefined) {
      const tagRe = /\[\s*(ERA|EDTO|REFILE|\d+\s*%\s*ERA)\s*\]\s*([A-Z]{3,4})\b/gi;
      for (let pi = notam1PageIdx; pi < numPages; pi++) {
        const jsPage = await pdfJsDoc.getPage(pi + 1);
        const tc = await jsPage.getTextContent();
        const offset = detectPageOffset(tc.items.map(it => it.str).join(' '));
        const lines = groupItemsIntoLines(tc.items, offset);
        const libPage = libPages[pi];
        const lw = libPage.getSize().width;
        const sy = libPage.getSize().height / jsPage.getViewport({scale: 1.0}).height;

        for (const line of lines) {
          tagRe.lastIndex = 0;
          let m;
          while ((m = tagRe.exec(line.text)) !== null) {
            const airport = m[2].toUpperCase();
            if (!suitableMap[airport]) continue;
            const fullText = `${airport} ${suitableMap[airport]}`;
            const textWidth = stdFont.widthOfTextAtSize(fullText, 9);
            const annotStartX = lw - textWidth - 36;
            const srcFS = Math.abs(line.parts[0].item.transform[3]) || 10;
            const annotBaseY = (line.y * sy + srcFS * sy * (0.72 - 0.19) / 2) - 9 * (0.72 - 0.19) / 2;

            drawAnnotatedBadge(libPage, fullText, stdFont, annotStartX, annotBaseY, sy, 9, [0.98, 0.50, 0.35]);
            totalHits++;
          }
        }
      }
    }

    // DEP/DEST Annotations
    const tagTimeMap = {};
    if (extractedEtd) tagTimeMap['DEP'] = extractedEtd;
    if (extractedEta) tagTimeMap['DEST'] = extractedEta;

    if (Object.keys(tagTimeMap).length > 0 && notam1SubAirports.length > 0) {
      for (const subAirport of notam1SubAirports) {
        const timeText = tagTimeMap[subAirport.tag];
        if (!timeText || subAirport.maxX === undefined) continue;
        const pi = subAirport.pageIdx;
        const jsP = await pdfJsDoc.getPage(pi + 1);
        const sx = libPages[pi].getSize().width / jsP.getViewport({scale:1.0}).width;
        const sy = libPages[pi].getSize().height / jsP.getViewport({scale:1.0}).height;
        const depSrcFS = subAirport.fontSize || 10;
        const depBaseY = (subAirport.y * sy + depSrcFS * sy * (0.72 - 0.19) / 2) - 9 * (0.72 - 0.19) / 2;

        drawAnnotatedBadge(libPages[pi], timeText, stdFont, (subAirport.maxX + 8) * sx, depBaseY, sy, 9, [0.98, 0.50, 0.35]);
      }
    }

    outBytes = await pdfLibDoc.save();
    done = true;
    runBtn.className = 'action-btn dl-btn active';
    runBtn.innerHTML = 'DOWNLOAD PDF FILE';
    
    setStatus('done', `Completed! ${numPages} pages, ${totalHits} elements highlighted, ${Object.keys(bmPages).length} bookmarks set.`);
    document.getElementById('previewCard').style.display = 'block';
    dlPDF();

  } catch(err) {
    setStatus('error', 'Execution error: ' + err.message);
    runBtn.className = 'action-btn run-btn active';
    runBtn.innerHTML = 'RUN ENGINE';
  }
}

function dlPDF() {
  if (!done || !outBytes) return;
  try {
    const blob = new Blob([outBytes], {type: 'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let routeCode = "";
    if (detectedAirports?.length === 2) routeCode = `_${detectedAirports[0]}_${detectedAirports[1]}`;
    else if (iataAirports?.length === 2) routeCode = `_${iataAirports[0]}_${iataAirports[1]}`;

    let downloadName = (extractedFileDate && extractedFlightNum) ? `${extractedFileDate}_${extractedFlightNum}${routeCode}_highlighted.pdf`
      : (extractedFlightNum ? `${extractedFlightNum}${routeCode}_highlighted.pdf` : fname + '_highlighted.pdf');
    
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e) {
    setStatus('error', 'Failed to write PDF: ' + e.message);
  }
}

function forceDownload(event, url, filename) {
  const btn = event.currentTarget;
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.style.pointerEvents = 'none';
  btn.style.opacity = '0.6';

  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const localUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = localUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(localUrl), 300);
    })
    .catch(() => window.open(url, '_blank'))
    .finally(() => {
      btn.textContent = originalText;
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    });
}

function downloadSelf() {
  const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Text_Highlighter_Offline.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}
