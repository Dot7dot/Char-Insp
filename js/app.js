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

  // Blob → object URL 快取，避免重複產生
  const urlCache = new WeakMap();
  function blobUrl(blob) {
    if (!blob) return '';
    let url = urlCache.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      urlCache.set(blob, url);
    }
    return url;
  }
  function releaseBlobUrl(blob) {
    const url = blob && urlCache.get(blob);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(blob);
    }
  }

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
    toast: $('#toast'),
  };

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const current = () => state.characters.find((c) => c.id === state.selectedId) || null;
  const displayName = (c) => c.name.trim() || c.englishName.trim() || '未命名角色';

  /** 舊版資料（每欄一張圖）→ 新版（每欄多張圖的陣列） */
  function normalize(c) {
    TEXT_FIELDS.forEach((f) => (c[f] = c[f] || ''));
    c.dialogues = c.dialogues || [];
    for (const f of IMAGE_FIELDS) {
      const v = c[f];
      if (!v) c[f] = [];
      else if (!Array.isArray(v)) c[f] = [{ id: uid(), ...v }];
    }
    return c;
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('is-error', !!isError);
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
  }

  // ---------- 儲存（防抖） ----------
  const pendingSaves = new Map();
  function scheduleSave(character, immediate) {
    character.updatedAt = Date.now();
    setSaveState('儲存中…');
    clearTimeout(pendingSaves.get(character.id));
    const doSave = () => {
      pendingSaves.delete(character.id);
      CharDB.put(character)
        .then(() => {
          if (!pendingSaves.size) setSaveState('已自動儲存');
        })
        .catch((err) => {
          console.error(err);
          setSaveState('儲存失敗');
          toast('儲存失敗：' + (err && err.message ? err.message : err), true);
        });
    };
    if (immediate) doSave();
    else pendingSaves.set(character.id, setTimeout(doSave, SAVE_DELAY));
  }
  function flushSaves() {
    for (const [id, timer] of pendingSaves) {
      clearTimeout(timer);
      const c = state.characters.find((x) => x.id === id);
      if (c) CharDB.put(c);
    }
    pendingSaves.clear();
  }
  function setSaveState(text) {
    const node = el.editor.querySelector('[data-bind="saveState"]');
    if (node) node.textContent = text;
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

        const thumb = c.icon[0] || c.head[0];
        if (thumb) {
          const img = document.createElement('img');
          img.className = 'folder-thumb';
          img.alt = '';
          img.src = blobUrl(thumb.blob);
          btn.appendChild(img);
        } else {
          btn.insertAdjacentHTML(
            'beforeend',
            '<svg class="folder-thumb folder-thumb-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
          );
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
      tile.className = 'tile';

      const link = document.createElement('a');
      link.className = 'tile-link';
      link.href = blobUrl(img.blob);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = `開啟原圖：${img.fileName}`;
      const pic = document.createElement('img');
      pic.src = link.href;
      pic.alt = img.fileName;
      pic.loading = 'lazy';
      link.appendChild(pic);

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
      remove.addEventListener('click', () => {
        c[field] = c[field].filter((x) => x.id !== img.id);
        releaseBlobUrl(img.blob);
        renderGallery(block, c, field);
        renderList();
        scheduleSave(c, true);
      });
      tools.appendChild(remove);

      const name = document.createElement('span');
      name.className = 'tile-filename';
      name.textContent = `${i + 1}. ${img.fileName}`;
      name.title = img.fileName;

      tile.append(link, tools, name);
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
    el.fileInput.value = '';
    el.fileInput.onchange = () => {
      if (el.fileInput.files && el.fileInput.files.length) onPick(el.fileInput.files);
    };
    el.fileInput.click();
  }

  // 某些系統不會提供檔案的 MIME type，這時依副檔名判斷
  const EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  };
  function imageType(file) {
    if (file.type) return file.type.startsWith('image/') ? file.type : '';
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1];
    return (ext && EXT_MIME[ext.toLowerCase()]) || '';
  }

  function addImages(c, field, fileList, rerender) {
    const files = Array.from(fileList || []);
    const images = files.filter((f) => imageType(f));
    if (files.length && !images.length) {
      toast('只能上傳圖片檔案', true);
      return;
    }
    if (images.length < files.length) toast(`已略過 ${files.length - images.length} 個非圖片檔案`, true);
    for (const file of images) {
      // 存成獨立 Blob（不保留 File 物件的其他屬性）
      const type = imageType(file);
      c[field].push({
        id: uid(),
        blob: file.slice(0, file.size, type),
        fileName: file.name,
        mimeType: type,
      });
    }
    if (!images.length) return;
    rerender();
    renderList();
    scheduleSave(c, true);
  }

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
    const c = normalize({ id: uid(), createdAt: now, updatedAt: now });
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
    try {
      await CharDB.remove(c.id);
    } catch (err) {
      toast('刪除失敗：' + err.message, true);
      return;
    }
    IMAGE_FIELDS.forEach((f) => c[f].forEach((img) => releaseBlobUrl(img.blob)));
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

    const scope = form.querySelector('input[name="scope"]:checked').value;
    const c = current();
    const safe = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    const baseName = scope === 'current' && c ? `character_${safe(c.englishName || c.name || c.id)}` : undefined;
    try {
      const files = await CharExport.exportCharacters(list, {
        text: text === 'none' ? null : text,
        images,
        baseName,
      });
      let msg = `已匯出 ${files.join('、')}`;
      if (images && !files.some((f) => f.endsWith('.zip'))) msg += '（沒有圖片，未產生 ZIP）';
      toast(msg);
    } catch (err) {
      console.error(err);
      toast('匯出失敗：' + err.message, true);
    }
  }

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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });
  // 拖曳圖片到圖片區以外的地方時，不要讓瀏覽器直接開啟該圖片
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // ---------- 啟動 ----------
  (async function init() {
    try {
      state.characters = (await CharDB.getAll()).map(normalize);
    } catch (err) {
      console.error(err);
      toast('無法讀取資料：' + err.message, true);
    }
    state.selectedId = state.characters.length ? state.characters[0].id : null;
    renderList();
    renderEditor();
  })();
})();
