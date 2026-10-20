(() => {
  'use strict';

  /* =====================================================
   *  Constants & storage
   * ===================================================== */
  const STORE_KEY = 'mdslides.presentations.v1';

  const SAMPLE = `# Welcome to MD Slides
## Write Markdown, get slides
Separate slides with three dashes.

---

# Features
- **Create** slides in Markdown
- **Edit** with a live preview
- **Save** in your browser's memory
- **Present** in full screen

---

# Code & quotes
\`\`\`js
console.log("Hello, slides!");
\`\`\`

> Keep it simple.

---

# Thank you!
## Questions?`;

  function loadList() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.list));
      return true;
    } catch (_) {
      alert('Could not save: browser storage is full or unavailable.');
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* =====================================================
   *  Markdown -> slides
   * ===================================================== */
  const isFence = (l) => /^\s*```/.test(l);
  const isSeparator = (l) => /^\s*---\s*$/.test(l);

  // Split one markdown file into slides on lines containing only '---' (ignores code fences).
  function splitSlides(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const chunks = [[]];
    let inFence = false;
    for (const line of lines) {
      if (isFence(line)) inFence = !inFence;
      if (!inFence && isSeparator(line)) chunks.push([]);
      else chunks[chunks.length - 1].push(line);
    }
    const slides = chunks.map((c) => c.join('\n').trim());
    while (slides.length > 1 && slides[slides.length - 1] === '') slides.pop();
    return slides;
  }

  // Which slide is the cursor in? (count separators before the cursor)
  function slideIndexAt(md, pos) {
    const before = md.slice(0, pos).replace(/\r\n?/g, '\n').split('\n');
    let n = 0, inFence = false;
    // the last element is a partial line; a separator only counts once the line is complete
    for (let i = 0; i < before.length; i++) {
      const line = before[i];
      if (isFence(line)) inFence = !inFence;
      else if (!inFence && isSeparator(line) && (i < before.length - 1 || true)) n++;
    }
    return n;
  }

  /* ---------- tiny markdown renderer ---------- */
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const safeUrl = (u) => !/^\s*(javascript|vbscript|data:(?!image\/))/i.test(u);

  function inline(raw) {
    const codes = [];
    let s = raw.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
      safeUrl(url) ? `<img src="${url}" alt="${alt}">` : m);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) =>
      safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : m);
    s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
    s = s.replace(/\*(.+?)\*|(?<![\w])_(.+?)_(?![\w])/g, (_, a, b) => `<em>${a || b}</em>`);
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
    return s;
  }

  function renderList(items) {
    let pos = 0;
    function build() {
      const base = items[pos].indent;
      const tag = items[pos].ordered ? 'ol' : 'ul';
      let html = `<${tag}>`;
      while (pos < items.length) {
        const it = items[pos];
        if (it.indent < base) break;
        if (it.indent > base) {
          const sub = build();
          html = html.slice(0, -5) + sub + '</li>'; // nest inside previous <li>
          continue;
        }
        html += `<li>${inline(it.text)}</li>`;
        pos++;
      }
      return html + `</${tag}>`;
    }
    return build();
  }

  const splitRow = (l) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  function renderMarkdown(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const isBlockStart = (l) => /^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+\.)\s)/.test(l);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (!line.trim()) { i++; continue; }

      if (isFence(line)) {
        const lang = line.trim().slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }

      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        const n = m[1].length;
        out.push(`<h${n}>${inline(m[2].trim())}</h${n}>`);
        i++;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const items = [];
        while (i < lines.length && (m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/))) {
          items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] });
          i++;
        }
        out.push(renderList(items));
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') &&
          /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
        out.push(
          '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>'
        );
        continue;
      }

      // paragraph
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map((l) => inline(l.trim())).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  /* =====================================================
   *  Viewer (slide + Left / Right / Full Screen + counter)
   * ===================================================== */
  const ICONS = {
    left: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    enterFs: '<svg viewBox="0 0 24 24"><polyline points="4 9 4 4 9 4"/><polyline points="20 9 20 4 15 4"/><polyline points="4 15 4 20 9 20"/><polyline points="20 15 20 20 15 20"/></svg>',
    exitFs: '<svg viewBox="0 0 24 24"><polyline points="9 4 9 9 4 9"/><polyline points="15 4 15 9 20 9"/><polyline points="9 20 9 15 4 15"/><polyline points="15 20 15 15 20 15"/></svg>',
  };

  const SLIDE_W = 1280, SLIDE_H = 720;

  class Viewer {
    constructor(root) {
      this.root = root;
      this.slides = [''];
      this.index = 0;
      root.innerHTML = `
        <div class="stage-wrap"><div class="slide"></div></div>
        <div class="controls">
          <div></div>
          <div class="center">
            <button class="icon-btn" data-act="prev" aria-label="Previous slide" title="Previous (\u2190)">${ICONS.left}</button>
            <span class="count" aria-live="polite"></span>
            <button class="icon-btn" data-act="next" aria-label="Next slide" title="Next (\u2192)">${ICONS.right}</button>
          </div>
          <div class="right">
            <button class="icon-btn" data-act="fs"></button>
          </div>
        </div>`;
      this.wrap = root.querySelector('.stage-wrap');
      this.slideEl = root.querySelector('.slide');
      this.countEl = root.querySelector('.count');
      this.prevBtn = root.querySelector('[data-act="prev"]');
      this.nextBtn = root.querySelector('[data-act="next"]');
      this.fsBtn = root.querySelector('[data-act="fs"]');
      this.prevBtn.addEventListener('click', () => this.go(-1));
      this.nextBtn.addEventListener('click', () => this.go(1));
      this.fsBtn.addEventListener('click', () => toggleFullscreenMode());
      new ResizeObserver(() => this.fit()).observe(this.wrap);
      this.setFullscreenIcon(false);
      this.render();
    }

    setSlides(slides, index = this.index) {
      this.slides = slides;
      this.index = Math.max(0, Math.min(index, slides.length - 1));
      this.render();
    }

    goTo(i) {
      const n = Math.max(0, Math.min(i, this.slides.length - 1));
      if (n !== this.index) { this.index = n; this.render(); }
    }

    go(delta) {
      const n = this.index + delta;
      if (n < 0 || n >= this.slides.length) return;
      this.index = n;
      this.render();
    }

    render() {
      const last = this.slides.length - 1;
      this.slideEl.innerHTML = renderMarkdown(this.slides[this.index] || '');
      this.countEl.textContent = `${this.index + 1} / ${this.slides.length}`;
      this.prevBtn.disabled = this.index === 0;
      this.nextBtn.disabled = this.index === last;
      this.fit();
    }

    setFullscreenIcon(inPresentation) {
      this.fsBtn.innerHTML = inPresentation
        ? `${ICONS.exitFs}<span>Exit full screen</span>`
        : `${ICONS.enterFs}<span>Full screen</span>`;
      this.fsBtn.title = inPresentation ? 'Exit full screen (F11)' : 'Full screen (F11)';
      this.fsBtn.setAttribute('aria-label', inPresentation ? 'Exit full screen' : 'Full screen');
    }

    fit() {
      const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
      if (!w || !h) return;
      const pad = 16;
      const scale = Math.min((w - pad) / SLIDE_W, (h - pad) / SLIDE_H);
      this.slideEl.style.transform = `translate(-50%, -50%) scale(${Math.max(scale, 0.05)})`;
    }
  }

  /* =====================================================
   *  App state & screens
   * ===================================================== */
  const $ = (id) => document.getElementById(id);
  const screens = { library: $('library'), editor: $('editor'), present: $('present') };
  const mdInput = $('mdInput');
  const titleInput = $('titleInput');
  const statusEl = $('status');

  const state = {
    list: loadList(),
    current: null,   // presentation being edited {id, name, md, updated}
    dirty: false,
    mode: 'library', // 'library' | 'editor' | 'present'
    prevMode: 'library',
  };

  const editorViewer = new Viewer($('editorViewer'));
  const presentViewer = new Viewer($('presentViewer'));
  presentViewer.setFullscreenIcon(true);

  function show(mode) {
    state.mode = mode;
    for (const [name, el] of Object.entries(screens)) el.hidden = name !== mode;
    editorViewer.fit();
    presentViewer.fit();
  }

  const activeViewer = () =>
    state.mode === 'present' ? presentViewer : state.mode === 'editor' ? editorViewer : null;

  /* ---------- Library ---------- */
  function renderLibrary() {
    const box = $('libraryList');
    if (!state.list.length) {
      box.innerHTML = '<div class="empty">No presentations yet. Create your first one!</div>';
      return;
    }
    const sorted = [...state.list].sort((a, b) => b.updated - a.updated);
    box.innerHTML = sorted.map((p) => {
      const n = splitSlides(p.md).length;
      const d = new Date(p.updated).toLocaleString();
      return `<article class="card" data-id="${p.id}">
        <h3>${esc(p.name)}</h3>
        <div class="meta">${n} slide${n === 1 ? '' : 's'} &middot; ${esc(d)}</div>
        <div class="actions">
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn" data-act="present">&#9654; Present</button>
          <button class="btn danger" data-act="delete">Delete</button>
        </div>
      </article>`;
    }).join('');
  }

  $('libraryList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const p = state.list.find((x) => x.id === btn.closest('.card').dataset.id);
    if (!p) return;
    const act = btn.dataset.act;
    if (act === 'edit') openEditor({ ...p });
    else if (act === 'present') enterPresent(splitSlides(p.md), 0);
    else if (act === 'delete' && confirm(`Delete "${p.name}"? This cannot be undone.`)) {
      state.list = state.list.filter((x) => x.id !== p.id);
      persist();
      renderLibrary();
    }
  });

  function openLibrary() {
    renderLibrary();
    show('library');
  }

  /* ---------- Editor ---------- */
  function openEditor(pres) {
    state.current = pres;
    state.dirty = false;
    titleInput.value = pres.name;
    mdInput.value = pres.md;
    editorViewer.setSlides(splitSlides(pres.md), 0);
    show('editor');
    updateStatus();
    mdInput.focus();
  }

  function newPresentation() {
    openEditor({ id: uid(), name: 'Untitled presentation', md: SAMPLE, updated: 0 });
    state.dirty = true; // not saved yet
    updateStatus();
  }

  function updateStatus() {
    if (state.dirty) {
      statusEl.textContent = '\u25CF Unsaved changes';
      statusEl.classList.add('dirty');
    } else {
      const t = new Date(state.current.updated || Date.now());
      statusEl.textContent = 'Saved ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusEl.classList.remove('dirty');
    }
  }

  function save() {
    const c = state.current;
    if (!c) return;
    c.name = (titleInput.value || '').trim() || 'Untitled presentation';
    c.md = mdInput.value;
    c.updated = Date.now();
    const rec = { ...c };
    const i = state.list.findIndex((p) => p.id === c.id);
    if (i >= 0) state.list[i] = rec; else state.list.unshift(rec);
    if (!persist()) return;
    titleInput.value = c.name;
    state.dirty = false;
    updateStatus();
  }

  function markDirty() {
    state.dirty = true;
    updateStatus();
  }

  mdInput.addEventListener('input', () => {
    editorViewer.setSlides(splitSlides(mdInput.value), slideIndexAt(mdInput.value, mdInput.selectionStart));
    markDirty();
  });

  // keep the preview on the slide where the cursor is
  const followCursor = () =>
    editorViewer.goTo(slideIndexAt(mdInput.value, mdInput.selectionStart));
  mdInput.addEventListener('click', followCursor);
  mdInput.addEventListener('keyup', (e) => {
    if (!e.altKey && !e.ctrlKey && !e.metaKey) followCursor();
  });

  // Tab inserts two spaces instead of leaving the editor
  mdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = mdInput;
      mdInput.setRangeText('  ', s, en, 'end');
      mdInput.dispatchEvent(new Event('input'));
    }
  });

  titleInput.addEventListener('input', markDirty);
  $('saveBtn').addEventListener('click', save);
  $('presentBtn').addEventListener('click', () => enterPresent(editorViewer.slides, editorViewer.index));
  $('newBtn').addEventListener('click', newPresentation);
  $('backBtn').addEventListener('click', () => {
    if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    state.current = null;
    state.dirty = false;
    openLibrary();
  });

  /* ---------- Presentation mode ---------- */
  function enterPresent(slides, index) {
    if (state.mode === 'present') return;
    state.prevMode = state.mode;
    presentViewer.setSlides(slides, index);
    show('present');
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function exitPresent() {
    if (state.mode !== 'present') return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (state.prevMode === 'editor') editorViewer.goTo(presentViewer.index);
    show(state.prevMode);
  }

  // Full Screen button / F11: enter presentation mode from the editor, leave it from the presentation
  function toggleFullscreenMode() {
    if (state.mode === 'present') exitPresent();
    else if (state.mode === 'editor') enterPresent(editorViewer.slides, editorViewer.index);
  }

  // user left browser fullscreen (e.g. Esc) -> leave presentation mode too
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.mode === 'present') exitPresent();
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    const key = e.key;

    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.current) save();
      return;
    }
    if (key === 'F11') {
      e.preventDefault();
      toggleFullscreenMode();
      return;
    }
    if (key === 'Escape' && state.mode === 'present') {
      exitPresent();
      return;
    }

    const v = activeViewer();
    if (!v || (key !== 'ArrowRight' && key !== 'ArrowLeft')) return;

    // while typing in the editor, arrows must keep moving the text cursor -> use Alt+Arrow there
    const typing = /^(TEXTAREA|INPUT)$/.test(e.target.tagName);
    if (typing && state.mode !== 'present' && !e.altKey) return;

    e.preventDefault();
    v.go(key === 'ArrowRight' ? 1 : -1);
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Boot ---------- */
  openLibrary();
})();
