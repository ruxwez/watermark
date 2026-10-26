const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('watermark', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('settings');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function readSettings() {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeSettings(value) {
  const db = await open();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, 'workspace');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
