(function () {
  const databaseName = 'text-highlighter-processed-pdf';
  const storeName = 'documents';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error('Processed PDF storage transaction was aborted.'));
      };
    });
  }

  // Opens the system save dialog (file picker / share sheet) without navigating away; falls back to a download.
  async function savePdfFile(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'saved';
      }
      const file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'saved';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      console.warn('Save dialog unavailable, falling back to download.', error);
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'saved';
  }

  window.savePdfFile = savePdfFile;
  window.processedPdfStore = {
    save(bytes, name) {
      const buffer = bytes instanceof Uint8Array
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : bytes.slice(0);
      return withStore('readwrite', store => store.put({ id: 'latest', buffer, name, updatedAt: Date.now() }));
    },
    load() {
      return withStore('readonly', store => store.get('latest'));
    }
  };
})();
