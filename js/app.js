/**
 * 角色靈感庫 - 主程式
 */
(function () {
  'use strict';

  const IMAGE_FIELDS = ['icon', 'picture', 'head'];
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

        const thumb = c.icon || c.head;
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
      renderImageSlot(root.querySelector(`[data-image="${field}"]`), c, field);
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

  function renderImageSlot(slot, c, field) {
    const zone = slot.querySelector('.dropzone');
    const img = c[field];
    zone.replaceChildren();
    zone.classList.toggle('has-image', !!img);

    if (img) {
      const pic = document.createElement('img');
      pic.src = blobUrl(img.blob);
      pic.alt = field;
      const tools = document.createElement('div');
      tools.className = 'dropzone-tools';
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.className = 'chip';
      replace.textContent = '更換';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip chip-danger';
      remove.textContent = '移除';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        releaseBlobUrl(img.blob);
        c[field] = null;
        renderImageSlot(slot, c, field);
        renderList();
        scheduleSave(c, true);
      });
      tools.append(replace, remove);
      const name = document.createElement('span');
      name.className = 'dropzone-filename';
      name.textContent = img.fileName;
      name.title = img.fileName;
      zone.append(pic, tools, name);
    } else {
      zone.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14M14 8h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg><span>上傳圖片</span>';
    }

    const pick = () => pickFile((file) => setImage(c, field, file, slot));
    zone.onclick = pick;
    zone.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    };
    zone.ondragover = (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    };
    zone.ondragleave = () => zone.classList.remove('is-dragover');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setImage(c, field, file, slot);
    };
  }

  function pickFile(onPick) {
    el.fileInput.value = '';
    el.fileInput.onchange = () => {
      const file = el.fileInput.files && el.fileInput.files[0];
      if (file) onPick(file);
    };
    el.fileInput.click();
  }

  function setImage(c, field, file, slot) {
    if (!file.type.startsWith('image/')) {
      toast('只能上傳圖片檔案', true);
      return;
    }
    if (c[field]) releaseBlobUrl(c[field].blob);
    // 存成獨立 Blob（不保留 File 物件的其他屬性）
    const blob = file.slice(0, file.size, file.type);
    c[field] = { blob, fileName: file.name, mimeType: file.type };
    renderImageSlot(slot, c, field);
    renderList();
    scheduleSave(c, true);
  }

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
    const c = {
      id: uid(),
      name: '',
      englishName: '',
      description: '',
      icon: null,
      picture: null,
      head: null,
      dialogues: [],
      createdAt: now,
      updatedAt: now,
    };
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
    IMAGE_FIELDS.forEach((f) => c[f] && releaseBlobUrl(c[f].blob));
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
  function openExport() {
    if (!state.characters.length) {
      toast('目前沒有角色可以匯出', true);
      return;
    }
    const form = el.dialog.querySelector('form');
    const c = current();
    form.querySelector('[data-bind="countAll"]').textContent = `（${state.characters.length} 個）`;
    form.querySelector('[data-bind="currentName"]').textContent = c ? `（${displayName(c)}）` : '（未選擇）';
    const currentRadio = form.querySelector('input[name="scope"][value="current"]');
    currentRadio.disabled = !c;
    if (!c) form.querySelector('input[name="scope"][value="all"]').checked = true;
    el.dialog.returnValue = '';
    el.dialog.showModal();
  }

  async function doExport() {
    const form = el.dialog.querySelector('form');
    const format = form.querySelector('input[name="format"]:checked').value;
    const scope = form.querySelector('input[name="scope"]:checked').value;
    const embedImages = form.querySelector('input[name="embedImages"]').checked;
    const c = current();
    const list = scope === 'current' && c ? [c] : state.characters;
    const safe = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    const baseName = scope === 'current' && c ? `character_${safe(c.englishName || c.name || c.id)}` : undefined;
    try {
      const fileName = await CharExport.exportCharacters(list, { format, embedImages, baseName });
      toast(`已匯出 ${fileName}`);
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
  el.dialog.addEventListener('close', () => {
    if (el.dialog.returnValue === 'export') doExport();
  });
  // CSV 預設不內嵌圖片（試算表單格有字數上限）；JSON 預設內嵌
  el.dialog.querySelectorAll('input[name="format"]').forEach((r) =>
    r.addEventListener('change', () => {
      el.dialog.querySelector('input[name="embedImages"]').checked = r.value === 'json';
    })
  );
  window.addEventListener('beforeunload', flushSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });

  // ---------- 啟動 ----------
  (async function init() {
    try {
      state.characters = await CharDB.getAll();
      for (const c of state.characters) {
        c.dialogues = c.dialogues || [];
        TEXT_FIELDS.forEach((f) => (c[f] = c[f] || ''));
      }
    } catch (err) {
      console.error(err);
      toast('無法讀取資料：' + err.message, true);
    }
    state.selectedId = state.characters.length ? state.characters[0].id : null;
    renderList();
    renderEditor();
  })();
})();
