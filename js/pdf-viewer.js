let viewerPdfDocument = null;
let viewerRenderTask = null;
let viewerScale = 1;
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
    if (viewerRenderTask) viewerRenderTask.cancel();
    viewerPdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    document.getElementById('pdfPageCount').textContent = viewerPdfDocument.numPages;
    const pageInput = document.getElementById('pdfCurrentPage');
    pageInput.max = viewerPdfDocument.numPages;
    pageInput.value = 1;
    await renderViewerPage(1);
    await buildBookmarkList();
    document.getElementById('pdfViewerFileName').textContent = sourceFileName;
    document.title = `${sourceFileName} · Text Highlighter`;
    setViewerMessage('');
  } catch (error) {
    setViewerMessage(`Could not open PDF: ${error.message}`);
  }
}

async function renderViewerPage(pageNumber, destinationTop = null) {
  if (!viewerPdfDocument) return;
  if (viewerRenderTask) viewerRenderTask.cancel();
  const page = await viewerPdfDocument.getPage(pageNumber);
  const viewportElement = document.getElementById('pdfPageViewport');
  const canvas = document.getElementById('pdfPageCanvas');
  const context = canvas.getContext('2d', { alpha: false });
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(180, viewportElement.clientWidth - 30);
  viewerScale = Math.min(1.5, availableWidth / baseViewport.width);
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: viewerScale * outputScale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.width = `${Math.floor(baseViewport.width * viewerScale)}px`;
  canvas.style.height = `${Math.floor(baseViewport.height * viewerScale)}px`;
  document.getElementById('pdfCurrentPage').value = pageNumber;
  document.getElementById('pdfPrevPage').disabled = pageNumber <= 1;
  document.getElementById('pdfNextPage').disabled = pageNumber >= viewerPdfDocument.numPages;
  viewerRenderTask = page.render({ canvasContext: context, viewport });
  try {
    await viewerRenderTask.promise;
  } catch (error) {
    if (error.name !== 'RenderingCancelledException') throw error;
    return;
  }
  viewportElement.scrollTop = destinationTop === null
    ? 0
    : Math.max(0, (page.view[3] - destinationTop) * viewerScale - 16);
  viewportElement.scrollLeft = 0;
}

async function goToBookmark(item) {
  try {
    const destination = typeof item.dest === 'string'
      ? await viewerPdfDocument.getDestination(item.dest)
      : item.dest;
    if (!Array.isArray(destination) || !destination.length) return;
    const pageNumber = await viewerPdfDocument.getPageIndex(destination[0]) + 1;
    const top = typeof destination[3] === 'number' ? destination[3] : null;
    await renderViewerPage(pageNumber, top);
  } catch (error) {
    setViewerMessage(`Could not open bookmark: ${error.message}`);
  }
}

async function buildBookmarkList() {
  const list = document.getElementById('pdfOutlineList');
  list.replaceChildren();
  const outline = await viewerPdfDocument.getOutline();
  if (!outline?.length) {
    list.textContent = 'No bookmarks in this document.';
    return;
  }
  const addItems = (parent, items) => {
    const group = document.createElement('ul');
    group.className = `pdf-bookmark-group${parent === list ? ' root' : ''}`;
    for (const item of items) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-bookmark-link';
      button.textContent = item.title || 'Untitled bookmark';
      button.addEventListener('click', () => goToBookmark(item));
      row.appendChild(button);
      if (item.items?.length) addItems(row, item.items);
      group.appendChild(row);
    }
    parent.appendChild(group);
  };
  addItems(list, outline);
}

function setOutlineWidth(width) {
  const viewer = document.getElementById('processedPdfViewer');
  const pane = document.getElementById('pdfOutlinePane');
  const max = Math.max(130, Math.min(420, viewer.clientWidth * 0.55));
  const min = Math.min(130, max);
  const value = Math.max(min, Math.min(max, width));
  pane.dataset.expandedWidth = String(value);
  if (!pane.classList.contains('collapsed')) pane.style.flexBasis = `${value}px`;
}

function toggleOutlinePane() {
  const pane = document.getElementById('pdfOutlinePane');
  const toggle = document.getElementById('pdfOutlineToggle');
  const currentWidth = pane.getBoundingClientRect().width;
  const collapsed = pane.classList.toggle('collapsed');
  if (collapsed) {
    pane.dataset.expandedWidth = String(currentWidth);
    pane.style.flexBasis = '38px';
  } else {
    pane.style.flexBasis = `${Number(pane.dataset.expandedWidth) || 205}px`;
  }
  toggle.textContent = collapsed ? '›' : '‹';
  toggle.setAttribute('aria-label', collapsed ? 'Show bookmarks' : 'Hide bookmarks');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  if (viewerPdfDocument) setTimeout(() => renderViewerPage(Number(document.getElementById('pdfCurrentPage').value)), 200);
}

function installOutlineResizer() {
  const handle = document.getElementById('pdfOutlineResizer');
  const pane = document.getElementById('pdfOutlinePane');
  let pointerId = null;
  handle.addEventListener('pointerdown', event => {
    if (pane.classList.contains('collapsed')) return;
    pointerId = event.pointerId;
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
    if (viewerPdfDocument) renderViewerPage(Number(document.getElementById('pdfCurrentPage').value));
  };
  handle.addEventListener('pointerup', finishResize);
  handle.addEventListener('pointercancel', finishResize);
  handle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (pane.classList.contains('collapsed')) return;
    event.preventDefault();
    const width = pane.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 16 : -16);
    setOutlineWidth(width);
    if (viewerPdfDocument) renderViewerPage(Number(document.getElementById('pdfCurrentPage').value));
  });
}

window.addEventListener('message', event => {
  const sameOrigin = event.origin === window.location.origin || (window.location.origin === 'null' && event.origin === 'null');
  if (!sameOrigin || event.source !== window.opener || event.data?.type !== 'load-processed-pdf') return;
  sourceBuffer = event.data.buffer;
  sourceFileName = event.data.name || 'processed_highlighted.pdf';
  loadProcessedPdf(sourceBuffer);
});

document.getElementById('pdfOutlineToggle').addEventListener('click', toggleOutlinePane);
document.getElementById('pdfPrevPage').addEventListener('click', () => renderViewerPage(Number(document.getElementById('pdfCurrentPage').value) - 1));
document.getElementById('pdfNextPage').addEventListener('click', () => renderViewerPage(Number(document.getElementById('pdfCurrentPage').value) + 1));
document.getElementById('pdfCurrentPage').addEventListener('change', event => {
  const pageNumber = Math.min(viewerPdfDocument?.numPages || 1, Math.max(1, Number(event.target.value) || 1));
  renderViewerPage(pageNumber);
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
window.addEventListener('resize', () => {
  if (viewerPdfDocument) renderViewerPage(Number(document.getElementById('pdfCurrentPage').value));
});

if (window.opener) window.opener.postMessage({ type: 'pdf-viewer-ready' }, viewerTargetOrigin());
