/**
 * 角色靈感庫 - 主程式
 */
(function () {
  'use strict';

  const IMAGE_FIELDS = ['icon', 'head', 'picture'];
  const TEXT_FIELDS = ['name', 'englishName', 'description'];
  const SAVE_DELAY = 400;

  const state = {
    characters: [],
    selectedId: null,
    query: '',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = {
    list: $('#folder-list'),
    count: $('#folder-count'),
    search: $('#search'),
    editor: $('#editor'),
    btnNew: $('#btn-new'),
    btnExport: $('#btn-export'),
    fileInput: $('#file-input'),
    dialog: $('#export-dialog'),
    viewer: $('#viewer'),
    toast: $('#toast'),
  };

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const current = () => state.characters.find((c) => c.id === state.selectedId) || null;
  const displayName = (c) => c.name.trim() || c.englishName.trim() || '未命名角色';
  const allImageIds = (c) => IMAGE_FIELDS.flatMap((f) => c[f].map((img) => img.id));
  const errMsg = (err) => (err && err.message) || String(err);

  // ---------- 圖片網址（從 IndexedDB 讀出後建立 object URL，並快取） ----------
  const urlCache = new Map(); // imageId -> Promise<string|null>

  function imageUrl(img) {
    if (img.broken) return Promise.resolve(null);
    let p = urlCache.get(img.id);
    if (!p) {
      p = CharDB.getImage(img.id)
        .then((rec) => (rec && rec.data ? URL.createObjectURL(new Blob([rec.data], { type: rec.mimeType || img.mimeType })) : null))
        .catch((err) => {
          console.error(err);
          return null;
        });
      urlCache.set(img.id, p);
    }
    return p;
  }

  function cacheUrlFromData(id, data, type) {
    urlCache.set(id, Promise.resolve(URL.createObjectURL(new Blob([data], { type }))));
  }

  function releaseUrl(id) {
    const p = urlCache.get(id);
    if (!p) return;
    urlCache.delete(id);
    p.then((url) => url && URL.revokeObjectURL(url));
  }

  /** 只保留目前角色與左側縮圖用到的圖片網址，其他釋放掉（手機記憶體有限） */
  function pruneUrls() {
    const keep = new Set();
    const c = current();
    if (c) allImageIds(c).forEach((id) => keep.add(id));
    state.characters.forEach((x) => {
      const t = thumbOf(x);
      if (t) keep.add(t.id);
    });
    [...urlCache.keys()].forEach((id) => keep.has(id) || releaseUrl(id));
  }

  const thumbOf = (c) => c.icon.find((i) => !i.broken) || c.head.find((i) => !i.broken) || null;

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('is-error', !!isError);
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), isError ? 5000 : 2600);
  }

  // ---------- 儲存 ----------
  const pendingSaves = new Map();

  function save(character, ops) {
    setSaveState('儲存中…');
    return CharDB.put(character, ops)
      .then(() => {
        if (!pendingSaves.size) setSaveState('已自動儲存');
      })
      .catch((err) => {
        console.error(err);
        setSaveState('儲存失敗');
        toast('儲存失敗：' + errMsg(err), true);
        throw err;
      });
  }

  /** 文字修改：防抖後儲存 */
  function scheduleSave(character, immediate) {
    character.updatedAt = Date.now();
    clearTimeout(pendingSaves.get(character.id));
    if (immediate) {
      pendingSaves.delete(character.id);
      save(character).catch(() => {});
      return;
    }
    setSaveState('儲存中…');
    pendingSaves.set(
      character.id,
      setTimeout(() => {
        pendingSaves.delete(character.id);
        save(character).catch(() => {});
      }, SAVE_DELAY)
    );
  }

  function flushSaves() {
    for (const [id, timer] of pendingSaves) {
      clearTimeout(timer);
      const c = state.characters.find((x) => x.id === id);
      if (c) CharDB.put(c).catch(() => {});
    }
    pendingSaves.clear();
  }

  function setSaveState(text) {
    const node = el.editor.querySelector('[data-bind="saveState"]');
    if (node) node.textContent = text;
  }

  /** 請瀏覽器把資料標記為「持久保存」，降低被系統自動清除的機會 */
  let persistAsked = false;
  function requestPersist() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
  }

  // ---------- 左側資料夾列表 ----------
  function renderList() {
    const q = state.query.trim().toLowerCase();
    const items = state.characters.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.englishName.toLowerCase().includes(q)
    );

    el.list.replaceChildren(
      ...items.map((c) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'folder' + (c.id === state.selectedId ? ' is-active' : '');
        btn.dataset.id = c.id;

        btn.insertAdjacentHTML(
          'beforeend',
          '<svg class="folder-thumb folder-thumb-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
        );
        const thumb = thumbOf(c);
        if (thumb) {
          imageUrl(thumb).then((url) => {
            if (!url || !btn.isConnected) return;
            const img = document.createElement('img');
            img.className = 'folder-thumb';
            img.alt = '';
            img.src = url;
            btn.firstElementChild.replaceWith(img);
          });
        }

        const text = document.createElement('span');
        text.className = 'folder-text';
        const name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = displayName(c);
        const sub = document.createElement('span');
        sub.className = 'folder-sub';
        sub.textContent = c.name.trim() && c.englishName.trim() ? c.englishName : `${c.dialogues.length} 句對話`;
        text.append(name, sub);
        btn.appendChild(text);

        li.appendChild(btn);
        return li;
      })
    );

    if (!state.characters.length) {
      el.count.textContent = '還沒有任何角色';
    } else if (q) {
      el.count.textContent = `找到 ${items.length} / ${state.characters.length} 個角色`;
    } else {
      el.count.textContent = `共 ${state.characters.length} 個角色`;
    }
  }

  // ---------- 右側編輯器 ----------
  function renderEditor() {
    const c = current();
    if (!c) {
      el.editor.replaceChildren($('#tpl-empty').content.cloneNode(true));
      return;
    }
    const frag = $('#tpl-editor').content.cloneNode(true);
    const root = frag.firstElementChild;

    root.querySelector('[data-bind="title"]').textContent = displayName(c);

    for (const field of TEXT_FIELDS) {
      const input = root.querySelector(`[data-field="${field}"]`);
      input.value = c[field];
      input.addEventListener('input', () => {
        c[field] = input.value;
        if (field !== 'description') {
          root.querySelector('[data-bind="title"]').textContent = displayName(c);
          renderList();
        }
        scheduleSave(c);
      });
    }

    for (const field of IMAGE_FIELDS) {
      setupGallery(root.querySelector(`[data-image="${field}"]`), c, field);
    }

    renderDialogues(root, c);

    const input = root.querySelector('[data-bind="dialogueInput"]');
    const addDialogue = () => {
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      c.dialogues.push({ id: uid(), text });
      input.value = '';
      renderDialogues(root, c);
      renderList();
      scheduleSave(c, true);
      input.focus();
      const list = root.querySelector('[data-bind="dialogueList"]');
      list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'nearest' });
    };
    root.querySelector('[data-action="add-dialogue"]').addEventListener('click', addDialogue);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addDialogue();
      }
    });

    root.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCharacter(c));

    el.editor.replaceChildren(frag);
  }

  // ---------- 圖片（每一類可多張） ----------
  function setupGallery(block, c, field) {
    const render = () => renderGallery(block, c, field);

    // 整個區塊都可以拖曳圖片進來
    block.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      block.classList.add('is-dragover');
    });
    block.addEventListener('dragleave', (e) => {
      if (!block.contains(e.relatedTarget)) block.classList.remove('is-dragover');
    });
    block.addEventListener('drop', (e) => {
      e.preventDefault();
      block.classList.remove('is-dragover');
      addImages(c, field, e.dataTransfer.files, render);
    });

    render();
  }

  function renderGallery(block, c, field) {
    const grid = block.querySelector('[data-bind="grid"]');
    const images = c[field];
    block.querySelector('[data-bind="count"]').textContent = images.length;

    const tiles = images.map((img, i) => {
      const tile = document.createElement('div');
      tile.className = 'tile is-loading';

      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'tile-link';
      view.title = `放大檢視：${img.fileName}`;
      const pic = document.createElement('img');
      pic.alt = img.fileName;
      view.appendChild(pic);

      const markBroken = () => {
        tile.classList.remove('is-loading');
        tile.classList.add('is-broken');
        view.disabled = true;
        view.replaceChildren();
        view.insertAdjacentHTML(
          'beforeend',
          '<span class="tile-broken"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>無法讀取<br>請移除後重新上傳</span>'
        );
      };

      imageUrl(img).then((url) => {
        if (!url) return markBroken();
        pic.onload = () => tile.classList.remove('is-loading');
        pic.onerror = markBroken;
        pic.src = url;
        view.addEventListener('click', () => openViewer(url, img.fileName));
      });

      const tools = document.createElement('div');
      tools.className = 'tile-tools';
      if (i > 0) {
        const left = document.createElement('button');
        left.type = 'button';
        left.className = 'chip';
        left.textContent = '←';
        left.title = '往前移';
        left.setAttribute('aria-label', `把 ${img.fileName} 往前移`);
        left.addEventListener('click', () => {
          [images[i - 1], images[i]] = [images[i], images[i - 1]];
          renderGallery(block, c, field);
          renderList();
          scheduleSave(c, true);
        });
        tools.appendChild(left);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip chip-danger';
      remove.textContent = '移除';
      remove.setAttribute('aria-label', `移除 ${img.fileName}`);
      remove.addEventListener('click', async () => {
        const before = c[field];
        c[field] = before.filter((x) => x.id !== img.id);
        c.updatedAt = Date.now();
        try {
          await save(c, { deleteImageIds: [img.id] });
        } catch (_) {
          c[field] = before;
          return;
        }
        releaseUrl(img.id);
        renderGallery(block, c, field);
        renderList();
      });
      tools.appendChild(remove);

      const name = document.createElement('span');
      name.className = 'tile-filename';
      name.textContent = `${i + 1}. ${img.fileName}`;
      name.title = img.fileName;

      tile.append(view, tools, name);
      return tile;
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tile tile-add';
    add.setAttribute('aria-label', '新增圖片');
    add.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>新增圖片</span>';
    add.addEventListener('click', () =>
      pickFiles((files) => addImages(c, field, files, () => renderGallery(block, c, field)))
    );

    grid.replaceChildren(...tiles, add);
  }

  function pickFiles(onPick) {
    el.fileInput.onchange = () => {
      const files = Array.from(el.fileInput.files || []);
      if (files.length) onPick(files);
    };
    el.fileInput.value = '';
    el.fileInput.click();
  }

  // 某些系統不會提供檔案的 MIME type，這時依副檔名判斷
  const EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
    heic: 'image/heic', heif: 'image/heif',
  };
  function imageType(file) {
    if (file.type) return file.type.startsWith('image/') ? file.type : '';
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1];
    return (ext && EXT_MIME[ext.toLowerCase()]) || '';
  }

  /** 讀取檔案內容；舊版瀏覽器沒有 File.arrayBuffer 時改用 FileReader */
  function readFile(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  let uploading = 0;
  async function addImages(c, field, fileList, rerender) {
    const files = Array.from(fileList || []);
    const images = files.filter((f) => imageType(f));
    if (files.length && !images.length) {
      toast('只能上傳圖片檔案', true);
      return;
    }
    if (!images.length) return;
    requestPersist();

    uploading++;
    setSaveState(`讀取 ${images.length} 張圖片中…`);
    // 立刻把檔案內容讀進記憶體（iPhone 的暫存檔之後可能會被系統刪除）
    const results = await Promise.all(
      images.map((file) =>
        readFile(file).then(
          (data) => ({ file, data }),
          (err) => ({ file, err })
        )
      )
    );
    uploading--;

    const ok = results.filter((r) => r.data);
    const failed = results.filter((r) => r.err);
    const skipped = files.length - images.length;

    if (ok.length) {
      const metas = [];
      const records = [];
      for (const { file, data } of ok) {
        const id = uid();
        const type = imageType(file);
        metas.push({ id, fileName: file.name || `image_${metas.length + 1}`, mimeType: type, size: data.byteLength });
        records.push({ id, data, mimeType: type });
      }
      c[field].push(...metas);
      c.updatedAt = Date.now();
      try {
        await save(c, { addImages: records });
        records.forEach((r) => cacheUrlFromData(r.id, r.data, r.mimeType));
      } catch (_) {
        // 儲存失敗：還原，不要讓畫面顯示沒存起來的圖片
        const ids = new Set(metas.map((m) => m.id));
        c[field] = c[field].filter((m) => !ids.has(m.id));
      }
      if (current() === c) rerender();
      renderList();
    } else if (!uploading) {
      setSaveState('');
    }

    if (failed.length) {
      console.error(failed.map((f) => f.err));
      toast(`有 ${failed.length} 張圖片讀取失敗，請重新選擇：${failed.map((f) => f.file.name).join('、')}`, true);
    } else if (skipped) {
      toast(`已略過 ${skipped} 個非圖片檔案`, true);
    }
  }

  // ---------- 圖片檢視 ----------
  function openViewer(url, name) {
    el.viewer.querySelector('[data-bind="img"]').src = url;
    el.viewer.querySelector('[data-bind="img"]').alt = name;
    el.viewer.querySelector('[data-bind="name"]').textContent = name;
    el.viewer.showModal();
  }
  el.viewer.querySelector('[data-action="close"]').addEventListener('click', () => el.viewer.close());
  el.viewer.addEventListener('click', (e) => {
    if (e.target === el.viewer || e.target.tagName === 'IMG') el.viewer.close();
  });
  el.viewer.addEventListener('close', () => el.viewer.querySelector('[data-bind="img"]').removeAttribute('src'));

  // ---------- 對話 ----------
  function renderDialogues(root, c) {
    const list = root.querySelector('[data-bind="dialogueList"]');
    root.querySelector('[data-bind="dialogueCount"]').textContent = c.dialogues.length;

    if (!c.dialogues.length) {
      const li = document.createElement('li');
      li.className = 'dialogue-empty';
      li.textContent = '還沒有對話，在下方輸入第一句吧。';
      list.replaceChildren(li);
      return;
    }

    list.replaceChildren(
      ...c.dialogues.map((d, i) => {
        const li = document.createElement('li');
        li.className = 'dialogue';

        const num = document.createElement('span');
        num.className = 'dialogue-num';
        num.textContent = i + 1;

        const ta = document.createElement('textarea');
        ta.rows = 1;
        ta.value = d.text;
        ta.setAttribute('aria-label', `對話 ${i + 1}`);
        const autosize = () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        };
        ta.addEventListener('input', () => {
          d.text = ta.value;
          autosize();
          scheduleSave(c);
        });
        requestAnimationFrame(autosize);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn';
        del.title = '刪除這句對話';
        del.setAttribute('aria-label', `刪除對話 ${i + 1}`);
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        del.addEventListener('click', () => {
          c.dialogues = c.dialogues.filter((x) => x.id !== d.id);
          renderDialogues(root, c);
          renderList();
          scheduleSave(c, true);
        });

        li.append(num, ta, del);
        return li;
      })
    );
  }

  // ---------- 角色 CRUD ----------
  function newCharacter() {
    const now = Date.now();
    const c = { id: uid(), name: '', englishName: '', description: '', icon: [], head: [], picture: [], dialogues: [], createdAt: now, updatedAt: now };
    state.characters.push(c);
    state.selectedId = c.id;
    state.query = '';
    el.search.value = '';
    renderList();
    renderEditor();
    scheduleSave(c, true);
    const nameInput = el.editor.querySelector('[data-field="name"]');
    nameInput && nameInput.focus();
  }

  async function deleteCharacter(c) {
    if (!confirm(`確定要刪除「${displayName(c)}」這個角色資料夾嗎？\n刪除後無法復原。`)) return;
    clearTimeout(pendingSaves.get(c.id));
    pendingSaves.delete(c.id);
    const ids = allImageIds(c);
    try {
      await CharDB.remove(c.id, ids);
    } catch (err) {
      toast('刪除失敗：' + errMsg(err), true);
      return;
    }
    ids.forEach(releaseUrl);
    const idx = state.characters.indexOf(c);
    state.characters.splice(idx, 1);
    const next = state.characters[idx] || state.characters[idx - 1];
    state.selectedId = next ? next.id : null;
    renderList();
    renderEditor();
    toast(`已刪除「${displayName(c)}」`);
  }

  function select(id) {
    if (id === state.selectedId) return;
    state.selectedId = id;
    pruneUrls();
    renderList();
    renderEditor();
    el.editor.scrollTop = 0;
  }

  // ---------- 匯出 ----------
  const form = el.dialog.querySelector('form');
  const exportTargets = () => {
    const scope = form.querySelector('input[name="scope"]:checked').value;
    const c = current();
    return scope === 'current' && c ? [c] : state.characters;
  };
  const updateImageCount = () => {
    const n = CharExport.countImages(exportTargets());
    form.querySelector('[data-bind="imageCount"]').textContent = `（${n} 張）`;
  };
  const exportError = (msg) => {
    const node = form.querySelector('[data-bind="error"]');
    node.textContent = msg || '';
    node.hidden = !msg;
  };

  function openExport() {
    if (!state.characters.length) {
      toast('目前沒有角色可以匯出', true);
      return;
    }
    const c = current();
    form.querySelector('[data-bind="countAll"]').textContent = `（${state.characters.length} 個）`;
    form.querySelector('[data-bind="currentName"]').textContent = c ? `（${displayName(c)}）` : '（未選擇）';
    form.querySelector('input[name="scope"][value="current"]').disabled = !c;
    if (!c) form.querySelector('input[name="scope"][value="all"]').checked = true;
    exportError('');
    updateImageCount();
    el.dialog.returnValue = '';
    el.dialog.showModal();
  }

  async function doExport() {
    const text = form.querySelector('input[name="text"]:checked').value;
    const images = form.querySelector('input[name="images"]').checked;
    const list = exportTargets();

    if (text === 'none' && !images) {
      exportError('請至少選擇一種要匯出的內容（文字資料或圖片）。');
      return;
    }
    if (text === 'none' && images && !CharExport.countImages(list)) {
      exportError('選擇的角色沒有任何圖片可以匯出。');
      return;
    }
    exportError('');
    el.dialog.close('export');
    flushSaves();

    const scope = form.querySelector('input[name="scope"]:checked').value;
    const c = current();
    const safe = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    const baseName = scope === 'current' && c ? `character_${safe(c.englishName || c.name || c.id)}` : undefined;
    if (images) toast('正在打包圖片…');
    try {
      const { files, missing } = await CharExport.exportCharacters(list, {
        text: text === 'none' ? null : text,
        images,
        baseName,
      });
      let msg = files.length ? `已匯出 ${files.join('、')}` : '沒有可匯出的檔案';
      if (images && !files.some((f) => f.endsWith('.zip'))) msg += '（沒有圖片，未產生 ZIP）';
      if (missing) msg += `；有 ${missing} 張圖片無法讀取，已略過`;
      toast(msg, !!missing);
    } catch (err) {
      console.error(err);
      toast('匯出失敗：' + errMsg(err), true);
    }
  }

  // ---------- 啟動：讀取資料，並把舊版格式轉成新版 ----------

  /**
   * v1：圖片欄位是單一物件 { blob, fileName, mimeType }
   * v1.1：圖片欄位是陣列 [{ id, blob, fileName, mimeType }]
   * v2（現在）：圖片欄位只有中繼資料，圖片本體在 images store
   */
  async function migrate(c) {
    let changed = false;
    TEXT_FIELDS.forEach((f) => (c[f] = c[f] || ''));
    c.dialogues = c.dialogues || [];
    const addImages = [];
    for (const f of IMAGE_FIELDS) {
      let list = c[f];
      if (!list) list = [];
      else if (!Array.isArray(list)) {
        list = [list];
        changed = true;
      }
      const out = [];
      for (const img of list) {
        if (!img) continue;
        const meta = {
          id: img.id || uid(),
          fileName: img.fileName || 'image',
          mimeType: img.mimeType || (img.blob && img.blob.type) || '',
          size: img.size || 0,
        };
        if (img.broken) meta.broken = true;
        if ('blob' in img) {
          changed = true;
          try {
            const data = await img.blob.arrayBuffer();
            if (!data.byteLength) throw new Error('empty');
            meta.size = data.byteLength;
            addImages.push({ id: meta.id, data, mimeType: meta.mimeType });
          } catch (err) {
            console.warn('無法讀取舊圖片', meta.fileName, err);
            meta.broken = true;
          }
        }
        out.push(meta);
      }
      c[f] = out;
    }
    if (changed) await CharDB.put(c, { addImages });
    return c;
  }

  (async function init() {
    try {
      const raw = await CharDB.getAll();
      for (const c of raw) {
        try {
          state.characters.push(await migrate(c));
        } catch (err) {
          console.error('轉換資料失敗', c, err);
          state.characters.push(c);
        }
      }
      const broken = state.characters.reduce(
        (n, c) => n + IMAGE_FIELDS.reduce((m, f) => m + c[f].filter((i) => i.broken).length, 0),
        0
      );
      if (broken) toast(`有 ${broken} 張先前的圖片已無法讀取，請移除後重新上傳`, true);
    } catch (err) {
      console.error(err);
      toast('無法讀取資料：' + errMsg(err), true);
    }
    state.selectedId = state.characters.length ? state.characters[0].id : null;
    renderList();
    renderEditor();
  })();

  // ---------- 事件 ----------
  el.btnNew.addEventListener('click', newCharacter);
  el.btnExport.addEventListener('click', openExport);
  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('.folder');
    if (btn) select(btn.dataset.id);
  });
  el.search.addEventListener('input', () => {
    state.query = el.search.value;
    renderList();
  });
  form.querySelector('[data-action="confirm-export"]').addEventListener('click', doExport);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'scope') updateImageCount();
    exportError('');
  });
  window.addEventListener('beforeunload', flushSaves);
  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });
  // 拖曳圖片到圖片區以外的地方時，不要讓瀏覽器直接開啟該圖片
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
})();
