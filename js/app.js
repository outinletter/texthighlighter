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

let sel=new Set(), custom=[], pdfBytes=null, fname='document', done=false, outBytes=null;
let detectedAirports = [];
let iataAirports = [];
let bmEnabled = false;
let processingMode = 'keywords';
let extractedFileDate = '';
let extractedFlightNum = '';
let extractedAcReg = '';
let extractedRoute = '';
let pilotBriefingPopup = null;
let pendingPilotBriefingDestination = '';

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

  const toggle = document.getElementById('markerModeToggle');

  if (toggle) {
    toggle.checked = highlightMode === 'highlight';
  }

  const underlineLabel = document.getElementById('modeLabelUnderline');
  const highlightLabel = document.getElementById('modeLabelHighlight');
  if (underlineLabel && highlightLabel) {
    underlineLabel.classList.toggle('active', highlightMode === 'underline');
    highlightLabel.classList.toggle('active', highlightMode === 'highlight');
  }

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
  const words = inp.value.split(/,+/).map(w=>w.trim().toUpperCase()).filter(w=>w);

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

function escapeBriefingHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function writeBriefingPopup(message) {
  if (!pilotBriefingPopup || pilotBriefingPopup.closed) return;
  pilotBriefingPopup.document.open();
  pilotBriefingPopup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pilot Briefing</title><style>
    *{box-sizing:border-box}body{margin:0;background:#08111f;color:#e5edf8;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 18px 48px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #26364b;padding-bottom:14px}.brand{font-weight:800;color:#7dd3fc;letter-spacing:.04em}.airport{font-size:13px;color:#9fb2ca}.card{background:#111d2e;border:1px solid #26364b;border-radius:14px;padding:18px;margin-top:16px}.hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.score{font-size:38px;font-weight:800;color:#fbbf24}.muted{color:#a9bbd1}.tag{display:inline-block;padding:4px 9px;background:#26364b;border-radius:20px;margin:3px;font-size:12px}.threat{border-top:1px solid #26364b;padding:14px 0}.threat:first-of-type{border:0}.warning{color:#fca5a5;font-size:12px;margin-top:22px}.weather{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}.error{color:#fca5a5}.small{font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.label{font-size:11px;color:#9fb2ca;text-transform:uppercase}.value{font-weight:650;margin-top:4px}h1{font-size:24px;margin:4px 0}h2{font-size:17px;margin:0 0 10px}@media(max-width:560px){.wrap{padding:16px 12px 30px}.card{padding:15px}.score{font-size:32px}}
  </style></head><body><main class="wrap"><header class="top"><span class="brand">PILOT BRIEFING</span><span class="airport">Destination ${escapeBriefingHtml(message.destination || '')}</span></header><div class="card"><h1>${escapeBriefingHtml(message.title || 'Airport Safety Briefing')}</h1><p class="${message.error ? 'error' : 'muted'}">${escapeBriefingHtml(message.text || '')}</p></div></main></body></html>`);
  pilotBriefingPopup.document.close();
}

function showPilotBriefing(data, destination) {
  if (!pilotBriefingPopup || pilotBriefingPopup.closed) return;
  const context = data.flight_context || {};
  const html = (value) => escapeBriefingHtml(value);
  const threats = (data.top_threats || []).slice(0, 6).map(threat => `
    <article class="threat"><h2>${html(threat.title || 'Operational threat')}</h2><p class="muted">${html(threat.description || '')}</p>
      ${(threat.events || []).slice(0, 2).map(event => `<p class="small"><strong>${html(event.detail_title || event.one_line || 'Related event')}</strong><br>${html(event.date || '')} · ${html(event.source_name || '')}<br>${html(event.summary || '')}</p>`).join('')}
    </article>`).join('') || '<p class="muted">No threat records returned.</p>';
  const notamThreats = (data.notam_threats || []).slice(0, 8).map(notam => `
    <article class="threat"><h2>${html(notam.headline || notam.category || 'NOTAM threat')} <span class="tag">${html(notam.severity || 'Info')}</span></h2>
      <p class="weather">${html(notam.rawText || '')}</p><p class="small muted">${html(notam.notamId || '')}${notam.effectiveStart ? ` · From ${html(notam.effectiveStart)}` : ''}${notam.effectiveEnd ? ` · To ${html(notam.effectiveEnd)}` : ''}</p>
    </article>`).join('') || '<p class="muted">No NOTAM threat records returned.</p>';
  const tags = (context.arrival_tags || []).map(tag => `<span class="tag">${html(tag)}</span>`).join('');
  const metrics = [
    ['Arrival airport', `${context.arrival_icao || destination}${context.arrival_iata ? ` (${context.arrival_iata})` : ''}`],
    ['Risk level', context.risk_level || '—'],
    ['Elevation', context.elevation_ft == null ? '—' : `${context.elevation_ft} ft`],
    ['Terrain', context.terrain_type || '—'],
    ['Runways', (context.runways || []).join(' / ') || '—'],
    ['Airport events', context.airport_event_count ?? '—']
  ].map(([label, value]) => `<div><div class="label">${html(label)}</div><div class="value">${html(value)}</div></div>`).join('');
  const forecast = [context.arrival_weather_brief, context.metar, context.taf || context.arrival_taf].filter(Boolean).map(html).join('\n\n') || 'Weather briefing unavailable.';
  pilotBriefingPopup.document.open();
  pilotBriefingPopup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pilot Briefing — ${html(destination)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#08111f;color:#e5edf8;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 18px 48px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #26364b;padding-bottom:14px}.brand{font-weight:800;color:#7dd3fc;letter-spacing:.04em}.airport{font-size:13px;color:#9fb2ca}.card{background:#111d2e;border:1px solid #26364b;border-radius:14px;padding:18px;margin-top:16px}.summary{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.score{font-size:38px;font-weight:800;color:#fbbf24}.muted{color:#a9bbd1}.tag{display:inline-block;padding:4px 9px;background:#26364b;border-radius:20px;margin:3px;font-size:12px}.threat{border-top:1px solid #26364b;padding:14px 0}.threat:first-of-type{border:0}.warning{color:#fca5a5;font-size:12px;margin-top:22px}.weather{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}.small{font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.label{font-size:11px;color:#9fb2ca;text-transform:uppercase}.value{font-weight:650;margin-top:4px}h1{font-size:24px;margin:4px 0}h2{font-size:17px;margin:0 0 10px}@media(max-width:560px){.wrap{padding:16px 12px 30px}.card{padding:15px}.score{font-size:32px}}
  </style></head><body><main class="wrap"><header class="top"><span class="brand">PILOT BRIEFING</span><span class="airport">Destination ${html(destination)}</span></header>
    <section class="card"><div class="summary"><div><div class="label">Risk score</div><div class="score">${html(context.risk_score ?? '—')}<span style="font-size:15px"> / 100</span></div></div><div><h1>Airport Safety Briefing</h1><strong>${html(context.risk_level || 'Risk level unavailable')}</strong><p class="muted">${html(context.risk_summary || '')}</p></div></div><div>${tags}</div></section>
    <section class="card"><h2>Destination overview</h2><div class="grid">${metrics}</div></section>
    <section class="card"><h2>Arrival weather</h2><div class="weather">${forecast}</div></section>
    <section class="card"><h2>Destination NOTAMs</h2>${notamThreats}</section>
    <section class="card"><h2>Threat intelligence</h2>${threats}</section>
    <p class="warning">DEMO VERSION — This briefing is informational and is not for flight safety or operational use. Verify all information with approved operational sources.</p>
    </main></body></html>`);
  pilotBriefingPopup.document.close();
}

async function loadPilotBriefingFromPdf(bytes) {
  try {
    for (let attempt = 0; attempt < 100 && !libsReady; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!libsReady) throw new Error('PDF library did not finish loading.');
    const pdf = await pdfjsLib.getDocument({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }).promise;
    const icao = await extractReleaseAirportsByRule2(pdf);
    const destination = icao[1] || iataAirports[1];
    if (!destination) throw new Error('Could not extract a destination airport from this PDF.');
    await loadPilotBriefingForDestination(destination);
  } catch (error) {
    console.error('[Pilot Briefing popup]', error);
    writeBriefingPopup({ title: 'Briefing unavailable', text: error.message || 'Could not load destination briefing.' });
  }
}

async function loadPilotBriefingForDestination(destination) {
  pendingPilotBriefingDestination = destination;
  if (!navigator.onLine) {
    writeBriefingPopup({ destination, title: 'Waiting for internet', text: 'Local highlighting remains available. The destination briefing will load automatically when the connection returns.' });
    return;
  }
  try {
    writeBriefingPopup({ destination, title: 'Loading destination briefing…', text: 'Contacting Pilot Briefing. The PDF itself is not uploaded.' });
    const response = await fetch(`https://pilot-briefing.outinletter.workers.dev/api/briefing/${encodeURIComponent(destination)}`);
    if (!response.ok) throw new Error(`Pilot Briefing returned HTTP ${response.status}.`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.flight_context?.messages?.[0] || 'Briefing data is unavailable.');
    showPilotBriefing(data, destination);
    pendingPilotBriefingDestination = '';
  } catch (error) {
    console.error('[Pilot Briefing popup]', error);
    if (!navigator.onLine) {
      writeBriefingPopup({ destination, title: 'Waiting for internet', text: 'The connection was lost. This briefing will retry automatically when the connection returns.' });
      return;
    }
    writeBriefingPopup({ title: 'Briefing unavailable', text: error.message || 'Could not load destination briefing.' });
  }
}

window.addEventListener('online', () => {
  if (pendingPilotBriefingDestination) loadPilotBriefingForDestination(pendingPilotBriefingDestination);
});

function loadFile(file){
  if (pilotBriefingPopup && !pilotBriefingPopup.closed) pilotBriefingPopup.close();
  pilotBriefingPopup = window.open('', 'pilotBriefingPopup', 'popup,width=920,height=780,resizable=yes,scrollbars=yes');
  pendingPilotBriefingDestination = '';
  if (pilotBriefingPopup) writeBriefingPopup({ title: 'Reading flight package…', text: 'Extracting the destination airport from the selected PDF.' });
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
    pdfBytes=new Uint8Array(e.target.result);
    updRun();
    setStatus('ready',`${file.name} loaded. Press RUN to start with automatic auto-decoding.`);
    if (pilotBriefingPopup) loadPilotBriefingFromPdf(pdfBytes.slice());
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
    const routeSuffix = extractedRoute ? `_${extractedRoute}` : '';
    if (extractedFileDate && extractedFlightNum) {
      downloadName = `${extractedFileDate}_${extractedFlightNum}${routeSuffix}${routeCode}_highlighted.pdf`;
    } else if (extractedFlightNum) {
      downloadName = `${extractedFlightNum}${routeSuffix}${routeCode}_highlighted.pdf`;
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

  const markerModeToggle = document.getElementById('markerModeToggle');

  if (markerModeToggle) {
    markerModeToggle.checked = false;
    setHighlightMode('underline');

    markerModeToggle.addEventListener('change', e => {
      setHighlightMode(e.target.checked ? 'highlight' : 'underline');
    });
  }

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
