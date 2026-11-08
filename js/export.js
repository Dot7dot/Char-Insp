/**
 * 匯出
 * - 文字資料：JSON / CSV（只有文字，不含圖片）
 * - 圖片：另外打包成 ZIP
 */
(function () {
  'use strict';

  const IMAGE_FIELDS = ['icon', 'head', 'picture'];

  /** 只保留文字欄位 */
  function toText(character) {
    return {
      id: character.id,
      name: character.name || '',
      englishName: character.englishName || '',
      description: character.description || '',
      dialogues: (character.dialogues || []).map((d) => d.text),
      createdAt: new Date(character.createdAt).toISOString(),
      updatedAt: new Date(character.updatedAt).toISOString(),
    };
  }

  function buildJson(characters) {
    const items = characters.map(toText);
    return JSON.stringify(
      {
        app: 'Char-Insp',
        version: 2,
        exportedAt: new Date().toISOString(),
        count: items.length,
        characters: items,
      },
      null,
      2
    );
  }

  /** RFC 4180：含逗號、引號、換行的欄位要用雙引號包起來，雙引號要變成兩個 */
  function csvCell(value) {
    const s = value == null ? '' : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(characters) {
    const rows = [['ID', 'Name', 'English Name', 'Description', 'Dialogue']];
    for (const c of characters) {
      const t = toText(c);
      // 多句對話放在同一格，以換行分隔
      rows.push([t.id, t.name, t.englishName, t.description, t.dialogues.join('\n')]);
    }
    // 加上 UTF-8 BOM，Excel 開啟中文才不會變亂碼
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  /** 移除檔名中不合法的字元 */
  function safeName(s, fallback) {
    const cleaned = String(s || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 80);
    return cleaned || fallback;
  }

  /** 角色在 ZIP 裡的資料夾名稱：優先用 English Name，其次 Name */
  function folderNameFor(character) {
    return safeName(character.englishName || character.name, character.id);
  }

  /** 圖片檔名（保留副檔名；沒有副檔名時依 MIME type 補上） */
  function imageFileName(img) {
    const raw = img.fileName || '';
    const m = /^(.*?)(\.[a-z0-9]{1,5})?$/i.exec(raw);
    let stem = m[1];
    let ext = m[2];
    if (!ext) {
      const sub = (img.mimeType || '').split('/')[1] || 'png';
      ext = '.' + sub.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    }
    return safeName(stem, 'image') + ext.toLowerCase();
  }

  /**
   * ZIP 結構：
   *   <角色資料夾>/icon/01_原檔名.png
   *   <角色資料夾>/head/01_原檔名.png
   *   <角色資料夾>/picture/01_原檔名.png
   * 圖片從 IndexedDB 讀出；讀不到的圖片會略過並計入 missing。
   */
  async function collectImageFiles(characters) {
    const files = [];
    let missing = 0;
    const usedFolders = new Set();
    for (const c of characters) {
      const base = folderNameFor(c);
      let folder = base;
      for (let i = 2; usedFolders.has(folder.toLowerCase()); i++) folder = `${base}_${i}`;
      usedFolders.add(folder.toLowerCase());

      for (const field of IMAGE_FIELDS) {
        const list = c[field] || [];
        for (let i = 0; i < list.length; i++) {
          const img = list[i];
          const rec = img.broken ? null : await CharDB.getImage(img.id).catch(() => null);
          if (!rec || !rec.data) {
            missing++;
            continue;
          }
          const num = String(i + 1).padStart(2, '0');
          files.push({ path: `${folder}/${field}/${num}_${imageFileName(img)}`, data: new Uint8Array(rec.data) });
        }
      }
    }
    return { files, missing };
  }

  function countImages(characters) {
    return characters.reduce(
      (n, c) => n + IMAGE_FIELDS.reduce((m, f) => m + (c[f] || []).filter((i) => !i.broken).length, 0),
      0
    );
  }

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function download(content, fileName, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /**
   * @param {Array} characters
   * @param {{text: 'json'|'csv'|null, images: boolean, baseName?: string}} options
   * @returns {Promise<{files: string[], missing: number}>} 已下載的檔名、無法讀取而略過的圖片數
   */
  async function exportCharacters(characters, options) {
    const base = options.baseName || `characters_${timestamp()}`;
    const downloaded = [];
    let missing = 0;

    if (options.text === 'csv') {
      download(buildCsv(characters), `${base}.csv`, 'text/csv;charset=utf-8');
      downloaded.push(`${base}.csv`);
    } else if (options.text === 'json') {
      download(buildJson(characters), `${base}.json`, 'application/json;charset=utf-8');
      downloaded.push(`${base}.json`);
    }

    if (options.images) {
      const collected = await collectImageFiles(characters);
      const files = collected.files;
      missing = collected.missing;
      if (files.length) {
        const zip = await MiniZip.createZip(files);
        download(zip, `${base}_images.zip`);
        downloaded.push(`${base}_images.zip`);
      }
    }
    return { files: downloaded, missing };
  }

  window.CharExport = { exportCharacters, buildJson, buildCsv, collectImageFiles, countImages, download };
})();
