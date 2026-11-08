/**
 * 完整備份 / 匯入還原
 *
 * 備份檔是一個 ZIP：
 *   backup.json        所有角色資料（文字、對話、圖片清單與順序）
 *   images/<id>.<ext>  每張圖片的原始檔
 */
(function () {
  'use strict';

  const IMAGE_FIELDS = ['icon', 'head', 'picture'];
  const MANIFEST = 'backup.json';
  const FORMAT_VERSION = 1;

  function extOf(img) {
    const m = /\.([a-z0-9]{1,5})$/i.exec(img.fileName || '');
    if (m) return m[1].toLowerCase();
    const sub = (img.mimeType || '').split('/')[1] || 'bin';
    return sub.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  }

  const imagePath = (img) => `images/${img.id}.${extOf(img)}`;

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  /**
   * 建立完整備份
   * @returns {Promise<{blob: Blob, fileName: string, characters: number, images: number, missing: number}>}
   */
  async function createBackup(characters, onProgress) {
    const files = [];
    let missing = 0;
    let done = 0;
    const total = characters.reduce((n, c) => n + IMAGE_FIELDS.reduce((m, f) => m + c[f].length, 0), 0);

    const out = [];
    for (const c of characters) {
      const copy = {
        id: c.id,
        name: c.name,
        englishName: c.englishName,
        description: c.description,
        dialogues: c.dialogues.map((d) => ({ id: d.id, text: d.text })),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
      for (const f of IMAGE_FIELDS) {
        copy[f] = [];
        for (const img of c[f]) {
          const meta = { id: img.id, fileName: img.fileName, mimeType: img.mimeType, size: img.size || 0 };
          const rec = img.broken ? null : await CharDB.getImage(img.id).catch(() => null);
          if (rec && rec.data) {
            meta.path = imagePath(img);
            meta.size = rec.data.byteLength;
            files.push({ path: meta.path, data: new Uint8Array(rec.data) });
          } else {
            meta.broken = true;
            missing++;
          }
          copy[f].push(meta);
          onProgress && onProgress(++done, total);
        }
      }
      out.push(copy);
    }

    const manifest = {
      app: 'Char-Insp',
      type: 'backup',
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      characterCount: out.length,
      imageCount: files.length,
      characters: out,
    };
    files.unshift({ path: MANIFEST, data: JSON.stringify(manifest, null, 2) });

    const blob = await MiniZip.createZip(files);
    return {
      blob,
      fileName: `char-insp-backup_${timestamp()}.zip`,
      characters: out.length,
      images: files.length - 1,
      missing,
    };
  }

  /**
   * 讀取備份檔（只讀目錄與 backup.json，圖片在還原時才逐一讀取）
   */
  async function readBackup(file) {
    let entries;
    try {
      entries = await MiniZip.readZipEntries(file);
    } catch (err) {
      throw new Error('無法讀取備份檔：' + err.message);
    }
    const entry = entries.get(MANIFEST);
    if (!entry) throw new Error('這不是角色靈感庫的備份檔（找不到 backup.json）。如果是「匯出」產生的 JSON / ZIP，無法用來還原。');

    let manifest;
    try {
      manifest = JSON.parse(new TextDecoder('utf-8').decode(await MiniZip.readZipEntry(file, entry)));
    } catch (err) {
      throw new Error('備份檔內容損毀：' + err.message);
    }
    if (!manifest || manifest.app !== 'Char-Insp' || manifest.type !== 'backup' || !Array.isArray(manifest.characters)) {
      throw new Error('這不是角色靈感庫的備份檔');
    }
    if (manifest.version > FORMAT_VERSION) {
      throw new Error('這個備份檔是較新版本建立的，請重新整理網頁更新到最新版後再試');
    }

    const imageCount = manifest.characters.reduce(
      (n, c) => n + IMAGE_FIELDS.reduce((m, f) => m + (c[f] || []).filter((i) => i.path).length, 0),
      0
    );
    return { file, entries, manifest, imageCount };
  }

  /** 把備份中的角色整理成目前的資料格式 */
  function cleanCharacter(c) {
    const now = Date.now();
    const str = (v) => (typeof v === 'string' ? v : '');
    const out = {
      id: str(c.id) || (crypto.randomUUID ? crypto.randomUUID() : String(now) + Math.random()),
      name: str(c.name),
      englishName: str(c.englishName),
      description: str(c.description),
      dialogues: (Array.isArray(c.dialogues) ? c.dialogues : [])
        .map((d, i) => (typeof d === 'string' ? { id: `d${i}_${now}`, text: d } : { id: str(d && d.id) || `d${i}_${now}`, text: str(d && d.text) })),
      createdAt: Number(c.createdAt) || now,
      updatedAt: Number(c.updatedAt) || now,
    };
    for (const f of IMAGE_FIELDS) {
      out[f] = (Array.isArray(c[f]) ? c[f] : []).filter((i) => i && i.id).map((i) => ({
        id: String(i.id),
        fileName: str(i.fileName) || 'image',
        mimeType: str(i.mimeType),
        size: Number(i.size) || 0,
        path: str(i.path),
        broken: !!i.broken,
      }));
    }
    return out;
  }

  /**
   * 還原
   * @param {object} backup  readBackup() 的結果
   * @param {'merge'|'replace'} mode
   *   merge：保留目前資料；備份中相同的角色（同 ID）會被備份版本覆蓋，其餘新增
   *   replace：匯入備份後，刪除備份中沒有的角色（先匯入、成功後才刪除，中途失敗也不會遺失原本的資料）
   * @param {Array} existing  目前的角色（merge 時用來刪除被覆蓋角色的舊圖片）
   */
  async function restoreBackup(backup, mode, existing, onProgress) {
    const { file, entries, manifest, imageCount } = backup;
    const existingById = new Map(existing.map((c) => [c.id, c]));
    let done = 0;
    let missing = 0;
    let replaced = 0;
    let added = 0;
    let removed = 0;
    const restoredIds = new Set();

    for (const raw of manifest.characters) {
      const c = cleanCharacter(raw);
      restoredIds.add(c.id);
      // 一次處理一個角色：讀出它的圖片 → 和角色資料一起寫入（同一個 transaction）
      const addImages = [];
      for (const f of IMAGE_FIELDS) {
        for (const img of c[f]) {
          const entry = img.path && entries.get(img.path);
          if (entry && !img.broken) {
            try {
              const bytes = await MiniZip.readZipEntry(file, entry);
              const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
              addImages.push({ id: img.id, data, mimeType: img.mimeType });
              img.size = data.byteLength;
            } catch (err) {
              console.warn(err);
              img.broken = true;
            }
            onProgress && onProgress(++done, imageCount);
          } else {
            img.broken = true;
          }
          if (img.broken) missing++;
          delete img.path;
          if (!img.broken) delete img.broken;
        }
      }

      const old = existingById.get(c.id);
      const deleteImageIds = old ? IMAGE_FIELDS.flatMap((f) => (old[f] || []).map((i) => i.id)) : [];
      await CharDB.put(c, { addImages, deleteImageIds });
      if (old) replaced++;
      else added++;
    }

    if (mode === 'replace') {
      for (const old of existing) {
        if (restoredIds.has(old.id)) continue;
        await CharDB.remove(old.id, IMAGE_FIELDS.flatMap((f) => (old[f] || []).map((i) => i.id)));
        removed++;
      }
    }

    return { characters: manifest.characters.length, added, replaced, removed, missing };
  }

  // ---------- 上次備份時間（存在 localStorage，只是提醒用） ----------
  const LAST_KEY = 'char-insp:lastBackupAt';
  function getLastBackupAt() {
    try {
      return Number(localStorage.getItem(LAST_KEY)) || 0;
    } catch (_) {
      return 0;
    }
  }
  function setLastBackupAt(ts) {
    try {
      localStorage.setItem(LAST_KEY, String(ts));
    } catch (_) {
      /* ignore */
    }
  }

  window.CharBackup = { createBackup, readBackup, restoreBackup, getLastBackupAt, setLastBackupAt };
})();
