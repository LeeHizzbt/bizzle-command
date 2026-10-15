/* Bizzle Command v4.20 — Memory Vault: Markdown notes, [[wikilinks]], backlinks, graph view, Obsidian-compatible zip. Original code (MIT).
   Zip handling uses JSZip (MIT, docs/vendor/jszip.min.js). */
(function () {
  'use strict';
  var BC = window.BC, AI = BC.AI, $ = BC.$, $$ = BC.$$, esc = BC.esc;
  var notesCache = [];
  var WL = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]+)?\]\]/g;

  function load() { return BC.DB.all('notes').then(function (n) { notesCache = n.sort(function (a, b) { return (b.updated || '') < (a.updated || '') ? -1 : 1; }); return notesCache; }); }
  function safeTitle(t) { return String(t || 'Untitled').replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'; }
  function byTitle(t) { t = String(t).trim().toLowerCase(); return notesCache.filter(function (n) { return n.title.toLowerCase() === t; })[0]; }
  function links(body) { var out = [], m; WL.lastIndex = 0; while ((m = WL.exec(body || ''))) { var t = m[1].trim(); if (out.indexOf(t) < 0) out.push(t); } return out; }
  function tags(body) { var out = [], re = /(^|\s)#([a-z0-9][\w\-\/]*)/gi, m; while ((m = re.exec(body || ''))) if (out.indexOf(m[2].toLowerCase()) < 0) out.push(m[2].toLowerCase()); return out; }
  function uniqueTitle(t) { var base = safeTitle(t), x = base, i = 2; while (byTitle(x)) x = base + ' (' + (i++) + ')'; return x; }
  function create(title, body, opts) {
    return load().then(function () {
      var now = new Date().toISOString();
      var n = { id: BC.uid(), title: (opts && opts.keepTitle) ? safeTitle(title) : uniqueTitle(title), body: body || '', created: now, updated: now };
      return BC.DB.put('notes', n).then(function () { notesCache.unshift(n); return n; });
    });
  }
  function save(n) { n.updated = new Date().toISOString(); return BC.DB.put('notes', n); }
  BC.Vault = { create: create, load: load, links: links, tags: tags, safeTitle: safeTitle, exportZip: exportZip, importFiles: importFiles };

  /* ---------- Obsidian zip ---------- */
  function frontMatter(n) { return '---\ncreated: ' + n.created + '\nupdated: ' + n.updated + '\nsource: Bizzle Command v4.20\n---\n'; }
  function parseFront(text) {
    var m = /^---\n([\s\S]*?)\n---\n?/.exec(text); if (!m) return { body: text, meta: {} };
    var meta = {}; m[1].split('\n').forEach(function (l) { var p = l.indexOf(':'); if (p > 0) meta[l.slice(0, p).trim()] = l.slice(p + 1).trim(); });
    var ours = Object.keys(meta).every(function (k) { return ['created', 'updated', 'source'].indexOf(k) >= 0; });
    return { body: ours ? text.slice(m[0].length) : text, meta: meta };
  }
  function exportZip() {
    return load().then(function (notes) {
      var zip = new JSZip(), root = zip.folder('Bizzle Vault'), used = {};
      notes.forEach(function (n) { var name = safeTitle(n.title), k = name.toLowerCase(), i = 2; while (used[k]) { name = safeTitle(n.title) + ' ' + (i++); k = name.toLowerCase(); } used[k] = 1; root.file(name + '.md', frontMatter(n) + n.body); });
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) { return { blob: blob, count: notes.length }; });
    });
  }
  function importFiles(files) {
    var docs = [];
    return Promise.all(Array.prototype.map.call(files, function (f) {
      if (/\.zip$/i.test(f.name)) return JSZip.loadAsync(f).then(function (zip) {
        var ps = [];
        zip.forEach(function (path, entry) {
          if (entry.dir || !/\.md$/i.test(path) || /(^|\/)\.(obsidian|trash)\//.test(path) || /(^|\/)__MACOSX\//.test(path)) return;
          ps.push(entry.async('string').then(function (t) { docs.push({ title: path.split('/').pop().replace(/\.md$/i, ''), text: t }); }));
        });
        return Promise.all(ps);
      });
      if (/\.(md|markdown|txt)$/i.test(f.name)) return f.text().then(function (t) { docs.push({ title: f.name.replace(/\.(md|markdown|txt)$/i, ''), text: t }); });
      return null;
    })).then(function () {
      return load().then(function () {
        var added = 0, updated = 0;
        return Promise.all(docs.map(function (d) {
          var pf = parseFront(d.text), ex = byTitle(safeTitle(d.title));
          if (ex) { ex.body = pf.body; updated++; return save(ex); }
          added++; var now = new Date().toISOString();
          var n = { id: BC.uid(), title: safeTitle(d.title), body: pf.body, created: pf.meta.created || now, updated: pf.meta.updated || now };
          notesCache.push(n); return BC.DB.put('notes', n);
        })).then(function () { return { added: added, updated: updated, total: docs.length }; });
      });
    });
  }

  /* ---------- views ---------- */
  function toolbar() {
    return '<div class="row wrap vbar"><button class="btn primary" id="v-new">＋ New note</button><button class="btn" data-go="vault/graph">🕸️ Graph</button><button class="btn" data-go="vault">📚 Notes</button>' +
      '<button class="btn" id="v-exp">⬇️ Export .zip (Obsidian)</button><button class="btn" id="v-imp">⬆️ Import .zip / .md</button><input type="file" id="v-impf" class="hidden" multiple accept=".zip,.md,.markdown,.txt,application/zip,text/markdown"></div>';
  }
  function bindToolbar() {
    $('#v-new').onclick = function () { create('New note', '').then(function (n) { BC.go('vault/note/' + n.id); setTimeout(function () { var t = $('#n-title'); if (t) { t.focus(); t.select(); } }, 150); }); };
    $('#v-exp').onclick = function () { exportZip().then(function (r) { BC.saveBlob(r.blob, 'bizzle-vault-' + BC.AI.today() + '.zip'); BC.toast('Exported ' + r.count + ' notes'); }, function (e) { BC.toast('Export failed: ' + e.message, true); }); };
    $('#v-imp').onclick = function () { $('#v-impf').click(); };
    $('#v-impf').onchange = function () { var fs = this.files; if (!fs.length) return; importFiles(fs).then(function (r) { BC.toast('Imported ' + r.total + ' notes (' + r.added + ' new, ' + r.updated + ' updated)'); BC.render(); }, function (e) { BC.toast('Import failed: ' + e.message, true); }); };
  }
  function listView(main) {
    main.innerHTML = BC.header('🧠 Memory Vault', 'Markdown notes · [[wikilinks]] · graph · Obsidian zip') + '<div class="body">' + toolbar() +
      '<div class="row" style="margin:10px 0"><input id="v-q" placeholder="🔎 Search notes, #tags…"></div><div id="v-tags" class="srcs"></div><div id="v-list" class="vlist"></div></div>';
    bindToolbar();
    load().then(function (notes) {
      var tagCount = {}; notes.forEach(function (n) { tags(n.body).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
      $('#v-tags').innerHTML = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).slice(0, 20).map(function (t) { return '<button class="pill" data-tag="' + esc(t) + '">#' + esc(t) + ' ' + tagCount[t] + '</button>'; }).join('');
      function draw(q) {
        q = (q || '').toLowerCase();
        var list = notes.filter(function (n) { return !q || (n.title + '\n' + n.body).toLowerCase().indexOf(q) >= 0; });
        $('#v-list').innerHTML = list.length ? list.map(function (n) { return '<a class="card vnote" href="#/vault/note/' + n.id + '"><b>' + esc(n.title) + '</b><div class="small muted clamp">' + esc(n.body.slice(0, 160)) + '</div><div class="tiny muted">' + links(n.body).length + ' links · ' + esc(BC.ago(n.updated)) + '</div></a>'; }).join('') : '<div class="empty">' + (notes.length ? 'No matches.' : 'Your vault is empty. Create a note, save a trend, or import an Obsidian vault .zip.') + '</div>';
      }
      draw(); $('#v-q').oninput = function () { draw(this.value); };
      $$('[data-tag]').forEach(function (b) { b.onclick = function () { $('#v-q').value = '#' + b.getAttribute('data-tag'); draw($('#v-q').value); }; });
    });
  }
  function noteView(main, id) {
    load().then(function () {
      var n = notesCache.filter(function (x) { return x.id === id; })[0];
      if (!n) { main.innerHTML = BC.header('🧠 Note', '') + '<div class="body"><div class="empty">Note not found. <a href="#/vault">Back to notes</a></div></div>'; return; }
      var back = notesCache.filter(function (x) { return x.id !== n.id && links(x.body).some(function (l) { return l.toLowerCase() === n.title.toLowerCase(); }); });
      main.innerHTML = BC.header('🧠 ' + esc(n.title), 'Memory Vault note · edited ' + esc(BC.ago(n.updated))) + '<div class="body"><div class="nwrap">' +
        '<div class="row wrap"><input id="n-title" value="' + esc(n.title) + '" class="grow"><div class="tabs" id="n-mode"><button data-m="edit" class="on">✏️ Edit</button><button data-m="prev">👁️ Preview</button></div></div>' +
        '<textarea id="n-body" rows="16" class="mono" placeholder="Write Markdown. Link notes with [[Note title]], tag with #tag.">' + esc(n.body) + '</textarea><div id="n-prev" class="card mt hidden"></div>' +
        '<div class="row wrap" style="margin-top:8px"><button class="btn primary" id="n-save">💾 Save</button><span class="tiny muted" id="n-st"></span><span class="grow"></span><button class="btn" id="n-md">⬇️ .md</button><button class="btn danger" id="n-del">🗑️ Delete</button></div>' +
        '<div class="card" style="margin-top:12px"><b>🔗 Links</b><div class="srcs">' + (links(n.body).map(function (l) { var t = byTitle(l); return '<a class="pill' + (t ? ' green' : '') + '" href="#" data-wl="' + esc(l) + '">' + esc(l) + (t ? '' : ' (new)') + '</a>'; }).join('') || '<span class="muted small">No outgoing links yet.</span>') + '</div>' +
        '<b style="display:block;margin-top:8px">↩️ Backlinks</b><div class="srcs">' + (back.map(function (x) { return '<a class="pill" href="#/vault/note/' + x.id + '">' + esc(x.title) + '</a>'; }).join('') || '<span class="muted small">No notes link here yet.</span>') + '</div></div>' +
        '<div class="card" style="margin-top:12px"><b>🤖 Ask AI about this note</b><div class="row wrap" style="margin-top:6px"><input id="n-ask" placeholder="e.g. Summarize, suggest links, turn into a post…" class="grow">' + BC.shotPicker('note') + '<button class="btn primary" id="n-askgo">Ask</button></div><div id="n-ans" style="margin-top:8px"></div></div></div></div>';
      var dirty = false;
      function doSave() { n.title = safeTitle($('#n-title').value); n.body = $('#n-body').value; return save(n).then(function () { dirty = false; $('#n-st').textContent = 'Saved ' + new Date().toLocaleTimeString(); }); }
      $('#n-body').oninput = $('#n-title').oninput = function () { dirty = true; $('#n-st').textContent = 'Unsaved changes'; autosave(); };
      var autosave = BC.debounce(function () { if (dirty) doSave(); }, 1200);
      BC.onLeave = function () { if (dirty) doSave(); };
      $('#n-save').onclick = function () { doSave().then(function () { BC.toast('Saved 💾'); }); };
      $$('#n-mode button').forEach(function (b) { b.onclick = function () { var prev = b.getAttribute('data-m') === 'prev'; $$('#n-mode button').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#n-body').classList.toggle('hidden', prev); $('#n-prev').classList.toggle('hidden', !prev); if (prev) $('#n-prev').innerHTML = BC.md($('#n-body').value, { wiki: true }); }; });
      $('#n-del').onclick = function () { if (!confirm('Delete "' + n.title + '"?')) return; dirty = false; BC.DB.del('notes', n.id).then(function () { BC.toast('Deleted'); BC.go('vault'); }); };
      $('#n-md').onclick = function () { BC.saveBlob(new Blob([frontMatter(n) + $('#n-body').value], { type: 'text/markdown' }), safeTitle(n.title) + '.md'); };
      $('#n-askgo').onclick = function () {
        var q = $('#n-ask').value.trim() || 'Summarize this note in 5 bullets and suggest 3 [[wikilinks]] to related notes.';
        $('#n-ans').innerHTML = '<span class="muted">🤖 Thinking…</span>';
        AI.run({ effort: 'Fast', system: 'You help manage an Obsidian-style Markdown vault. Existing note titles: ' + notesCache.slice(0, 80).map(function (x) { return x.title; }).join(' | '),
          messages: [{ role: 'user', text: q + '\n\nNOTE "' + n.title + '":\n' + $('#n-body').value.slice(0, 12000), images: BC.takeShot('note') }] })
          .then(function (r) { $('#n-ans').innerHTML = BC.reply(r.text, '<button class="btn sm" id="n-app">➕ Append to note</button>'); $('#n-app').onclick = function () { $('#n-body').value += '\n\n' + r.text; dirty = true; doSave(); BC.toast('Appended'); }; }, function (e) { $('#n-ans').innerHTML = BC.errorHtml(e); });
      };
    });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-wl]'); if (!a) return; e.preventDefault();
    var t = a.getAttribute('data-wl');
    load().then(function () { var ex = byTitle(t); if (ex) BC.go('vault/note/' + ex.id); else create(t, '', { keepTitle: true }).then(function (n) { BC.toast('Created "' + n.title + '"'); BC.go('vault/note/' + n.id); }); });
  });

  /* ---------- graph view (canvas force layout) ---------- */
  function graphView(main) {
    main.innerHTML = BC.header('🕸️ Vault Graph', 'Notes are dots, [[links]] are lines. Drag to move, click to open, wheel/pinch buttons to zoom.') + '<div class="body">' + toolbar() +
      '<div class="row" style="margin:8px 0"><span class="small muted" id="g-stats"></span><span class="grow"></span><button class="btn sm" id="g-zin">＋</button><button class="btn sm" id="g-zout">－</button><button class="btn sm" id="g-fit">⤢ Reset</button></div><div class="graphbox"><canvas id="g-canvas" aria-label="Vault graph"></canvas></div></div>';
    bindToolbar();
    load().then(function (notes) {
      var nodes = [], idx = {}, edges = [];
      notes.forEach(function (n, i) { var a = i / Math.max(1, notes.length) * Math.PI * 2; var nd = { id: n.id, title: n.title, x: Math.cos(a) * 120 + Math.random() * 10, y: Math.sin(a) * 120 + Math.random() * 10, vx: 0, vy: 0, deg: 0 }; nodes.push(nd); idx[n.title.toLowerCase()] = nd; });
      notes.forEach(function (n) { links(n.body).forEach(function (l) { var k = l.toLowerCase(), t = idx[k]; if (!t) { t = { id: null, title: l, ghost: true, x: Math.random() * 200 - 100, y: Math.random() * 200 - 100, vx: 0, vy: 0, deg: 0 }; idx[k] = t; nodes.push(t); } var s = idx[n.title.toLowerCase()]; if (s !== t) { edges.push([s, t]); s.deg++; t.deg++; } }); });
      $('#g-stats').textContent = notes.length + ' notes · ' + edges.length + ' links' + (nodes.length > notes.length ? ' · ' + (nodes.length - notes.length) + ' unresolved' : '');
      BC.graphData = { nodes: nodes.length, edges: edges.length };
      var cv = $('#g-canvas'), ctx = cv.getContext('2d'), W, H, dpr = window.devicePixelRatio || 1, zoom = 1, ox = 0, oy = 0, drag = null, pan = null, moved = false, alive = true, ticks = 0;
      function size() { var r = cv.parentNode.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
      size(); window.addEventListener('resize', size);
      var col = BC.themeColors();
      function step() {
        for (var i = 0; i < nodes.length; i++) { var a = nodes[i]; for (var j = i + 1; j < nodes.length; j++) { var b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = 900 / d2; if (d2 > 90000) continue; var d = Math.sqrt(d2); a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; } }
        edges.forEach(function (e) { var a = e[0], b = e[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 70) * 0.02; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; });
        nodes.forEach(function (n) { n.vx -= n.x * 0.004; n.vy -= n.y * 0.004; if (n !== drag) { n.x += n.vx; n.y += n.vy; } n.vx *= 0.82; n.vy *= 0.82; });
      }
      function toScreen(n) { return [W / 2 + (n.x + ox) * zoom, H / 2 + (n.y + oy) * zoom]; }
      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = col.accent2; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
        edges.forEach(function (e) { var a = toScreen(e[0]), b = toScreen(e[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
        ctx.globalAlpha = 1;
        nodes.forEach(function (n) {
          var p = toScreen(n), r = (4 + Math.min(10, n.deg * 1.5)) * Math.sqrt(zoom);
          ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = n.ghost ? 'rgba(140,140,140,.6)' : col.accent; ctx.shadowColor = col.accent; ctx.shadowBlur = n.ghost ? 0 : 10; ctx.fill(); ctx.shadowBlur = 0;
          if (zoom > 0.6 || n.deg > 2) { ctx.fillStyle = col.text; ctx.font = '12px system-ui'; ctx.fillText(n.title.slice(0, 28), p[0] + r + 3, p[1] + 4); }
        });
      }
      function loop() { if (!alive || !document.body.contains(cv)) { alive = false; return; } if (ticks < 600 || drag) { step(); ticks++; } draw(); requestAnimationFrame(loop); }
      loop();
      BC.onLeave = function () { alive = false; window.removeEventListener('resize', size); };
      function at(ev) { var r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, best = null, bd = 400; nodes.forEach(function (n) { var p = toScreen(n), d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if (d < bd) { bd = d; best = n; } }); return { n: best, x: x, y: y }; }
      cv.addEventListener('pointerdown', function (ev) { var h = at(ev); moved = false; cv.setPointerCapture(ev.pointerId); if (h.n) { drag = h.n; } else pan = { x: ev.clientX, y: ev.clientY, ox: ox, oy: oy }; });
      cv.addEventListener('pointermove', function (ev) { var r = cv.getBoundingClientRect(); if (drag) { moved = true; drag.x = (ev.clientX - r.left - W / 2) / zoom - ox; drag.y = (ev.clientY - r.top - H / 2) / zoom - oy; ticks = Math.min(ticks, 500); } else if (pan) { moved = true; ox = pan.ox + (ev.clientX - pan.x) / zoom; oy = pan.oy + (ev.clientY - pan.y) / zoom; } });
      cv.addEventListener('pointerup', function () { if (drag && !moved) { if (drag.id) BC.go('vault/note/' + drag.id); else create(drag.title, '', { keepTitle: true }).then(function (n) { BC.go('vault/note/' + n.id); }); } drag = null; pan = null; });
      cv.addEventListener('wheel', function (ev) { ev.preventDefault(); zoom = Math.max(0.2, Math.min(4, zoom * (ev.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
      $('#g-zin').onclick = function () { zoom = Math.min(4, zoom * 1.25); }; $('#g-zout').onclick = function () { zoom = Math.max(0.2, zoom / 1.25); }; $('#g-fit').onclick = function () { zoom = 1; ox = 0; oy = 0; ticks = 0; };
    });
  }
  BC.rooms.vault = function (main, arg) {
    if (arg && arg.indexOf('note/') === 0) return noteView(main, arg.slice(5));
    if (arg === 'graph') return graphView(main);
    return listView(main);
  };
})();
