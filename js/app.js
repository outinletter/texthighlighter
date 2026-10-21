/**
 * Application UI Handlers & State Management
 */

let resolvedWorkerUrl = '';
let libsReady = false;

const PRESETS=['3 PCT','A/C','ACTUAL','AGTOW','ALERT LEVEL','ALTN','AMD','AMEND','AMDT','APMS','APPLY','789','781','CAUTION','CCF','CDL','CFP PLAN','CHANGES','CLOSURE','CRZ','DIFFERENCE','DISC','DO NOT USE','EDTO','EFB','ELDW','EMERGENCY','ENTRY POINT','ERA','ETP','EXC SKED','FOD','FOM','ILS','KAL','KE NOT','KE ROUTE','LDW','MEL','MINIMA','MOD TURB','MTOW','NO AFFECTED','NO KE','NO COMPANY','NO OPS RTE', 'NOT TO','OUT OF SERVICE','OUTAGE','OVC','RA','REFILE','RQRD','RUNWAY','SH','TAKE OFF WEIGHT','TOW','TRIP','TS','UNRELIABLE','UNSERVICEABLE','WX DEV'];

let currentThemeName = 'pink';
let activeHlColorRGB = [1.0, 0.45, 0.65];
window.activeHlColorRGB = activeHlColorRGB;

// Default marker mode: underline
let highlightMode = 'underline';
let customLineHighlight = false;
window.customLineHighlight = customLineHighlight;

let sel=new Set(), custom=[], pdfBytes=null, fname='document', done=false, outBytes=null;
let detectedAirports = [];
let iataAirports = [];
let bmEnabled = false;
let processingMode = 'keywords';
let bookmarkPolicy = 'generate';
let extractedFileDate = '';
let extractedFlightNum = '';
let extractedAcReg = '';
let extractedRoute = '';

async function updateCommitVersion() {
  try {
    const response = await fetch('https://api.github.com/repos/outinletter/texthighlighter/commits/main', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!response.ok) return;
    const commit = await response.json();
    const hash = commit?.sha?.slice(0, 7);
    if (hash) document.getElementById('commitVersion')?.replaceChildren(hash);
  } catch (error) {
    console.info('Commit version update unavailable while offline.');
  }
}

function canRun(){return (sel.size>0 || bmEnabled) && pdfBytes!==null;}
function updRun(){document.getElementById('runBtn').className='action-btn run-btn'+(canRun()?' active':'');}
function handleBtn(){if(done)dlPDF();else runHL();}

function setStatus(cls,txt){
  const b=document.getElementById('sb');
  b.className='status-bar'+(cls?' '+cls:'');
  document.getElementById('st').textContent=txt;
}

function selectColor(name, rgbArray) {
    currentThemeName = name;
    activeHlColorRGB = rgbArray;
    window.activeHlColorRGB = rgbArray;

    document.querySelectorAll('.color-chip').forEach(chip => chip.classList.remove('active'));
    document.getElementById('chip-' + name).classList.add('active');

    done = false;
    updRun();
}

function setHighlightMode(mode) {
  highlightMode = mode === 'highlight' ? 'highlight' : 'underline';

  document.querySelectorAll('input[name="markerMode"]').forEach(input => {
    input.checked = input.value === highlightMode;
  });

  done = false;
  updRun();
}

function setCustomMode(mode) {
  customLineHighlight = mode === 'line';
  window.customLineHighlight = customLineHighlight;
  document.querySelectorAll('input[name="customMode"]').forEach(input => {
    input.checked = input.value === mode;
  });
  done = false;
  updRun();
}

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

async function initLibraries() {
  try {
    if (!window.pdfjsLib) await loadScript('./vendor/pdf.min.js');
    resolvedWorkerUrl = './vendor/pdf.worker.min.js';
    if (!window.PDFLib) await loadScript('./vendor/pdf-lib.min.js');
  } catch (err) {
    console.error('Local PDF library load failed:', err);
    setStatus('error', 'Failed to load local PDF libraries.');
    return;
  }

  if (!window.pdfjsLib || !window.PDFLib) {
    setStatus('error', 'Required PDF libraries are unavailable.');
    return;
  }

  if (window.location.protocol === 'file:') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = resolvedWorkerUrl || './vendor/pdf.worker.min.js';
  }

  libsReady = true;
  setStatus('ready', 'Engine ready. Upload PDF to start.');
}

function updBadge(){
  const t=sel.size,el=document.getElementById('selCount');
  const customCount = custom.filter(word => sel.has(word)).length;
  const presetCount = PRESETS.filter(word => sel.has(word) && !custom.includes(word)).length;
  el.textContent = custom.length ? `${presetCount} + ${customCount}` : t;
  el.title = `기본 키워드 ${presetCount}개 / 사용자 키워드 ${customCount}개 (쉼표 구분, 중복 제외)`;
  const allWords = new Set([...PRESETS, ...custom]);
  el.className='badge-count'+(t>0&&[...allWords].every(word => sel.has(word))?' all':'');
}

function toggleDD(){
  const m=document.getElementById('dropMenu'),b=document.getElementById('dropBtn');
  const o=m.style.display==='none';
  m.style.display=o?'block':'none';
  b.classList.toggle('open',o);
}

function toggleAllWords(){
  const selectAll = [...new Set([...PRESETS, ...custom])].some(word => !sel.has(word));
  PRESETS.forEach((w, i) => {
    selectAll ? sel.add(w) : sel.delete(w);
    const checkbox = document.getElementById(`p${i}`);
    if (checkbox) checkbox.checked = selectAll;
  });
  custom.forEach(w => selectAll ? sel.add(w) : sel.delete(w));
  document.querySelectorAll('#customWordList input').forEach(input => { input.checked = selectAll; });
  const button = document.getElementById('toggleAllWords');
  if (button) button.textContent = selectAll ? 'Deselect All' : 'Select All';
  updBadge();
  done = false;
  updRun();
}

function syncCustomWordSelection(word) {
  sel.add(word);
  const index = custom.indexOf(word);
  const checkbox = index >= 0 ? document.getElementById(`cw${index}`) : null;
  if (checkbox) checkbox.checked = true;
}

function addCustom(){
  const inp=document.getElementById('cwInput');
  const words = inp.value.split(',').map(w=>w.replace(/\s+/g, ' ').trim().toUpperCase()).filter(w=>w);

  words.forEach(w => {
    // custom 배열에 없으면 추가 (화면 태그 표시용)
    if(!custom.includes(w)) {
      custom.push(w);
    }
    // sel Set에 추가 (실제 하이라이트 대상)
    syncCustomWordSelection(w);

    // 만약 PRESETS에 있는 단어라면, 해당 체크박스도 찾아 체크해줌 (UI 동기화)
    const presetIndex = PRESETS.indexOf(w);
    if (presetIndex !== -1) {
      const checkbox = document.getElementById(`p${presetIndex}`);
      if (checkbox) checkbox.checked = true;
    }
  });

  inp.value='';
  renderCustomWordOptions();
  custom.forEach(syncCustomWordSelection);
  renderTags();
  updBadge();
  done=false;
  updRun();
}

function renderTags(){
  const list=document.getElementById('tagList');list.innerHTML='';
  list.style.display = custom.length ? '' : 'none';
  const tc=[['#eee5c9','#403a2b'],['#d0e5d7','#2c4034'],['#ebd5dc','#45333b'],['#d1e3eb','#2d3c45'],['#ecddcf','#45382d'],['#dfd6eb','#3c3348']];
  const tagFrag = document.createDocumentFragment();
  custom.forEach((w,i)=>{
    const[bg,fg]=tc[i%tc.length];
    const t=document.createElement('div');t.className='tag';
    t.style.cssText=`background:${bg};color:${fg}`;
    t.innerHTML=`${w}<span class="tag-remove" onclick="rmCustom(${i})">✕</span>`;
    tagFrag.appendChild(t);
  });
  list.appendChild(tagFrag);
}

function renderCustomWordOptions(){
  const list = document.getElementById('customWordList');
  if (!list) return;
  list.innerHTML = custom.length ? '<div class="menu-section">CUSTOM WORDS</div>' : '';
  custom.forEach((word, index) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.innerHTML = `<input type="checkbox" id="cw${index}" ${sel.has(word) ? 'checked' : ''}><label for="cw${index}" style="cursor:pointer;flex:1">${word}</label>`;
    item.querySelector('input').addEventListener('change', event => {
      event.target.checked ? sel.add(word) : sel.delete(word);
      updBadge(); done = false; updRun();
    });
    list.appendChild(item);
  });
}

function rmCustom(i){sel.delete(custom[i]);custom.splice(i,1);renderCustomWordOptions();renderTags();updBadge();done=false;updRun();}

function loadFile(file){
  bookmarkPolicy = 'generate';
  document.querySelector('input[name="bookmarkPolicy"][value="generate"]').checked = true;
  fname=file.name.replace(/\.pdf$/i,'');
  document.getElementById('fileName').textContent=file.name;
  document.getElementById('uploadArea').classList.add('has-file');
  pdfBytes=null; done=false; outBytes=null; 
  detectedAirports=[]; iataAirports=[];
  extractedFileDate = ''; extractedFlightNum = ''; extractedAcReg = ''; extractedRoute = '';
  document.getElementById('previewCard').style.display = 'none';
  updRun();
  setStatus('processing','Loading local memory dump...');
  const r=new FileReader();
  r.onload=e=>{
    const loadedBytes=new Uint8Array(e.target.result);
    pdfBytes=loadedBytes;
    updRun();
    setStatus('ready',`${file.name} loaded. Press RUN to start with automatic auto-decoding.`);
  };
  r.onerror=()=>{
    setStatus('error','Failed to read local document.');
  };
  r.readAsArrayBuffer(file);
}

function dlPDF(){
  if(!done||!outBytes)return;
  try{
    const blob=new Blob([outBytes],{type:'application/pdf'});
    
    let routeCode = "";
    if (detectedAirports && detectedAirports.length === 2) {
      routeCode = `_${detectedAirports[0]}_${detectedAirports[1]}`;
    } else if (iataAirports && iataAirports.length === 2) {
      routeCode = `_${iataAirports[0]}_${iataAirports[1]}`;
    }

    let downloadName = '';
    const routeSuffix = extractedRoute ? `_${extractedRoute}` : '';
    if (extractedFileDate && extractedFlightNum) {
      downloadName = `${extractedFileDate}_${extractedFlightNum}${routeSuffix}${routeCode}_highlighted.pdf`;
    } else if (extractedFlightNum) {
      downloadName = `${extractedFlightNum}${routeSuffix}${routeCode}_highlighted.pdf`;
    } else {
      downloadName = fname + '_highlighted.pdf';
    }
    
    if (window.webkit?.messageHandlers?.savePDF) {
      const reader = new FileReader();
      reader.onload = () => window.webkit.messageHandlers.savePDF.postMessage({
        name: downloadName,
        data: reader.result.split(',')[1]
      });
      reader.onerror = () => setStatus('error', 'Failed to read PDF for saving.');
      reader.readAsDataURL(blob);
      return;
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  }catch(e){
    setStatus('error','Failed to write PDF: '+e.message);
  }
}



// 이벤트 리스너 바인딩 및 초기화
document.addEventListener('DOMContentLoaded', () => {
  initLibraries();
  const settingsCard = document.getElementById('highlightSettingsHeading').closest('.card');
  const resizeTagBox = () => {
    document.getElementById('tagList').style.height = `${Math.ceil(settingsCard.getBoundingClientRect().height)}px`;
  };
  new ResizeObserver(resizeTagBox).observe(settingsCard);
  resizeTagBox();
  updateCommitVersion();
  document.querySelectorAll('input[name="bookmarkPolicy"]').forEach(input => input.addEventListener('change', e => {
    if (!e.target.checked) return;
    bookmarkPolicy = e.target.value;
    done = false; updRun();
  }));

  const pl = document.getElementById('presetList');
  const frag = document.createDocumentFragment();
  PRESETS.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'menu-item';
    d.innerHTML = `<input type="checkbox" id="p${i}"><label for="p${i}" style="cursor:pointer;flex:1">${w}</label>`;
    d.querySelector('input').addEventListener('change', e => {
      e.target.checked ? sel.add(w) : sel.delete(w);
      updBadge(); done = false; updRun();
    });
    frag.appendChild(d);
  });
  pl.appendChild(frag);
  renderCustomWordOptions();

  document.querySelectorAll('input[name="engineMode"]').forEach(modeInput => {
    modeInput.addEventListener('change', e => {
      if (!e.target.checked) return;
      processingMode = e.target.value;
      bmEnabled = processingMode === 'bookmarks';
      if(processingMode === 'keywords'){
        PRESETS.forEach(w=>sel.add(w));
        pl.querySelectorAll('input').forEach(c=>c.checked=true);
        custom.forEach(w=>sel.add(w));
      } else {
        sel.clear();
        pl.querySelectorAll('input').forEach(c=>c.checked=false);
      }
      updBadge(); done=false; updRun();
    });
  });
  PRESETS.forEach(w => sel.add(w));
  pl.querySelectorAll('input').forEach(c => c.checked = true);
  updBadge();

  setHighlightMode('underline');
  document.querySelectorAll('input[name="markerMode"]').forEach(input => {
    input.addEventListener('change', event => setHighlightMode(event.target.value));
  });
  document.querySelectorAll('input[name="customMode"]').forEach(input => {
    input.addEventListener('change', event => setCustomMode(event.target.value));
  });

  document.getElementById('cwInput').addEventListener('keydown', e => {
    if(e.key === 'Enter') addCustom();
  });

  const ua = document.getElementById('uploadArea');
  const fi = document.getElementById('fi');

  ua.addEventListener('click', e => {
    if(e.target.id !== 'fi') fi.click();
  });

  fi.addEventListener('change', e => {
    if(e.target.files[0]) {
      loadFile(e.target.files[0]);
      e.target.value = ''; 
    }
  });

  ua.addEventListener('dragover', e => { e.preventDefault(); ua.style.borderColor='#3b82f6'; });
  ua.addEventListener('dragleave', () => { ua.style.borderColor=''; });
  ua.addEventListener('drop', e => {
    e.preventDefault(); ua.style.borderColor='';
    if(e.dataTransfer.files[0]?.type === 'application/pdf') loadFile(e.dataTransfer.files[0]);
  });

  document.addEventListener('click', e => {
    if(!e.target.closest('.dropdown-wrap')){
      document.getElementById('dropMenu').style.display='none';
      document.getElementById('dropBtn').classList.remove('open');
    }
  });
});
