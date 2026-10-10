/**
 * Application UI Handlers & State Management
 */

let resolvedWorkerUrl = '';
let libsReady = false;

const PRESETS=['3 PCT','A/C','ACTUAL','AGTOW','ALERT LEVEL','ALTN','AMD','AMEND','AMDT','APMS','APPLY','789','781','CAUTION','CCF','CDL','CFP PLAN','CHANGES','CLOSURE','CRZ','DIFFERENCE','DISC','DO NOT USE','EDTO','EFB','ELDW','EMERGENCY','ENTRY POINT','ERA','ETP','EXC SKED','FOD','FOM','ILS','KAL','KE NOT','KE ROUTE','LDW','MEL','MINIMA','MOD TURB','MTOW','NO AFFECTED','NO KE','NO COMPANY','NO OPS RTE', 'NOT TO','OUT OF SERVICE','OUTAGE','OVC','RA','REFILE','ROUTE','RQRD','RUNWAY','SH','TAKE OFF WEIGHT','TOW','TRIP','TS','UNRELIABLE','UNSERVICEABLE','WX DEV'];

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
let extractedFileDate = '';
let extractedFlightNum = '';
let extractedAcReg = '';
let extractedRoute = '';
let pilotBriefingData = null;
let pendingPilotBriefingDestination = '';
let pilotBriefingDestination = '';
let pilotBriefingLoading = false;
let pilotBriefingError = '';

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

function toggleCustomMode() {
  customLineHighlight = !customLineHighlight;
  window.customLineHighlight = customLineHighlight;
  const button = document.getElementById('customModeToggle');
  if (button) button.textContent = customLineHighlight ? 'Full Line' : 'Custom Words Only';
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

function toggleAllWords(){
  const selectAll = sel.size < PRESETS.length + custom.length;
  PRESETS.forEach((w, i) => {
    selectAll ? sel.add(w) : sel.delete(w);
    const checkbox = document.getElementById(`p${i}`);
    if (checkbox) checkbox.checked = selectAll;
  });
  custom.forEach(w => selectAll ? sel.add(w) : sel.delete(w));
  const button = document.getElementById('toggleAllWords');
  if (button) button.textContent = selectAll ? 'Deselect All' : 'Select All';
  updBadge();
  done = false;
  updRun();
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

function updateSafetyBanner() {
  const banner = document.getElementById('safetyBanner');
  const subtitle = document.getElementById('safetyBannerSubtitle');
  const cta = document.getElementById('safetyBannerCta');
  const destination = document.getElementById('safetyBannerDestination');
  if (!subtitle || !cta) return;
  const ready = Boolean(pilotBriefingDestination && pilotBriefingData && !pilotBriefingLoading);
  banner?.classList.toggle('is-ready', ready);
  banner?.classList.toggle('is-loading', Boolean(pilotBriefingLoading));
  if (destination) {
    destination.hidden = !pilotBriefingDestination;
    destination.textContent = pilotBriefingDestination || '';
  }
  if (pilotBriefingLoading && !pilotBriefingDestination) {
    subtitle.textContent = 'Reading the uploaded flight package for its destination airport.';
    cta.innerHTML = 'Preparing briefing <span aria-hidden="true">…</span>';
  } else if (pilotBriefingDestination && pilotBriefingLoading) {
    subtitle.textContent = `Destination ${pilotBriefingDestination} found. Loading its briefing when online.`;
    cta.innerHTML = `Preparing ${escapeBriefingHtml(pilotBriefingDestination)} <span aria-hidden="true">…</span>`;
  } else if (pilotBriefingDestination && pilotBriefingData) {
    subtitle.textContent = 'Destination briefing is ready. Tap to review the airport hazards.';
    cta.innerHTML = `VIEW BRIEFING <span aria-hidden="true">→</span>`;
  } else if (pilotBriefingDestination && pilotBriefingError) {
    subtitle.textContent = `${pilotBriefingDestination} briefing is unavailable. Tap to view details or retry.`;
    cta.innerHTML = `Open ${escapeBriefingHtml(pilotBriefingDestination)} briefing <span aria-hidden="true">→</span>`;
  } else {
    subtitle.textContent = 'What hazards are waiting along your route?';
    cta.innerHTML = 'Explore the demo <span aria-hidden="true">→</span>';
  }
}

function renderBriefingMessage(title, text, destination = '', isError = false) {
  const content = document.getElementById('pilotBriefingContent');
  if (!content) return;
  content.innerHTML = `<header class="briefing-top">PILOT BRIEFING <span class="briefing-airport">${escapeBriefingHtml(destination ? `Destination ${destination}` : '')}</span></header><section class="briefing-card"><h2 id="pilotBriefingTitle">${escapeBriefingHtml(title)}</h2><p class="${isError ? 'briefing-error' : 'briefing-muted'}">${escapeBriefingHtml(text)}</p></section>`;
}

function openPilotBriefingModal() {
  const modal = document.getElementById('pilotBriefingModal');
  if (!modal) return;
  modal.hidden = false;
  if (pilotBriefingData && pilotBriefingDestination) showPilotBriefing(pilotBriefingData, pilotBriefingDestination);
  else if (pilotBriefingLoading) renderBriefingMessage('Preparing destination briefing…', 'The PDF remains on this device while the destination is extracted.', pilotBriefingDestination);
  else if (pilotBriefingDestination && !navigator.onLine) {
    pendingPilotBriefingDestination = pilotBriefingDestination;
    renderBriefingMessage('Waiting for internet', 'Local PDF highlighting remains available. The briefing will load automatically when the connection returns.', pilotBriefingDestination);
  } else if (pilotBriefingDestination) loadPilotBriefingForDestination(pilotBriefingDestination);
  else renderBriefingMessage('Airport Safety Briefing', 'Upload a flight package PDF to prepare a briefing for its destination airport.');
  document.getElementById('pilotBriefingClose')?.focus();
}

function closePilotBriefingModal() {
  const modal = document.getElementById('pilotBriefingModal');
  if (modal) modal.hidden = true;
  document.getElementById('safetyBanner')?.focus();
}

function showPilotBriefing(data, destination) {
  const content = document.getElementById('pilotBriefingContent');
  if (!content) return;
  const context = data.flight_context || {};
  const html = escapeBriefingHtml;
  const threats = (data.top_threats || []).slice(0, 6).map(threat => `
    <article class="briefing-threat"><h2>${html(threat.title || 'Operational threat')}</h2><p class="briefing-muted">${html(threat.description || '')}</p>
      ${(threat.events || []).slice(0, 2).map(event => `<p class="briefing-small"><strong>${html(event.detail_title || event.one_line || 'Related event')}</strong><br>${html(event.date || '')} · ${html(event.source_name || '')}<br>${html(event.summary || '')}</p>`).join('')}
    </article>`).join('') || '<p class="briefing-muted">No threat records returned.</p>';
  const notamThreats = (data.notam_threats || []).slice(0, 8).map(notam => `
    <article class="briefing-threat"><h2>${html(notam.headline || notam.category || 'NOTAM threat')} <span class="briefing-tag">${html(notam.severity || 'Info')}</span></h2>
      <p class="briefing-weather">${html(notam.rawText || '')}</p><p class="briefing-small briefing-muted">${html(notam.notamId || '')}${notam.effectiveStart ? ` · From ${html(notam.effectiveStart)}` : ''}${notam.effectiveEnd ? ` · To ${html(notam.effectiveEnd)}` : ''}</p>
    </article>`).join('') || '<p class="briefing-muted">No NOTAM threat records returned.</p>';
  const tags = (context.arrival_tags || []).map(tag => `<span class="briefing-tag">${html(tag)}</span>`).join('');
  const metrics = [
    ['Arrival airport', `${context.arrival_icao || destination}${context.arrival_iata ? ` (${context.arrival_iata})` : ''}`],
    ['Risk level', context.risk_level || '—'],
    ['Elevation', context.elevation_ft == null ? '—' : `${context.elevation_ft} ft`],
    ['Terrain', context.terrain_type || '—'],
    ['Runways', (context.runways || []).join(' / ') || '—'],
    ['Airport events', context.airport_event_count ?? '—']
  ].map(([label, value]) => `<div><div class="briefing-label">${html(label)}</div><div class="briefing-value">${html(value)}</div></div>`).join('');
  const forecast = [context.arrival_weather_brief, context.metar, context.taf || context.arrival_taf].filter(Boolean).map(html).join('\n\n') || 'Weather briefing unavailable.';
  content.innerHTML = `<header class="briefing-top">PILOT BRIEFING <span class="briefing-airport">Destination ${html(destination)}</span></header>
    <section class="briefing-card"><div class="briefing-summary"><div><div class="briefing-label">Risk score</div><div class="briefing-score">${html(context.risk_score ?? '—')}<span style="font-size:14px"> / 100</span></div></div><div><h1 id="pilotBriefingTitle">Airport Safety Briefing</h1><strong>${html(context.risk_level || 'Risk level unavailable')}</strong><p class="briefing-muted">${html(context.risk_summary || '')}</p></div></div><div>${tags}</div></section>
    <section class="briefing-card"><h2>Destination overview</h2><div class="briefing-grid">${metrics}</div></section>
    <section class="briefing-card"><h2>Arrival weather</h2><div class="briefing-weather">${forecast}</div></section>
    <section class="briefing-card"><h2>Destination NOTAMs</h2>${notamThreats}</section>
    <section class="briefing-card"><h2>Threat intelligence</h2>${threats}</section>
    <p class="briefing-warning">DEMO VERSION — Informational only; not for flight safety or operational use. Verify information with approved sources.</p>`;
}
async function loadPilotBriefingFromPdf(bytes) {
  pilotBriefingLoading = true;
  pilotBriefingError = '';
  pilotBriefingData = null;
  pilotBriefingDestination = '';
  updateSafetyBanner();
  try {
    for (let attempt = 0; attempt < 100 && !libsReady; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!libsReady) throw new Error('PDF library did not finish loading.');
    const pdf = await pdfjsLib.getDocument({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }).promise;
    const icao = await extractReleaseAirportsByRule2(pdf);
    const destination = icao[1] || iataAirports[1];
    if (!destination) throw new Error('Could not extract a destination airport from this PDF.');
    pilotBriefingDestination = destination;
    updateSafetyBanner();
    await loadPilotBriefingForDestination(destination);
  } catch (error) {
    console.error('[Pilot Briefing]', error);
    pilotBriefingLoading = false;
    pilotBriefingError = error.message || 'Could not extract a destination airport.';
    updateSafetyBanner();
    if (!document.getElementById('pilotBriefingModal')?.hidden) renderBriefingMessage('Briefing unavailable', pilotBriefingError, '', true);
  }
}

async function loadPilotBriefingForDestination(destination) {
  pendingPilotBriefingDestination = destination;
  if (!navigator.onLine) {
    pilotBriefingLoading = false;
    pilotBriefingError = 'Waiting for internet connection.';
    updateSafetyBanner();
    if (!document.getElementById('pilotBriefingModal')?.hidden) renderBriefingMessage('Waiting for internet', 'Local PDF highlighting remains available. The briefing will load automatically when the connection returns.', destination);
    return;
  }
  pilotBriefingLoading = true;
  pilotBriefingError = '';
  updateSafetyBanner();
  if (!document.getElementById('pilotBriefingModal')?.hidden) renderBriefingMessage('Loading destination briefing…', 'Contacting Pilot Briefing. The PDF itself is not uploaded.', destination);
  try {
    const response = await fetch(`https://pilot-briefing.outinletter.workers.dev/api/briefing/${encodeURIComponent(destination)}`);
    if (!response.ok) throw new Error(`Pilot Briefing returned HTTP ${response.status}.`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.flight_context?.messages?.[0] || 'Briefing data is unavailable.');
    pilotBriefingData = data;
    pilotBriefingLoading = false;
    pilotBriefingError = '';
    pendingPilotBriefingDestination = '';
    updateSafetyBanner();
    if (!document.getElementById('pilotBriefingModal')?.hidden) showPilotBriefing(data, destination);
  } catch (error) {
    console.error('[Pilot Briefing]', error);
    pilotBriefingLoading = false;
    if (!navigator.onLine) {
      pilotBriefingError = 'Waiting for internet connection.';
      updateSafetyBanner();
      if (!document.getElementById('pilotBriefingModal')?.hidden) renderBriefingMessage('Waiting for internet', 'The connection was lost. The briefing will retry automatically when the connection returns.', destination);
      return;
    }
    pilotBriefingError = error.message || 'Could not load destination briefing.';
    pendingPilotBriefingDestination = '';
    updateSafetyBanner();
    if (!document.getElementById('pilotBriefingModal')?.hidden) renderBriefingMessage('Briefing unavailable', pilotBriefingError, destination, true);
  }
}

window.addEventListener('online', () => {
  if (pendingPilotBriefingDestination) loadPilotBriefingForDestination(pendingPilotBriefingDestination);
});

function loadFile(file){
  pendingPilotBriefingDestination = '';
  pilotBriefingLoading = true;
  pilotBriefingDestination = '';
  pilotBriefingData = null;
  pilotBriefingError = '';
  updateSafetyBanner();
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
    loadPilotBriefingFromPdf(pdfBytes.slice());
  };
  r.onerror=()=>{
    pilotBriefingLoading = false;
    pilotBriefingError = 'Failed to read local document.';
    updateSafetyBanner();
    setStatus('error','Failed to read local document.');
  };
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

  const safetyBanner = document.getElementById('safetyBanner');
  const briefingModal = document.getElementById('pilotBriefingModal');
  const briefingClose = document.getElementById('pilotBriefingClose');
  safetyBanner?.addEventListener('click', event => {
    if (!pilotBriefingLoading && !pilotBriefingDestination) return;
    event.preventDefault();
    openPilotBriefingModal();
  });
  briefingClose?.addEventListener('click', closePilotBriefingModal);
  briefingModal?.addEventListener('click', event => {
    if (event.target === briefingModal) closePilotBriefingModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && briefingModal && !briefingModal.hidden) closePilotBriefingModal();
  });

  document.addEventListener('click', e => {
    if(!e.target.closest('.dropdown-wrap')){
      document.getElementById('dropMenu').style.display='none';
      document.getElementById('dropBtn').classList.remove('open');
    }
  });
});
