/**
 * 極簡 ZIP 產生器（不壓縮 / STORE）
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

  window.MiniZip = { createZip, crc32 };
})();
