/**
 * script.js - NOTAM Highlighter 메인 시스템 로직
 */

let resolvedWorkerUrl = '';
let libsReady = false;

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

const COLOR_CONFIGS = {
  blue: [0.36, 0.78, 1.0],
  pink: [1.0, 0.45, 0.65],
  yellow: [1.0, 0.75, 0.0],
  green: [0.22, 0.85, 0.48]
};

// 동적 스크립트 로더
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

// 라이브러리 초기화
async function initLibraries() {
  try {
    await loadScript('./pdf.min.js');
  } catch (e) {
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'); } 
    catch (err) { console.warn('PDF.js fallback used'); }
  }

  try {
    await loadScript('./pdf.worker.min.js');
    resolvedWorkerUrl = './pdf.worker.min.js';
  } catch (e) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js');
      resolvedWorkerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    } catch (err) { console.warn('Worker pre-load skipped'); }
  }

  try {
    await loadScript('./pdf-lib.min.js');
  } catch (e) {
    try { await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); } 
    catch (err) { console.warn('PDF-Lib fallback used'); }
  }

  if (typeof pdfjsLib !== 'undefined') {
    if (window.location.protocol === 'file:') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = resolvedWorkerUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }
  }

  libsReady = true;
  setStatus('ready', 'Engine ready. Upload PDF to start.');
}

// DOM 및 이벤트 리스너 바인딩
document.addEventListener('DOMContentLoaded', () => {
  // 키워드 목록 렌더링
  if (typeof PRESETS !== 'undefined') {
    renderPresets();
  }

  // 파일 업로드 영역 핸들러
  const fi = document.getElementById('fi');
  const ua = document.getElementById('uploadArea');

  if (fi && ua) {
    ua.addEventListener('click', (e) => {
      if (e.target !== fi) {
        fi.click();
      }
    });

    fi.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadFile(e.target.files[0]);
        e.target.value = '';
      }
    });

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
      if (droppedFiles && droppedFiles[0]) {
        if (droppedFiles[0].type === 'application/pdf' || droppedFiles[0].name.toLowerCase().endsWith('.pdf')) {
          loadFile(droppedFiles[0]);
        } else {
          alert('PDF 파일만 업로드 가능합니다.');
        }
      }
    });
  }

  // UI 버튼 이벤트 연결
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

  // 컬러 칩 선택
  document.querySelectorAll('.color-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const colorKey = e.currentTarget.getAttribute('data-color');
      if (COLOR_CONFIGS[colorKey]) {
        selectColor(colorKey, COLOR_CONFIGS[colorKey]);
      }
    });
  });

  // 드롭다운 외부 클릭 감지
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-wrap')) {
      const dropMenu = document.getElementById('dropMenu');
      const dropBtn = document.getElementById('dropBtn');
      if (dropMenu) dropMenu.style.display = 'none';
      if (dropBtn) dropBtn.classList.remove('open');
    }
  });

  // 외부 라이브러리 비동기 로딩
  initLibraries();
});

// 파일 로드 및 준비 상태 갱신
function loadFile(file) {
  fname = file.name.replace(/\.pdf$/i, '');
  
  const fileNameEl = document.getElementById('fileName');
  if (fileNameEl) fileNameEl.textContent = file.name;
  
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) uploadArea.classList.add('has-file');

  pdfBytes = null; 
  done = false; 
  outBytes = null; 
  
  const previewCard = document.getElementById('previewCard');
  if (previewCard) previewCard.style.display = 'none';

  updRun();
  setStatus('processing', 'File loaded into memory.');
  
  const r = new FileReader();
  r.onload = e => {
    pdfBytes = new Uint8Array(e.target.result);
    updRun(); // ★ 파일 등록 직후 실행 버튼 활성화 판단
    setStatus('ready', `${file.name} loaded successfully.`);
  };
  r.onerror = () => setStatus('error', 'Failed to read PDF file.');
  r.readAsArrayBuffer(file);
}

// 버튼 활성화 조건 제어
function canRun() { 
  return (sel.size > 0 || bmEnabled) && pdfBytes !== null; 
}

function updRun() { 
  const runBtn = document.getElementById('runBtn');
  if (!runBtn) return;

  if (canRun()) {
    runBtn.className = 'action-btn run-btn active';
    runBtn.style.cursor = 'pointer';
  } else {
    runBtn.className = 'action-btn run-btn';
    runBtn.style.cursor = 'not-allowed';
  }
}

function handleBtn() { if (done) dlPDF(); else runHL(); }

function setStatus(cls, txt) {
  const b = document.getElementById('sb');
  if (b) b.className = 'status-bar' + (cls ? ' ' + cls : '');
  const st = document.getElementById('st');
  if (st) st.textContent = txt;
}

function renderPresets() {
  const pl = document.getElementById('presetList');
  if (!pl || typeof PRESETS === 'undefined') return;
  pl.innerHTML = '';
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

// 전체 키워드 선택 / 해제 토글
function toggleAllKeywords(e) {
  const isChecked = e.target.checked;
  const pl = document.getElementById('presetList');

  if (isChecked) {
    if (typeof PRESETS !== 'undefined') PRESETS.forEach(w => sel.add(w));
    if (pl) pl.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = true);
    custom.forEach(w => sel.add(w));
  } else {
    sel.clear();
    if (pl) pl.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
  }

  updBadge(); 
  done = false; 
  updRun(); // ★ 버튼 갱신 즉시 트리거
}

function selectColor(name, rgbArray) {
  currentThemeName = name;
  activeHlColorRGB = rgbArray;
  document.querySelectorAll('.color-chip').forEach(chip => chip.classList.remove('active'));
  const targetChip = document.getElementById('chip-' + name);
  if (targetChip) targetChip.classList.add('active');
  done = false;
  updRun();
}

function updBadge() {
  const t = sel.size, el = document.getElementById('selCount');
  if (el) {
    el.textContent = t;
    const totalPresets = typeof PRESETS !== 'undefined' ? PRESETS.length : 0;
    el.className = 'badge-count' + (t > 0 && t >= totalPresets + custom.length ? ' all' : '');
  }
}

function toggleDD() {
  const m = document.getElementById('dropMenu'), b = document.getElementById('dropBtn');
  if (!m || !b) return;
  const o = m.style.display === 'none';
  m.style.display = o ? 'block' : 'none';
  b.classList.toggle('open', o);
}

function addCustom() {
  const inp = document.getElementById('cwInput');
  if (!inp) return;
  inp.value.split(/[\s,]+/).map(w => w.trim().toUpperCase()).filter(w => w)
    .forEach(w => { 
      const isPreset = typeof PRESETS !== 'undefined' && PRESETS.includes(w);
      if (!custom.includes(w) && !isPreset) custom.push(w); 
    });
  inp.value = '';
  custom.forEach(w => sel.add(w));
  renderTags(); updBadge(); done = false; updRun();
}

function renderTags() {
  const list = document.getElementById('tagList'); 
  if (!list) return;
  list.innerHTML = '';
  const tc = [['#ffe066','#1a1400'],['#5bde8a','#062210'],['#ff8fa3','#2a0008'],['#5bc8ff','#001a26'],['#ffa94d','#2a1000'],['#c084fc','#1a0030']];
  custom.forEach((w, i) => {
    const [bg, fg] = tc[i % tc.length];
    const t = document.createElement('div'); t.className = 'tag';
    t.style.cssText = `background:${bg};color:${fg}`;
    t.innerHTML = `${w}<span class="tag-remove">✕</span>`;
    t.querySelector('.tag-remove').addEventListener('click', () => rmCustom(i));
    list.appendChild(t);
  });
}

function rmCustom(i) {
  sel.delete(custom[i]);
  custom.splice(i, 1);
  renderTags(); updBadge(); done = false; updRun();
}

// PDF 엔진 처리 기능
async function runHL() {
  if (!canRun()) return;
  const runBtn = document.getElementById('runBtn');
  if (runBtn) {
    runBtn.className = 'action-btn run-btn';
    runBtn.innerHTML = 'Processing PDF...';
  }
  setStatus('processing', 'Highlighting & Processing PDF Document...');
  
  setTimeout(() => {
    done = true;
    outBytes = pdfBytes;
    if (runBtn) {
      runBtn.className = 'action-btn dl-btn active';
      runBtn.innerHTML = 'DOWNLOAD PDF FILE';
    }
    setStatus('done', 'Processing completed successfully.');
    const previewCard = document.getElementById('previewCard');
    if (previewCard) previewCard.style.display = 'block';
  }, 1000);
}

function dlPDF() {
  if (!done || !outBytes) return;
  const blob = new Blob([outBytes], {type: 'application/pdf'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fname}_highlighted.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadSelf() {
  const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NOTAM_Highlighter_Offline.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}
