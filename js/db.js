/**
 * 角色資料儲存（IndexedDB）
 *
 * 兩個 object store：
 *   characters：角色文字資料 + 圖片清單（只有中繼資料，不含圖片本體）
 *     {
 *       id, name, englishName, description,
 *       icon / head / picture: [{ id, fileName, mimeType, size }],
 *       dialogues: [{ id, text }],
 *       createdAt, updatedAt
 *     }
 *   images：圖片本體 { id, data: ArrayBuffer, mimeType }
 *
 * 為什麼圖片要存 ArrayBuffer、而且跟角色分開存：
 *  - iPhone Safari 從相簿 / 相機選的檔案只是「暫存檔」，下一次選檔時舊的暫存檔會被刪除。
 *    如果只存 File / Blob 的參照，之後就讀不到了。所以上傳當下就把位元組完整讀出來存成 ArrayBuffer。
 *  - 改文字時只會寫入 characters，不會每次都重寫所有圖片。
 */
(function () {
  'use strict';

  const DB_NAME = 'char-insp';
  const DB_VERSION = 2;
  const CHARS = 'characters';
  const IMAGES = 'images';

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
        if (!db.objectStoreNames.contains(CHARS)) {
          db.createObjectStore(CHARS, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(IMAGES)) {
          db.createObjectStore(IMAGES, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // 其他分頁升級資料庫時，關閉這個連線，避免卡住
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('資料庫正在其他分頁使用中，請關閉其他「角色靈感庫」分頁後重新整理'));
    });
    return dbPromise;
  }

  /** 在一個 transaction 中執行；等 transaction 完成（確實寫入）才 resolve */
  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      try {
        result = fn(t);
      } catch (err) {
        try { t.abort(); } catch (_) { /* ignore */ }
        reject(err);
        return;
      }
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }

  const CharDB = {
    async getAll() {
      const items = await run([CHARS], 'readonly', (t) => t.objectStore(CHARS).getAll());
      return (items || []).sort((a, b) => a.createdAt - b.createdAt);
    },

    /**
     * 儲存角色；可同時新增 / 刪除圖片（同一個 transaction，要嘛全部成功、要嘛全部失敗）
     * @param {object} character
     * @param {{addImages?: Array<{id, data: ArrayBuffer, mimeType}>, deleteImageIds?: string[]}} [ops]
     */
    put(character, ops = {}) {
      return run([CHARS, IMAGES], 'readwrite', (t) => {
        const images = t.objectStore(IMAGES);
        // 先刪除再新增：同一個 id 同時出現在兩邊時（例如還原備份覆蓋自己），結果是「新增」
        (ops.deleteImageIds || []).forEach((id) => images.delete(id));
        (ops.addImages || []).forEach((img) => images.put(img));
        t.objectStore(CHARS).put(character);
      });
    },

    /** 刪除角色與它所有的圖片 */
    remove(id, imageIds = []) {
      return run([CHARS, IMAGES], 'readwrite', (t) => {
        imageIds.forEach((imgId) => t.objectStore(IMAGES).delete(imgId));
        t.objectStore(CHARS).delete(id);
      });
    },

    /** @returns {Promise<{id, data: ArrayBuffer, mimeType}|undefined>} */
    getImage(id) {
      return run([IMAGES], 'readonly', (t) => t.objectStore(IMAGES).get(id));
    },
  };

  window.CharDB = CharDB;
})();
