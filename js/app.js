/**
 * Application UI Handlers & State Management
 */

let resolvedWorkerUrl = '';
let libsReady = false;

const PRESETS=['A/C','ACTUAL','AGTOW','ALERT LEVEL','ALTN','AMD','AMEND','AMDT','APMS','APPLY','B789','B781','CAUTION','CCF','CDL','CFP PLAN','CHANGES','CLOSURE','CRZ','DIFFERENCE','DISC','DO NOT USE','EDTO','EFB','ELDW','EMERGENCY','ENTRY POINT','ERA','ETP','EXC SKED', 'EXC  SKED','FOD','FOM','ILS','KAL','KE NOT','KE ROUTE','LDW','MEL','MINIMA','MOD TURB','MTOW','NO AFFECTED','NO KE','NO OPS RTE', 'NOT TO','OUT OF SERVICE','OUTAGE','OVC','RA','REFILE','RQRD','RUNWAY','SH','TAKE OFF WEIGHT','TOW','TRIP','TS','U/S','UNRELIABLE','UNSERVICEABLE','WX DEV'];

let currentThemeName = 'blue';
let activeHlColorRGB = [0.36, 0.78, 1.0];

let sel=new Set(), custom=[], pdfBytes=null, fname='document', done=false, outBytes=null;
let detectedAirports = [];
let iataAirports = [];
let bmEnabled = false; 
let extractedFileDate = '';
let extractedFlightNum = '';
let extractedAcReg = '';

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
  
  document.querySelectorAll('.color-chip').forEach(chip => chip.classList.remove('active'));
  document.getElementById('chip-' + name).classList.add('active');
  
  done = false;
  updRun();
}

async function forceDownload(event, url, filename) {
  event.preventDefault();
  const btn = event.currentTarget;
  const originalText = btn.textContent;
  
  btn.textContent = 'Saving...';
  btn.style.pointerEvents = 'none';
  btn.style.opacity = '0.6';
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const localUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = localUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(localUrl), 300);
  } catch (e) {
    window.open(url, '_blank');
  } finally {
    btn.textContent = originalText;
    btn.style.pointerEvents = '';
    btn.style.opacity = '';
  }
}

function downloadSelf() {
  const clone = document.documentElement.cloneNode(true);
  
  const fileNameEl = clone.querySelector('#fileName');
  if (fileNameEl) fileNameEl.textContent = '';
  const uploadArea = clone.querySelector('#uploadArea');
  if (uploadArea) uploadArea.classList.remove('has-file');
  const sb = clone.querySelector('#sb');
  if (sb) sb.className = 'status-bar';
  const st = clone.querySelector('#st');
  if (st) st.textContent = 'Engine ready. Select keywords and upload PDF to start.';
  const tagList = clone.querySelector('#tagList');
  if (tagList) tagList.innerHTML = '';
  const previewCard = clone.querySelector('#previewCard');
  if (previewCard) previewCard.style.display = 'none';
  
  const htmlContent = "<!DOCTYPE html>\n" + clone.outerHTML;
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
    await loadScript('./pdf.min.js');
  } catch (e) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
    } catch (err) {
      setStatus('error', 'Failed to load main PDF.js core. Verify local guide or connection.');
      return;
    }
  }

  try {
    await loadScript('./pdf.worker.min.js');
    resolvedWorkerUrl = './pdf.worker.min.js';
  } catch (e) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js');
      resolvedWorkerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    } catch (err) {
      console.warn('Worker script pre-load skipped.');
    }
  }

  try {
    await loadScript('./pdf-lib.min.js');
  } catch (e) {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    } catch (err) {
      setStatus('error', 'Failed to load PDF-Lib engine. Verify local guide or connection.');
      return;
    }
  }

  if (window.location.protocol === 'file:') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = resolvedWorkerUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  libsReady = true;
  setStatus('ready', 'Engine ready. Upload PDF to start.');
}

function updBadge(){
  const t=sel.size,el=document.getElementById('selCount');
  el.textContent=t;
  el.className='badge-count'+(t>0&&t>=PRESETS.length+custom.length?' all':'');
}

function toggleDD(){
  const m=document.getElementById('dropMenu'),b=document.getElementById('dropBtn');
  const o=m.style.display==='none';
  m.style.display=o?'block':'none';
  b.classList.toggle('open',o);
}

function addCustom(){
  const inp=document.getElementById('cwInput');
  const words = inp.value.split(/[\s,]+/).map(w=>w.trim().toUpperCase()).filter(w=>w);

  words.forEach(w => {
    // custom 배열에 없으면 추가 (화면 태그 표시용)
    if(!custom.includes(w)) {
      custom.push(w);
    }
    // sel Set에 추가 (실제 하이라이트 대상)
    sel.add(w);

    // 만약 PRESETS에 있는 단어라면, 해당 체크박스도 찾아 체크해줌 (UI 동기화)
    const presetIndex = PRESETS.indexOf(w);
    if (presetIndex !== -1) {
      const checkbox = document.getElementById(`p${presetIndex}`);
      if (checkbox) checkbox.checked = true;
    }
  });

  inp.value='';
  renderTags();
  updBadge();
  done=false;
  updRun();
}

function renderTags(){
  const list=document.getElementById('tagList');list.innerHTML='';
  const tc=[['#ffe066','#1a1400'],['#5bde8a','#062210'],['#ff8fa3','#2a0008'],['#5bc8ff','#001a26'],['#ffa94d','#2a1000'],['#c084fc','#1a0030']];
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

function rmCustom(i){sel.delete(custom[i]);custom.splice(i,1);renderTags();updBadge();done=false;updRun();}

function loadFile(file){
  fname=file.name.replace(/\.pdf$/i,'');
  document.getElementById('fileName').textContent=file.name;
  document.getElementById('uploadArea').classList.add('has-file');
  pdfBytes=null; done=false; outBytes=null; 
  detectedAirports=[]; iataAirports=[];
  extractedFileDate = ''; extractedFlightNum = ''; extractedAcReg = '';
  document.getElementById('previewCard').style.display = 'none';
  updRun();
  setStatus('processing','Loading local memory dump...');
  const r=new FileReader();
  r.onload=e=>{
    pdfBytes=new Uint8Array(e.target.result);
    updRun();
    setStatus('ready',`${file.name} loaded. Press RUN to start with automatic auto-decoding.`);
  };
  r.onerror=()=>setStatus('error','Failed to read local document.');
  r.readAsArrayBuffer(file);
}

function dlPDF(){
  if(!done||!outBytes)return;
  try{
    const blob=new Blob([outBytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    
    let routeCode = "";
    if (detectedAirports && detectedAirports.length === 2) {
      routeCode = `_${detectedAirports[0]}_${detectedAirports[1]}`;
    } else if (iataAirports && iataAirports.length === 2) {
      routeCode = `_${iataAirports[0]}_${iataAirports[1]}`;
    }

    let downloadName = '';
    if (extractedFileDate && extractedFlightNum) {
      downloadName = `${extractedFileDate}_${extractedFlightNum}${routeCode}_highlighted.pdf`;
    } else if (extractedFlightNum) {
      downloadName = `${extractedFlightNum}${routeCode}_highlighted.pdf`;
    } else {
      downloadName = fname + '_highlighted.pdf';
    }
    
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

  document.getElementById('hlEnabled').addEventListener('change', e => {
    if(e.target.checked){
      PRESETS.forEach(w=>sel.add(w));
      pl.querySelectorAll('input').forEach(c=>c.checked=true);
      custom.forEach(w=>sel.add(w));
    } else {
      sel.clear();
      pl.querySelectorAll('input').forEach(c=>c.checked=false);
    }
    updBadge(); done=false; updRun();
  });

  document.getElementById('bmEnabled').addEventListener('change', e => {
    bmEnabled = e.target.checked;
    done = false; updRun();
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
