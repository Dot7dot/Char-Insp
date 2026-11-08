/**
 * 匯出：JSON / CSV
 */
(function () {
  'use strict';

  const IMAGE_FIELDS = ['icon', 'picture', 'head'];

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /** 把內部資料轉成乾淨、可攜的物件（圖片 Blob → Base64 或檔名） */
  async function toPortable(character, embedImages) {
    const out = {
      id: character.id,
      name: character.name || '',
      englishName: character.englishName || '',
      description: character.description || '',
    };
    for (const key of IMAGE_FIELDS) {
      const img = character[key];
      if (!img) {
        out[key] = null;
        continue;
      }
      out[key] = {
        fileName: img.fileName || '',
        mimeType: img.mimeType || (img.blob && img.blob.type) || '',
      };
      if (embedImages && img.blob) {
        out[key].dataUrl = await blobToDataUrl(img.blob);
      }
    }
    out.dialogues = (character.dialogues || []).map((d) => d.text);
    out.createdAt = new Date(character.createdAt).toISOString();
    out.updatedAt = new Date(character.updatedAt).toISOString();
    return out;
  }

  async function buildJson(characters, embedImages) {
    const items = [];
    for (const c of characters) items.push(await toPortable(c, embedImages));
    const payload = {
      app: 'Char-Insp',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: items.length,
      characters: items,
    };
    return JSON.stringify(payload, null, 2);
  }

  /** RFC 4180：含逗號、引號、換行的欄位要用雙引號包起來，雙引號要變成兩個 */
  function csvCell(value) {
    const s = value == null ? '' : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function buildCsv(characters, embedImages) {
    const header = ['ID', 'Name', 'English Name', 'Description', 'Icon', 'Picture', 'Head', 'Dialogue'];
    const rows = [header];
    for (const c of characters) {
      const p = await toPortable(c, embedImages);
      const img = (v) => (v ? (embedImages && v.dataUrl ? v.dataUrl : v.fileName) : '');
      rows.push([
        p.id,
        p.name,
        p.englishName,
        p.description,
        img(p.icon),
        img(p.picture),
        img(p.head),
        // 多句對話放在同一格，以換行分隔
        p.dialogues.join('\n'),
      ]);
    }
    // 加上 UTF-8 BOM，Excel 開啟中文才不會變亂碼
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function download(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * @param {Array} characters
   * @param {{format: 'json'|'csv', embedImages: boolean, baseName?: string}} options
   */
  async function exportCharacters(characters, options) {
    const base = options.baseName || `characters_${timestamp()}`;
    if (options.format === 'csv') {
      const csv = await buildCsv(characters, options.embedImages);
      download(csv, `${base}.csv`, 'text/csv;charset=utf-8');
      return `${base}.csv`;
    }
    const json = await buildJson(characters, options.embedImages);
    download(json, `${base}.json`, 'application/json;charset=utf-8');
    return `${base}.json`;
  }

  window.CharExport = { exportCharacters, buildJson, buildCsv };
})();
