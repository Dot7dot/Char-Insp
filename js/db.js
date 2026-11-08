/**
 * 角色資料儲存（IndexedDB）
 *
 * 使用 IndexedDB 而不是 localStorage，因為圖片可能很大，
 * localStorage 只有約 5MB 而且只能存字串。
 *
 * 每個角色（= 一個資料夾）的資料結構：
 * {
 *   id: string,
 *   name: string,
 *   englishName: string,
 *   description: string,
 *   icon:    { blob: Blob, fileName: string, mimeType: string } | null,
 *   picture: { blob: Blob, fileName: string, mimeType: string } | null,
 *   head:    { blob: Blob, fileName: string, mimeType: string } | null,
 *   dialogues: [{ id: string, text: string }],
 *   createdAt: number,
 *   updatedAt: number
 * }
 */
(function () {
  'use strict';

  const DB_NAME = 'char-insp';
  const DB_VERSION = 1;
  const STORE = 'characters';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('此瀏覽器不支援 IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  /** 執行一個 request，等整個 transaction 完成（確實寫入）後才回傳結果 */
  async function run(mode, makeRequest) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = makeRequest(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error || req.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }

  const CharDB = {
    async getAll() {
      const items = await run('readonly', (store) => store.getAll());
      return (items || []).sort((a, b) => a.createdAt - b.createdAt);
    },
    put(character) {
      return run('readwrite', (store) => store.put(character));
    },
    remove(id) {
      return run('readwrite', (store) => store.delete(id));
    },
  };

  window.CharDB = CharDB;
})();
