/**
 * 極簡 ZIP 產生器 / 讀取器（產生時不壓縮 / STORE）
 *
 * 圖片（PNG / JPG / WebP…）本身已經壓縮過，再壓縮幾乎沒效果，
 * 所以直接用 STORE 模式打包，不需要任何外部函式庫，離線也能用。
 * 檔名使用 UTF-8（支援中文檔名）。
 */
(function () {
  'use strict';

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  async function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    if (typeof data === 'string') return new TextEncoder().encode(data);
    return new Uint8Array(data);
  }

  /**
   * @param {Array<{path: string, data: Blob|Uint8Array|string}>} files
   * @returns {Promise<Blob>}
   */
  async function createZip(files) {
    const encoder = new TextEncoder();
    const { time, day } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const name = encoder.encode(file.path);
      const data = await toBytes(file.data);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); // local file header signature
      local.setUint16(4, 20, true);         // version needed
      local.setUint16(6, 0x0800, true);     // flags: UTF-8 file name
      local.setUint16(8, 0, true);          // method: store
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(local.buffer, name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);    // central directory signature
      cd.setUint16(4, 20, true);            // version made by
      cd.setUint16(6, 20, true);            // version needed
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, day, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint16(30, 0, true);            // extra length
      cd.setUint16(32, 0, true);            // comment length
      cd.setUint16(34, 0, true);            // disk number
      cd.setUint16(36, 0, true);            // internal attrs
      cd.setUint32(38, 0, true);            // external attrs
      cd.setUint32(42, offset, true);
      central.push(cd.buffer, name);

      offset += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);     // end of central directory signature
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);

    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // ---------- 讀取 ZIP ----------

  async function readSlice(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  /**
   * 讀取 ZIP 的目錄（不會一次把整個檔案讀進記憶體）
   * @param {Blob} file
   * @returns {Promise<Map<string, {name, method, crc, compSize, size, localOffset}>>}
   */
  async function readZipEntries(file) {
    // End of central directory 在檔案最後 22 ~ 22+65535 bytes 內
    const tailStart = Math.max(0, file.size - 22 - 0xffff);
    const tail = await readSlice(file, tailStart, file.size);
    const tv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('這不是有效的 ZIP 檔案');

    const count = tv.getUint16(eocd + 10, true);
    const cdSize = tv.getUint32(eocd + 12, true);
    const cdOffset = tv.getUint32(eocd + 16, true);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('不支援 ZIP64 格式');

    const cd = await readSlice(file, cdOffset, cdOffset + cdSize);
    const v = new DataView(cd.buffer);
    const decoder = new TextDecoder('utf-8');
    const entries = new Map();
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 目錄損毀');
      const method = v.getUint16(p + 10, true);
      const crc = v.getUint32(p + 16, true);
      const compSize = v.getUint32(p + 20, true);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const localOffset = v.getUint32(p + 42, true);
      const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
      if (!name.endsWith('/')) entries.set(name, { name, method, crc, compSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  /** 讀出單一檔案內容（支援不壓縮 STORE，以及瀏覽器支援時的 DEFLATE） */
  async function readZipEntry(file, entry) {
    const header = await readSlice(file, entry.localOffset, entry.localOffset + 30);
    const hv = new DataView(header.buffer);
    if (hv.getUint32(0, true) !== 0x04034b50) throw new Error(`ZIP 檔案損毀：${entry.name}`);
    const start = entry.localOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const raw = await readSlice(file, start, start + entry.compSize);

    let data;
    if (entry.method === 0) {
      data = raw;
    } else if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('此瀏覽器無法解壓縮這個 ZIP，請使用本工具產生的備份檔');
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`不支援的壓縮方式（${entry.method}）：${entry.name}`);
    }
    if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`檔案內容損毀：${entry.name}`);
    return data;
  }

  window.MiniZip = { createZip, readZipEntries, readZipEntry, crc32 };
})();
