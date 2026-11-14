let viewerPdfDocument = null;
let viewerScale = 1;
let viewerFitScale = 1;
let viewerZoomFactor = 1;
const MAX_VIEWER_ZOOM = 1.3;
const PINCH_ZOOM_SENSITIVITY = 0.75;
let viewerPages = [];
let pageRenderObserver = null;
let currentPageObserver = null;
let sourceBuffer = null;
let sourceFileName = 'processed_highlighted.pdf';

if (window.location.protocol === 'file:') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
}

function viewerTargetOrigin() {
  return window.location.origin === 'null' ? '*' : window.location.origin;
}

function setViewerMessage(message) {
  document.getElementById('pdfViewerMessage').textContent = message;
}

async function loadProcessedPdf(buffer) {
  try {
    setViewerMessage('Opening PDF…');
    disconnectPageObservers();
    if (viewerPdfDocument) await viewerPdfDocument.destroy();
    viewerPdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    document.getElementById('pdfPageCount').textContent = viewerPdfDocument.numPages;
    document.getElementById('pdfCurrentPage').max = viewerPdfDocument.numPages;
    document.getElementById('pdfViewerFileName').textContent = sourceFileName;
    document.title = `${sourceFileName} · Text Highlighter`;
    await preparePdfPages();
    await buildBookmarkList();
    setViewerMessage('');
  } catch (error) {
    setViewerMessage(`Could not open PDF: ${error.message}`);
  }
}

async function preparePdfPages() {
  const list = document.getElementById('pdfPageList');
  const viewport = document.getElementById('pdfPageViewport');
  list.replaceChildren();
  viewerPages = [];
  let maximumPageWidth = 0;
  for (let pageNumber = 1; pageNumber <= viewerPdfDocument.numPages; pageNumber++) {
    const page = await viewerPdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    maximumPageWidth = Math.max(maximumPageWidth, baseViewport.width);
    const element = document.createElement('article');
    element.className = 'pdf-page-item';
    element.dataset.pageNumber = String(pageNumber);
    const placeholder = document.createElement('div');
    placeholder.className = 'pdf-page-placeholder';
    placeholder.textContent = `Page ${pageNumber}`;
    element.appendChild(placeholder);
    list.appendChild(element);
    viewerPages.push({ pageNumber, page, baseViewport, element, placeholder, canvas: null, renderTask: null });
  }
  const availableWidth = Math.max(220, viewport.clientWidth - 24);
  viewerFitScale = availableWidth / maximumPageWidth;
  viewerScale = viewerFitScale * viewerZoomFactor;
  layoutPdfPages();
  observePdfPages();
  document.getElementById('pdfCurrentPage').value = 1;
  document.getElementById('pdfPrevPage').disabled = true;
  document.getElementById('pdfNextPage').disabled = viewerPages.length <= 1;
  await renderPdfPage(1);
  viewport.scrollTop = 0;
}

function layoutPdfPages() {
  for (const data of viewerPages) {
    const width = Math.floor(data.baseViewport.width * viewerScale);
    const height = Math.floor(data.baseViewport.height * viewerScale);
    data.element.style.width = `${width}px`;
    data.element.style.height = `${height}px`;
    if (data.canvas) {
      data.canvas.style.width = `${width}px`;
      data.canvas.style.height = `${height}px`;
      if (data.canvas.dataset.scale !== String(viewerScale)) {
        data.canvas.dataset.needsRender = 'true';
      }
    }
    data.element.dataset.scale = String(viewerScale);
  }
}

function observePdfPages() {
  disconnectPageObservers();
  const viewport = document.getElementById('pdfPageViewport');
  pageRenderObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const pageNumber = Number(entry.target.dataset.pageNumber);
      if (entry.isIntersecting) {
        const data = viewerPages[pageNumber - 1];
        if (data.canvas?.dataset.needsRender === 'true') releasePdfPage(data);
        renderPdfPage(pageNumber);
      } else {
        const box = entry.target.getBoundingClientRect();
        const viewBox = viewport.getBoundingClientRect();
        if (box.bottom < viewBox.top - viewBox.height || box.top > viewBox.bottom + viewBox.height) {
          releasePdfPage(viewerPages[pageNumber - 1]);
        }
      }
    }
  }, { root: viewport, rootMargin: '100% 0px' });
  currentPageObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setCurrentPdfPage(Number(visible.target.dataset.pageNumber));
  }, { root: viewport, threshold: [0.15, 0.35, 0.6] });
  for (const data of viewerPages) {
    pageRenderObserver.observe(data.element);
    currentPageObserver.observe(data.element);
  }
}

function disconnectPageObservers() {
  if (pageRenderObserver) pageRenderObserver.disconnect();
  if (currentPageObserver) currentPageObserver.disconnect();
  pageRenderObserver = null;
  currentPageObserver = null;
}

async function renderPdfPage(pageNumber) {
  const data = viewerPages[pageNumber - 1];
  if (!data || data.canvas) return;
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const renderViewport = data.page.getViewport({ scale: viewerScale * outputScale });
  const canvas = document.createElement('canvas');
  canvas.className = 'pdf-page-canvas';
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  canvas.style.width = `${Math.floor(data.baseViewport.width * viewerScale)}px`;
  canvas.style.height = `${Math.floor(data.baseViewport.height * viewerScale)}px`;
  canvas.dataset.scale = String(viewerScale);
  data.element.replaceChildren(canvas);
  data.canvas = canvas;
  const context = canvas.getContext('2d', { alpha: false });
  const task = data.page.render({ canvasContext: context, viewport: renderViewport });
  data.renderTask = task;
  try {
    await task.promise;
  } catch (error) {
    if (error.name !== 'RenderingCancelledException') setViewerMessage(`Could not render page ${pageNumber}: ${error.message}`);
    if (data.canvas === canvas) {
      data.canvas = null;
      data.element.replaceChildren(data.placeholder);
    }
  } finally {
    if (data.renderTask === task) data.renderTask = null;
  }
}

function releasePdfPage(data) {
  if (!data?.canvas) return;
  if (data.renderTask) data.renderTask.cancel();
  data.canvas = null;
  data.element.replaceChildren(data.placeholder);
}

function setCurrentPdfPage(pageNumber) {
  const input = document.getElementById('pdfCurrentPage');
  input.value = pageNumber;
  document.getElementById('pdfPrevPage').disabled = pageNumber <= 1;
  document.getElementById('pdfNextPage').disabled = pageNumber >= viewerPages.length;
}

function capturePdfPosition(screenY = 0, screenX = 0) {
  const viewport = document.getElementById('pdfPageViewport');
  if (!viewport || !viewerPages.length) return null;
  const viewportRect = viewport.getBoundingClientRect();
  const targetY = viewportRect.top + screenY;
  const targetX = viewportRect.left + screenX;
  const data = viewerPages.find(page => {
    const rect = page.element.getBoundingClientRect();
    return rect.bottom >= targetY;
  }) || viewerPages.at(-1);
  const pageRect = data.element.getBoundingClientRect();
  return {
    pageNumber: data.pageNumber,
    pageOffsetY: Math.max(0, Math.min(data.baseViewport.height, targetY - pageRect.top)) / viewerScale,
    pageOffsetX: Math.max(0, Math.min(data.baseViewport.width, targetX - pageRect.left)) / viewerScale,
    screenY,
    screenX
  };
}

function restorePdfPosition(anchor) {
  if (!anchor) return;
  const viewport = document.getElementById('pdfPageViewport');
  const data = viewerPages[anchor.pageNumber - 1];
  if (!data) return;
  const viewportRect = viewport.getBoundingClientRect();
  const pageRect = data.element.getBoundingClientRect();
  viewport.scrollTop = Math.max(0, viewport.scrollTop + pageRect.top + anchor.pageOffsetY * viewerScale - (viewportRect.top + anchor.screenY));
  viewport.scrollLeft = Math.max(0, viewport.scrollLeft + pageRect.left + anchor.pageOffsetX * viewerScale - (viewportRect.left + anchor.screenX));
}

function applyPdfScale(anchor) {
  for (const data of viewerPages) releasePdfPage(data);
  layoutPdfPages();
  observePdfPages();
  restorePdfPosition(anchor);
  updateZoomLevel();
}

function updateZoomLevel() {
  const label = document.getElementById('pdfZoomLevel');
  if (label) label.textContent = `${Math.round(viewerZoomFactor * 100)}%`;
}

function setPdfZoom(factor, anchor = null, preview = false) {
  if (!viewerPdfDocument || !viewerPages.length) return;
  const viewport = document.getElementById('pdfPageViewport');
  const position = anchor || capturePdfPosition(viewport.clientHeight / 2, viewport.clientWidth / 2);
  viewerZoomFactor = Math.max(0.5, Math.min(MAX_VIEWER_ZOOM, factor));
  viewerScale = viewerFitScale * viewerZoomFactor;
  if (preview) {
    layoutPdfPages();
    restorePdfPosition(position);
    updateZoomLevel();
  } else {
    applyPdfScale(position);
  }
}

function scrollToPdfPage(pageNumber, destinationTop = null) {
  const data = viewerPages[Math.max(0, Math.min(viewerPages.length - 1, pageNumber - 1))];
  if (!data) return;
  setCurrentPdfPage(data.pageNumber);
  const viewport = document.getElementById('pdfPageViewport');
  const offset = data.element.offsetTop + (destinationTop === null ? 0 : Math.max(0, (data.page.view[3] - destinationTop) * viewerScale));
  viewport.scrollTo({ top: Math.max(0, offset - 8), behavior: 'smooth' });
  renderPdfPage(data.pageNumber);
}

async function goToBookmark(item) {
  try {
    const destination = typeof item.dest === 'string'
      ? await viewerPdfDocument.getDestination(item.dest)
      : item.dest;
    if (!Array.isArray(destination) || !destination.length) return;
    const pageNumber = await viewerPdfDocument.getPageIndex(destination[0]) + 1;
    const top = typeof destination[3] === 'number' ? destination[3] : null;
    scrollToPdfPage(pageNumber, top);
  } catch (error) {
    setViewerMessage(`Could not open bookmark: ${error.message}`);
  }
}

function buildBookmarkList() {
  const list = document.getElementById('pdfOutlineList');
  list.replaceChildren();
  return viewerPdfDocument.getOutline().then(outline => {
    if (!outline?.length) {
      list.textContent = 'No bookmarks in this document.';
      return;
    }
    const addItems = (parent, items, root = false) => {
      const group = document.createElement('ul');
      group.className = `pdf-bookmark-group${root ? ' root' : ''}`;
      for (const item of items) {
        const row = document.createElement('li');
        const rowActions = document.createElement('div');
        rowActions.className = 'pdf-bookmark-row';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pdf-bookmark-link';
        button.textContent = item.title || 'Untitled bookmark';
        button.addEventListener('click', () => goToBookmark(item));
        rowActions.appendChild(button);
        row.appendChild(rowActions);
        if (item.items?.length) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'pdf-subbookmarks-toggle';
          toggle.textContent = '›';
          toggle.setAttribute('aria-label', `Show sub-bookmarks for ${item.title}`);
          toggle.setAttribute('aria-expanded', 'false');
          const children = document.createElement('div');
          children.className = 'pdf-subbookmarks';
          children.hidden = true;
          addItems(children, item.items);
          toggle.addEventListener('click', () => {
            children.hidden = !children.hidden;
            toggle.textContent = children.hidden ? '›' : '⌄';
            toggle.setAttribute('aria-expanded', String(!children.hidden));
          });
          rowActions.appendChild(toggle);
          row.appendChild(children);
        }
        group.appendChild(row);
      }
      parent.appendChild(group);
    };
    addItems(list, outline, true);
  });
}

function setOutlineWidth(width) {
  const viewer = document.getElementById('processedPdfViewer');
  const pane = document.getElementById('pdfOutlinePane');
  const max = Math.max(132, Math.min(420, viewer.clientWidth * 0.55, viewer.clientWidth - 220));
  const value = Math.max(Math.min(132, max), Math.min(max, width));
  pane.dataset.expandedWidth = String(value);
  if (!pane.classList.contains('collapsed')) pane.style.flexBasis = `${value}px`;
}

function toggleOutlinePane() {
  const pane = document.getElementById('pdfOutlinePane');
  const toggle = document.getElementById('pdfOutlineToggle');
  const currentWidth = pane.getBoundingClientRect().width;
  const anchor = capturePdfPosition();
  const collapsed = pane.classList.toggle('collapsed');
  if (collapsed) {
    pane.dataset.expandedWidth = String(currentWidth);
    pane.style.flexBasis = window.matchMedia('(max-width: 600px)').matches ? '34px' : '38px';
  } else {
    pane.style.flexBasis = `${Number(pane.dataset.expandedWidth) || 132}px`;
  }
  toggle.textContent = collapsed ? '›' : '‹';
  toggle.setAttribute('aria-label', collapsed ? 'Show bookmarks' : 'Hide bookmarks');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  if (viewerPdfDocument) schedulePdfLayout(anchor);
}

function installOutlineResizer() {
  const handle = document.getElementById('pdfOutlineResizer');
  const pane = document.getElementById('pdfOutlinePane');
  let pointerId = null;
  let resizeAnchor = null;
  handle.addEventListener('pointerdown', event => {
    if (pane.classList.contains('collapsed')) return;
    pointerId = event.pointerId;
    resizeAnchor = capturePdfPosition();
    handle.setPointerCapture(pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    const left = document.getElementById('processedPdfViewer').getBoundingClientRect().left;
    setOutlineWidth(event.clientX - left);
  });
  const finishResize = event => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    if (viewerPdfDocument) resizePdfLayout(resizeAnchor);
    resizeAnchor = null;
  };
  handle.addEventListener('pointerup', finishResize);
  handle.addEventListener('pointercancel', finishResize);
  handle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (pane.classList.contains('collapsed')) return;
    event.preventDefault();
    const anchor = capturePdfPosition();
    setOutlineWidth(pane.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 16 : -16));
    resizePdfLayout(anchor);
  });
}

function resizePdfLayout(anchor = capturePdfPosition()) {
  if (!viewerPdfDocument || !viewerPages.length) return;
  const viewport = document.getElementById('pdfPageViewport');
  const maximumWidth = Math.max(...viewerPages.map(page => page.baseViewport.width));
  viewerFitScale = Math.max(0.1, (viewport.clientWidth - 16) / maximumWidth);
  viewerScale = viewerFitScale * viewerZoomFactor;
  applyPdfScale(anchor);
}

function schedulePdfLayout(anchor = capturePdfPosition()) {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => resizePdfLayout(anchor), 220);
}

window.addEventListener('message', event => {
  const sameOrigin = event.origin === window.location.origin || (window.location.origin === 'null' && event.origin === 'null');
  if (!sameOrigin || event.source !== window.opener || event.data?.type !== 'load-processed-pdf') return;
  sourceBuffer = event.data.buffer;
  sourceFileName = event.data.name || 'processed_highlighted.pdf';
  loadProcessedPdf(sourceBuffer);
});

document.getElementById('pdfOutlineToggle').addEventListener('click', toggleOutlinePane);
document.getElementById('pdfPrevPage').addEventListener('click', () => scrollToPdfPage(Number(document.getElementById('pdfCurrentPage').value) - 1));
document.getElementById('pdfNextPage').addEventListener('click', () => scrollToPdfPage(Number(document.getElementById('pdfCurrentPage').value) + 1));
document.getElementById('pdfZoomOut').addEventListener('click', () => setPdfZoom(viewerZoomFactor / 1.2));
document.getElementById('pdfZoomIn').addEventListener('click', () => setPdfZoom(viewerZoomFactor * 1.2));
document.getElementById('pdfFitWidth').addEventListener('click', () => {
  viewerZoomFactor = 1;
  const viewport = document.getElementById('pdfPageViewport');
  resizePdfLayout(capturePdfPosition(viewport.clientHeight / 2, viewport.clientWidth / 2));
});

const pdfTouchViewport = document.getElementById('pdfPageViewport');
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let pinchAnchor = null;
let pinchLastAnchor = null;
let pinchMoveFrame = 0;
let pendingPinchZoom = null;
function touchDistance(first, second) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}
function touchMidpointY(first, second) {
  return (first.clientY + second.clientY) / 2 - pdfTouchViewport.getBoundingClientRect().top;
}
function touchMidpointX(first, second) {
  return (first.clientX + second.clientX) / 2 - pdfTouchViewport.getBoundingClientRect().left;
}
pdfTouchViewport.addEventListener('touchstart', event => {
  if (event.touches.length !== 2) return;
  if (event.cancelable) event.preventDefault();
  pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
  pinchStartZoom = viewerZoomFactor;
  const screenY = touchMidpointY(event.touches[0], event.touches[1]);
  const screenX = touchMidpointX(event.touches[0], event.touches[1]);
  pinchAnchor = capturePdfPosition(screenY, screenX);
  pinchLastAnchor = pinchAnchor;
}, { passive: false });
pdfTouchViewport.addEventListener('touchmove', event => {
  if (event.touches.length !== 2 || !pinchStartDistance || !pinchAnchor) return;
  event.preventDefault();
  const distance = touchDistance(event.touches[0], event.touches[1]);
  const screenY = touchMidpointY(event.touches[0], event.touches[1]);
  const screenX = touchMidpointX(event.touches[0], event.touches[1]);
  const anchor = { ...pinchAnchor, screenY, screenX };
  pinchLastAnchor = anchor;
  pendingPinchZoom = {
    factor: pinchStartZoom * Math.pow(distance / pinchStartDistance, PINCH_ZOOM_SENSITIVITY),
    anchor
  };
  if (pinchMoveFrame) return;
  pinchMoveFrame = requestAnimationFrame(() => {
    pinchMoveFrame = 0;
    if (!pendingPinchZoom) return;
    setPdfZoom(pendingPinchZoom.factor, pendingPinchZoom.anchor, true);
    pendingPinchZoom = null;
  });
}, { passive: false });
function finishPdfPinch(event) {
  if (event.touches.length < 2) {
    if (pinchStartDistance && viewerPdfDocument) {
      if (pinchMoveFrame) cancelAnimationFrame(pinchMoveFrame);
      pinchMoveFrame = 0;
      if (pendingPinchZoom) setPdfZoom(pendingPinchZoom.factor, pendingPinchZoom.anchor, true);
      pendingPinchZoom = null;
      applyPdfScale(pinchLastAnchor);
    }
    pinchStartDistance = 0;
    pinchAnchor = null;
    pinchLastAnchor = null;
  }
}
pdfTouchViewport.addEventListener('touchend', finishPdfPinch, { passive: true });
pdfTouchViewport.addEventListener('touchcancel', finishPdfPinch, { passive: true });
document.getElementById('pdfCurrentPage').addEventListener('change', event => {
  scrollToPdfPage(Math.min(viewerPages.length || 1, Math.max(1, Number(event.target.value) || 1)));
});
document.getElementById('pdfSaveButton').addEventListener('click', () => {
  if (!sourceBuffer) return;
  const url = URL.createObjectURL(new Blob([sourceBuffer], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = sourceFileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
installOutlineResizer();
let resizeTimer;
window.addEventListener('resize', () => schedulePdfLayout());
window.addEventListener('orientationchange', () => schedulePdfLayout());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => schedulePdfLayout());

if (window.opener) window.opener.postMessage({ type: 'pdf-viewer-ready' }, viewerTargetOrigin());
