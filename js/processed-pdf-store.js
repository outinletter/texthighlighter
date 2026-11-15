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
