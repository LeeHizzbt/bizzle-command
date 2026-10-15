/* Bizzle Command v4.20 — core: helpers, storage, router, layout, modals, settings, Bizzy Bot. Original code (MIT). */
(function () {
  'use strict';
  var AI = window.BCAI;
  var BC = window.BC = { rooms: {}, AI: AI };
  BC.VERSION = '4.20';
  BC.BUILD = window.BC_BUILD || 'dev';

  /* ---------- helpers ---------- */
  var $ = BC.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = BC.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = BC.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  BC.uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); };
  BC.lsGet = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  BC.lsSet = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); };
  BC.ago = function (t) { if (!t) return 'never'; var s = (Date.now() - new Date(t)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
  BC.fmtTime = function (t) { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  BC.toast = function (msg, err) { var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, err ? 6000 : 2800); };
  BC.isPhone = function () { return window.matchMedia('(max-width:767px)').matches; };
  BC.copyText = function (text) {
    function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fb); else fb(); } catch (e) { fb(); }
    BC.lastCopied = text; BC.toast('Copied 📋');
  };
  BC.slug = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'post'; };
  BC.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  BC.resizeImage = function (file, max) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(1, max / Math.max(img.width, img.height)); var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Could not read that image.')); };
      img.src = url;
    });
  };
  /* Small, safe Markdown renderer (escapes first). */
  BC.md = function (text, opts) {
    opts = opts || {};
    var blocks = [];
    var s = String(text || '').replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) { blocks.push('<pre><code>' + esc(code) + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
    s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/^###### (.*)$/gm, '<h6>$1</h6>').replace(/^#### (.*)$/gm, '<h5>$1</h5>').replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h2>$1</h2>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    if (opts.wiki) s = s.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, function (_, t, a) { return '<a href="#" class="wl" data-wl="' + t.trim() + '">' + (a || t) + '</a>'; });
    s = s.replace(/^(?:[-*] (.*)(?:\n|$))+/gm, function (blk) { return '<ul>' + blk.trim().split('\n').map(function (l) { return '<li>' + l.replace(/^[-*] /, '') + '</li>'; }).join('') + '</ul>'; });
    s = s.replace(/^(?:\d+\. (.*)(?:\n|$))+/gm, function (blk) { return '<ol>' + blk.trim().split('\n').map(function (l) { return '<li>' + l.replace(/^\d+\. /, '') + '</li>'; }).join('') + '</ol>'; });
    s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return blocks[+i]; });
    return s;
  };
  /* "Bot reply" block: rendered markdown + copy button. EVERY AI reply in the app goes through this. */
  BC.reply = function (text, extra) {
    var id = 'r' + Math.random().toString(36).slice(2);
    BC._replies = BC._replies || {}; BC._replies[id] = text;
    return '<div class="reply"><div class="mt">' + BC.md(text) + '</div><div class="row wrap reply-acts"><button class="copybtn" data-copy-reply="' + id + '">📋 Copy</button>' + (extra || '') + '</div></div>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy-reply]');
    if (b) { BC.copyText(BC._replies[b.getAttribute('data-copy-reply')] || ''); return; }
    var a = e.target.closest && e.target.closest('[data-go]');
    if (a) { e.preventDefault(); BC.go(a.getAttribute('data-go')); closeDrawer(); }
    var s = e.target.closest && e.target.closest('[data-open-ai]');
    if (s) { e.preventDefault(); BC.openAISettings(); }
  });

  /* ---------- IndexedDB (notes, trends, queue, chats, kv) ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('bizzle-command', 1);
      r.onupgradeneeded = function () { var d = r.result; ['notes', 'trends', 'queue', 'chats', 'seo', 'kv'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
  BC.DB = {
    put: function (store, obj) { return tx(store, 'readwrite', function (s) { s.put(obj); return obj; }); },
    get: function (store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); },
    all: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
    del: function (store, id) { return tx(store, 'readwrite', function (s) { s.delete(id); }); },
    clear: function (store) { return tx(store, 'readwrite', function (s) { s.clear(); }); }
  };

  /* ---------- fetching other sites: CORS-friendly readers with fallback ---------- */
  BC.READERS = [
    { name: 'r.jina.ai', url: function (u) { return 'https://r.jina.ai/' + u; } },
    { name: 'allorigins', url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { name: 'allorigins-json', url: function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); }, parse: function (t) { try { return JSON.parse(t).contents || ''; } catch (e) { return ''; } } },
    { name: 'codetabs', url: function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); } }
  ];
  BC.fetchTimeout = function (url, init, ms) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 15000);
    return fetch(url, Object.assign({ signal: c.signal }, init || {})).finally(function () { clearTimeout(t); });
  };
  /* Returns {text, via}. Content is UNTRUSTED data. */
  BC.fetchViaReader = function (target, opts) {
    opts = opts || {};
    if (!navigator.onLine) return Promise.reject(Object.assign(new Error('You are offline.'), { kind: 'offline' }));
    var readers = BC.READERS.slice(), errs = [];
    function next() {
      var r = readers.shift();
      if (!r) return Promise.reject(Object.assign(new Error('All free readers failed (' + errs.join('; ') + '). The services may be down or rate-limited. Try again later.'), { kind: 'down' }));
      return BC.fetchTimeout(r.url(target), {}, opts.timeout || 12000).then(function (res) {
        if (!res.ok) return { err: r.name + ' ' + res.status };
        return res.text().then(function (t) { if (r.parse) t = r.parse(t); if (!t || t.length < 20) return { err: r.name + ' empty' }; return { text: t, via: r.name }; });
      }).catch(function (e) { return { err: r.name + ' ' + (e && e.name === 'AbortError' ? 'timeout' : 'network') }; })
        .then(function (o) { if (o.err) { errs.push(o.err); return next(); } return o; });
    }
    return next();
  };

  /* ---------- saving files (web download, or Android share sheet) ---------- */
  BC.saveBlob = function (blob, name) {
    var C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem) {
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); })
        .then(function (b64) { return C.Plugins.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' }); })
        .then(function (w) { BC.toast('Saved ' + name); if (C.Plugins.Share) return C.Plugins.Share.share({ title: name, files: [w.uri] }).catch(function () {}); })
        .catch(function (e) { BC.toast('Could not save: ' + e.message, true); });
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return Promise.resolve();
  };

  /* ---------- error box: no key / rate limited / offline / service down ---------- */
  BC.errorHtml = function (e) {
    var kind = (e && e.kind) || (navigator.onLine ? 'error' : 'offline');
    var title = { nokey: '🔑 No AI key yet', ratelimit: '⏳ Rate limited', offline: '📴 You are offline', down: '🛠️ Service down', network: '🛠️ Service unreachable', badkey: '🔑 Key rejected' }[kind] || '⚠️ Something went wrong';
    var help = { nokey: 'Add a free key (Gemini, Groq or OpenRouter). It stays on this device only.', ratelimit: 'The free quota for every provider in your chain is used up for now. Wait a minute, add another free key, or check the usage meter.', offline: 'Reconnect to use AI and scans. Notes, queue and saved trends still work offline.', down: 'The service did not answer properly. Try again in a minute.', network: 'Could not reach the service. Check your connection or try again later.', badkey: 'Open Advanced AI Settings and check or replace the key.' }[kind] || '';
    return '<div class="errbox" data-kind="' + kind + '"><b>' + title + '</b><div class="small">' + esc(e && e.message || '') + '</div><div class="small muted">' + help + '</div>' +
      ((kind === 'nokey' || kind === 'badkey' || kind === 'ratelimit') ? '<button class="btn sm primary" data-open-ai style="margin-top:6px">⚙️ Advanced AI Settings</button>' : '') +
      (kind === 'ratelimit' ? ' <button class="btn sm" data-go="usage" style="margin-top:6px">📊 Usage meter</button>' : '') + '</div>';
  };

  /* ---------- modal ---------- */
  BC.modal = function (title, html, buttons, opts) {
    opts = opts || {};
    var wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-label="' + esc(title) + '"><div class="modal-h"><button class="back" data-mclose aria-label="Back">← <span>Back</span></button><h3>' + esc(title) + '</h3><span class="v420 small">v4.20</span></div><div class="modal-b">' + html + '</div>' +
      (buttons && buttons.length ? '<div class="modal-f">' + buttons.map(function (b, i) { return '<button class="btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + '" data-mb="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    $('#modals').appendChild(wrap);
    function close() { wrap.remove(); if (opts.onClose) opts.onClose(); }
    $('[data-mclose]', wrap).onclick = close;
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    (buttons || []).forEach(function (b, i) { $('[data-mb="' + i + '"]', wrap).onclick = function () { b.onClick ? b.onClick(close) : close(); }; });
    return { el: wrap, close: close };
  };

  /* ---------- router + layout ---------- */
  var NAV = [
    ['hub', '🛰️', 'Command Hub'], ['radar', '📡', 'Trend Radar'], ['seo', '🔎', 'SEO Pipeline'], ['vault', '🧠', 'Memory Vault'],
    ['studio', '🎬', 'Studio'], ['goal', '🎯', 'Goal Mode'], ['chat', '💬', 'AI Chat'], ['queue', '✅', 'Approvals'], ['usage', '📊', 'Usage & Quota'], ['settings', '⚙️', 'Settings']
  ];
  BC.NAV = NAV;
  var navStack = [];
  BC.route = function () { var h = location.hash.replace(/^#\/?/, ''); var p = h.split('/'); return { view: p[0] || 'hub', arg: p.slice(1).map(decodeURIComponent).join('/') }; };
  BC.go = function (path, replace) { if (replace) location.replace('#/' + path); else location.hash = '#/' + path; };
  BC.goBack = function () {
    if (navStack.length > 1) { navStack.pop(); var prev = navStack.pop(); BC.go(prev); return; }
    if (BC.route().view !== 'hub') BC.go('hub'); else BC.toast('You are on the Command Hub');
  };
  BC.header = function (title, sub, right) {
    return '<div class="head"><button class="back" data-back aria-label="Back">← <span>Back</span></button><button class="ib menu-btn" data-menu aria-label="Menu">☰</button>' +
      '<div class="grow ttl"><h2>' + title + '</h2><div class="sub">' + (sub || '') + '</div></div>' + (right || '') +
      '<button class="btn sm ai-btn" data-open-ai title="Advanced AI Settings">⚙️<span class="hide-sm"> AI Settings</span></button><span class="v420 hide-xs">v4.20</span></div>';
  };
  function renderShell() {
    $('#app').innerHTML = '<div class="shell" id="shell"><aside class="side" id="side"><div class="brandbar"><span class="logo">🛰️</span><div><div class="brand">Bizzle Command</div><span class="v420">v4.20</span></div></div>' +
      '<nav class="nav">' + NAV.map(function (n) { return '<a href="#/' + n[0] + '" class="item" data-nav="' + n[0] + '"><span class="ic">' + n[1] + '</span><span class="nm">' + n[2] + '</span><span class="badge hidden" data-badge="' + n[0] + '"></span></a>'; }).join('') + '</nav>' +
      '<div class="side-foot"><div id="mini-meter"></div><div class="tiny muted">build ' + esc(BC.BUILD) + '</div></div></aside><div class="scrim" id="scrim"></div>' +
      '<main class="main" id="main"></main></div><div id="netbar" class="netbar hidden"></div>' +
      '<button class="bizzy-fab" id="bizzy-fab" title="Ask Bizzy Bot" aria-label="Ask Bizzy Bot">🐝</button><div id="bizzy-root"></div>';
    $('#bizzy-fab').onclick = BC.toggleBizzy;
    $('#scrim').onclick = closeDrawer;
    updateNet(); BC.updateMeter(); BC.updateBadges();
  }
  function closeDrawer() { var s = $('#shell'); if (s) s.classList.remove('drawer'); }
  BC.closeDrawer = closeDrawer;
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-back]')) { e.preventDefault(); BC.goBack(); }
    if (e.target.closest('[data-menu]')) { e.preventDefault(); $('#shell').classList.toggle('drawer'); }
    if (e.target.closest('.nav .item')) closeDrawer();
  });
  function render() {
    var r = BC.route();
    if (!navStack.length || navStack[navStack.length - 1] !== location.hash.replace(/^#\/?/, '')) navStack.push(location.hash.replace(/^#\/?/, '') || 'hub');
    if (navStack.length > 50) navStack.shift();
    $$('.nav .item').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === r.view); });
    var fn = BC.rooms[r.view];
    var main = $('#main');
    if (BC.onLeave) { try { BC.onLeave(); } catch (e) {} BC.onLeave = null; }
    if (!fn) { BC.go('hub', true); return; }
    main.scrollTop = 0;
    try { var p = fn(main, r.arg); if (p && p.catch) p.catch(function (e) { console.warn(e); main.insertAdjacentHTML('beforeend', BC.errorHtml(e)); }); }
    catch (e) { console.warn(e); main.innerHTML = BC.header('Oops', '') + '<div class="body">' + BC.errorHtml(e) + '</div>'; }
    document.title = (NAV.filter(function (n) { return n[0] === r.view; })[0] || [0, 0, 'Bizzle Command'])[2] + ' · Bizzle Command v4.20';
  }
  BC.render = render;
  window.addEventListener('hashchange', render);

  /* ---------- online/offline ---------- */
  function updateNet() { var b = $('#netbar'); if (!b) return; if (navigator.onLine) { b.classList.add('hidden'); } else { b.classList.remove('hidden'); b.textContent = '📴 Offline: AI, scans and publishing are paused. Notes, queue and saved trends still work.'; } }
  window.addEventListener('online', function () { updateNet(); BC.toast('Back online ✓'); });
  window.addEventListener('offline', updateNet);

  /* ---------- usage meter ---------- */
  BC.updateMeter = function () {
    var el = $('#mini-meter'); if (!el) return;
    var st = AI.getSettings(), keys = AI.getKeys();
    el.innerHTML = '<div class="tiny muted" style="margin-bottom:4px">Free quota today (this device)</div>' + AI.ORDER.map(function (p) {
      var u = AI.usageToday(p), lim = (st.limits || {})[p] || AI.PROVIDERS[p].dailyDefault, pct = Math.min(100, Math.round(u.req / lim * 100));
      return '<div class="meter" title="' + u.req + ' of ~' + lim + ' requests"><span>' + AI.PROVIDERS[p].short + (keys[p] ? '' : ' (no key)') + '</span><div class="mbar"><i style="width:' + pct + '%" class="' + (pct > 85 ? 'hot' : '') + '"></i></div><span>' + u.req + '/' + lim + '</span></div>';
    }).join('');
  };
  window.addEventListener('bc-usage', BC.debounce(function () { BC.updateMeter(); }, 200));
  BC.updateBadges = function () {
    BC.DB.all('queue').then(function (q) { var n = q.filter(function (x) { return x.status === 'pending' || x.status === 'approved'; }).length; var b = $('[data-badge=queue]'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n); } }).catch(function () {});
  };

  /* ---------- themes ---------- */
  var THEMES = BC.THEMES = [['neon', '🟢 Neon Lime', '#39ff14'], ['grape', '🟣 Cyber Grape', '#b26bff'], ['ocean', '🔵 Ocean Pulse', '#22d3ee'], ['solar', '🟠 Solar Flare', '#ff9f1c'], ['rose', '🌸 Rose Quartz', '#ff4f8b'], ['daylight', '☀️ Daylight Sage', '#2f7d32']];
  BC.themeRow = function (cur) { return '<div class="theme-row">' + THEMES.map(function (t) { return '<button data-theme-pick="' + t[0] + '" class="' + (cur === t[0] ? 'on' : '') + '" style="color:' + t[2] + '">' + t[1] + '</button>'; }).join('') + '</div>'; };
  BC.bindThemeRow = function (root) { $$('[data-theme-pick]', root).forEach(function (b) { b.onclick = function () { var s = AI.getSettings(); s.theme = b.getAttribute('data-theme-pick'); AI.setSettings(s); BC.applyTheme(); $$('[data-theme-pick]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-theme-pick') === s.theme); }); }; }); };
  BC.applyTheme = function () { var t = AI.getSettings().theme || 'neon'; document.documentElement.setAttribute('data-theme', t); var mc = $('meta[name=theme-color]'); if (mc) mc.content = t === 'daylight' ? '#f4f6f1' : '#0b0f0c'; };
  BC.themeColors = function () { var cs = getComputedStyle(document.documentElement); return { bg: cs.getPropertyValue('--bg').trim(), accent: cs.getPropertyValue('--accent').trim(), accent2: cs.getPropertyValue('--accent2').trim(), text: cs.getPropertyValue('--text').trim(), panel: cs.getPropertyValue('--panel').trim() }; };

  /* ---------- Advanced AI Settings ---------- */
  BC.openAISettings = function () {
    var st = AI.getSettings(), keys = AI.getKeys(), provs = AI.ORDER;
    var m = BC.modal('🧠 Advanced AI Settings',
      '<div class="note">🔒 Keys are saved <b>only on this device</b> (localStorage). They are sent only to that AI provider, never to GitHub, the code, or anyone else. All three have free tiers; no card needed.</div>' +
      provs.map(function (p) { var P = AI.PROVIDERS[p]; return '<label>' + esc(P.label) + ' key <a href="' + P.keyUrl + '" target="_blank" rel="noopener">get a free key ↗</a></label><div class="row"><input type="password" id="k-' + p + '" autocomplete="off" value="' + esc(keys[p] || '') + '" placeholder="paste key"><button class="btn sm" data-show="' + p + '" aria-label="Show key">👁️</button><button class="btn sm" data-test="' + p + '">Test</button></div><div class="tiny muted" id="kt-' + p + '"></div>'; }).join('') +
      '<label>Auto-fallback order (first = default provider)</label><div id="s-chain" class="chain">' + st.chain.map(function (p) { return '<div class="chip" data-p="' + p + '"><span>' + AI.PROVIDERS[p].short + '</span><button class="btn sm" data-up="' + p + '" aria-label="Move up">▲</button></div>'; }).join('') + '</div>' +
      '<div class="switch"><input type="checkbox" id="s-fb"' + (st.autoFallback ? ' checked' : '') + '><span>Auto-fallback: if a provider is rate-limited, down or has no key, try the next one</span></div>' +
      '<label>Default model for the first provider (blank = Pro tier with automatic model fallback)</label><div class="row"><select id="s-model"></select><button class="btn sm" id="s-model-ref" title="Load live model list">↻</button></div>' +
      '<label>Temperature: <span id="s-temp-v">' + st.temperature + '</span></label><input type="range" id="s-temp" min="0" max="1.5" step="0.05" value="' + st.temperature + '" style="width:100%">' +
      '<label>Max output tokens</label><input type="number" id="s-max" min="128" max="65536" value="' + st.maxTokens + '">' +
      '<label>Daily request budget per provider (for the quota meter)</label><div class="row wrap">' + provs.map(function (p) { return '<span class="small">' + AI.PROVIDERS[p].short + '</span><input type="number" min="1" id="lim-' + p + '" value="' + ((st.limits || {})[p] || AI.PROVIDERS[p].dailyDefault) + '" style="width:90px">'; }).join('') + '</div>' +
      '<div class="switch"><input type="checkbox" id="s-ground"' + (st.grounding ? ' checked' : '') + '><span>Use Gemini Google Search grounding by default in AI Chat (needs a Gemini key with grounding quota)</span></div>' +
      '<label>Global system prompt (added to every AI job)</label><textarea id="s-sys" rows="3" placeholder="Write in a punchy, friendly voice.">' + esc(st.systemPrompt || '') + '</textarea>' +
      '<label>AI color theme</label>' + BC.themeRow(st.theme),
      [{ label: 'Clear keys', danger: true, onClick: function () { if (confirm('Remove all AI keys from this device?')) { AI.setKeys({}); provs.forEach(function (p) { $('#k-' + p).value = ''; }); BC.toast('Keys removed'); BC.updateMeter(); } } },
       { label: 'Save', primary: true, onClick: function (close) {
         var k = {}; provs.forEach(function (p) { var v = $('#k-' + p).value.trim(); if (v) k[p] = v; }); AI.setKeys(k);
         var s = AI.getSettings();
         s.chain = $$('#s-chain .chip').map(function (c) { return c.getAttribute('data-p'); }); s.provider = s.chain[0];
         s.autoFallback = $('#s-fb').checked; s.model = $('#s-model').value; s.temperature = parseFloat($('#s-temp').value);
         s.maxTokens = Math.max(128, parseInt($('#s-max').value, 10) || 2048); s.systemPrompt = $('#s-sys').value; s.grounding = $('#s-ground').checked;
         s.limits = {}; provs.forEach(function (p) { s.limits[p] = Math.max(1, parseInt($('#lim-' + p).value, 10) || AI.PROVIDERS[p].dailyDefault); });
         AI.setSettings(s); close(); BC.toast('AI settings saved ✓'); BC.updateMeter(); if (BC.route().view === 'hub' || BC.route().view === 'usage') BC.render();
       } }]);
    BC.bindThemeRow(m.el);
    function first() { return $$('#s-chain .chip', m.el)[0].getAttribute('data-p'); }
    function fill(list) { var p = first(); $('#s-model').innerHTML = '<option value="">Tier default (' + esc(AI.modelFor(p, 'Pro')) + ' + fallback)</option>' + (list || AI.PROVIDERS[p].models.map(function (id) { return { id: id }; })).map(function (x) { return '<option' + (x.id === st.model ? ' selected' : '') + '>' + esc(x.id) + '</option>'; }).join(''); }
    fill();
    $('#s-chain', m.el).addEventListener('click', function (e) { var b = e.target.closest('[data-up]'); if (!b) return; var c = b.parentNode, prev = c.previousElementSibling; if (prev) c.parentNode.insertBefore(c, prev); fill(); });
    $('#s-model-ref').onclick = function () { AI.listModels(first()).then(fill).catch(function (e) { BC.toast('Could not load models: ' + e.message, true); }); };
    $('#s-temp').oninput = function () { $('#s-temp-v').textContent = this.value; };
    $$('[data-show]', m.el).forEach(function (b) { b.onclick = function () { var i = $('#k-' + b.getAttribute('data-show')); i.type = i.type === 'password' ? 'text' : 'password'; }; });
    $$('[data-test]', m.el).forEach(function (b) { b.onclick = function () {
      var p = b.getAttribute('data-test'), key = $('#k-' + p).value.trim(), out = $('#kt-' + p);
      if (!key) { out.textContent = 'Paste a key first.'; return; }
      out.textContent = 'Testing…';
      AI.callProvider(p, { key: key, effort: 'Fast', messages: [{ role: 'user', text: 'Reply with exactly: OK' }], maxTokens: 256, temperature: 0 })
        .then(function (r) { out.textContent = '✅ Works: ' + r.model + ' said "' + (r.text || '').slice(0, 40) + '"'; }, function (e) { out.textContent = '❌ ' + e.message; });
    }; });
    return m;
  };

  /* ---------- Bizzy Bot pop-up helper (memory on this device) ---------- */
  var GUIDE = 'Bizzle Command v4.20 guide:\n' +
    '- Command Hub: start page with every room (agent) and today\'s status. Sidebar (☰ on phones) links all rooms. Green ← Back is on every page.\n' +
    '- Keys: ⚙️ AI Settings (top right of every page). Free keys: Gemini (aistudio.google.com), Groq (console.groq.com), OpenRouter (openrouter.ai). Keys stay on the device. Auto-fallback tries the next provider when one is rate-limited or down.\n' +
    '- Trend Radar: Scan now pulls the last 24h from Hacker News + Google News for your Watch list (edit it in the Watch list tab). Optional Gemini web search. Duplicates are merged; each card shows sources and how fresh it is. Draft this = AI post/article draft, Share to X = opens x.com with the text (you press Post), Save to Vault, Send to Studio. Archive tab keeps every day. Daily feed tab imports the GitHub Actions scan.\n' +
    '- SEO Pipeline: Import a Google Search Console export (Performance > Export > CSV/zip, Queries.csv or Pages.csv) or connect with Google if you put your own OAuth Client ID in Settings. Opportunities: low-CTR pages and striking-distance queries (positions 8-20). Brief -> Article -> Spam-policy review -> Approvals queue -> Publish to your GitHub Pages blog (fine-grained token in Settings).\n' +
    '- Memory Vault: Markdown notes, [[wikilinks]], #tags, backlinks, graph view. Export/import an Obsidian-compatible .zip.\n' +
    '- Studio: script -> canvas video (9:16, 1:1, 16:9) -> Record -> download WebM. Voice: browser voice (preview only) or Gemini AI voice (built into the video).\n' +
    '- Goal Mode: give a goal and a step cap; the agent searches news, reads pages, writes notes and queues drafts. It never publishes; everything waits in Approvals.\n' +
    '- AI Chat: chat with screenshots, web search grounding, copy and save replies to the Vault.\n' +
    '- Approvals: approve/reject drafts; approved articles can be published to GitHub; approved X posts open the X share page.\n' +
    '- Usage & Quota: requests per provider today vs your daily budget, rate limits and fallbacks.\n' +
    '- Settings: themes, GitHub publishing, Google OAuth client ID, daily feed URL, backup/restore all data.';
  function bizzyMem() { return BC.lsGet('bc.bizzy', { history: [], notes: [] }); }
  BC.bizzyMem = bizzyMem;
  BC.toggleBizzy = function () {
    var root = $('#bizzy-root'); if (!root) return;
    if (root.innerHTML) { root.innerHTML = ''; return; }
    root.innerHTML = '<div class="bizzy" role="dialog" aria-label="Bizzy Bot"><div class="modal-h"><button class="back" id="bz-back" aria-label="Back">←</button><h3>🐝 Bizzy Bot</h3><span class="v420 small">v4.20</span><button class="btn sm" id="bz-clear" title="Clear memory">🧹</button></div>' +
      '<div class="msgs" id="bz-msgs"></div><div class="chips" id="bz-chips"></div><div class="pending" id="bz-pend"></div>' +
      '<div class="composer"><div class="cbox"><textarea id="bz-ta" rows="1" placeholder="How do I…? (\'remember: …\' saves a note)"></textarea><div class="cbar"><button class="ib" id="bz-img" title="Attach a screenshot for AI help" aria-label="Attach screenshot">🖼️</button><span class="grow"></span><button class="send" id="bz-send" aria-label="Send">➤</button></div><input type="file" id="bz-file" accept="image/*" class="hidden"></div></div></div>';
    var img = null;
    function draw() {
      var mem = bizzyMem();
      var html = '<div class="bm a">Hi! I\'m <b>Bizzy Bot</b> 🐝. Ask me how to do anything in Bizzle Command, or attach a screenshot. I remember our chat on this device' + (mem.notes.length ? ' and ' + mem.notes.length + ' note(s)' : '') + '.</div>';
      mem.history.forEach(function (h) { html += '<div class="bm ' + (h.role === 'user' ? 'u' : 'a') + '">' + (h.role === 'user' ? BC.md(h.text) : BC.reply(h.text)) + '</div>'; });
      $('#bz-msgs').innerHTML = html; $('#bz-msgs').scrollTop = 1e9;
      $('#bz-chips').innerHTML = mem.history.length ? '' : ['How do I scan trends?', 'How do I publish an article?', 'How do I export to Obsidian?', 'What happens when I hit a rate limit?'].map(function (q) { return '<button>' + q + '</button>'; }).join('');
      $$('#bz-chips button').forEach(function (b) { b.onclick = function () { $('#bz-ta').value = b.textContent; send(); }; });
    }
    function send() {
      var ta = $('#bz-ta'), text = ta.value.trim(); if (!text && !img) return;
      ta.value = ''; var mem = bizzyMem();
      var rem = text.match(/^remember:?\s+(.+)/i);
      if (rem) { mem.notes.push(rem[1]); mem.notes = mem.notes.slice(-30); mem.history.push({ role: 'user', text: text }, { role: 'assistant', text: '📝 Saved to my memory on this device.' }); BC.lsSet('bc.bizzy', mem); draw(); return; }
      mem.history.push({ role: 'user', text: (text || 'What is in this screenshot?') + (img ? ' [screenshot attached]' : '') }); BC.lsSet('bc.bizzy', mem); draw();
      var think = document.createElement('div'); think.className = 'bm a'; think.textContent = '🐝 thinking…'; $('#bz-msgs').appendChild(think);
      var hist = mem.history.slice(-12).map(function (h) { return { role: h.role, text: h.text }; });
      if (img) hist[hist.length - 1].images = [img];
      AI.run({ effort: 'Fast', system: 'You are Bizzy Bot, the friendly in-app helper for Bizzle Command v4.20 (owner: Nunya Bizz). Answer how-to questions briefly and concretely using this guide. If a screenshot is attached, describe what you see and help. If unsure, say so.\nCurrent page: ' + BC.route().view + '\n\n' + GUIDE + (mem.notes.length ? '\n\nThings the user asked you to remember:\n- ' + mem.notes.join('\n- ') : ''), messages: hist, temperature: 0.4, maxTokens: 1500 })
        .then(function (res) { mem = bizzyMem(); mem.history.push({ role: 'assistant', text: res.text || '(no answer)' }); mem.history = mem.history.slice(-40); BC.lsSet('bc.bizzy', mem); },
          function (e) { mem = bizzyMem(); mem.history.push({ role: 'assistant', text: '⚠️ ' + e.message + (e.kind === 'nokey' ? '\n\nTap ⚙️ AI Settings at the top of any page.' : '') }); BC.lsSet('bc.bizzy', mem); })
        .then(function () { img = null; $('#bz-pend').innerHTML = ''; if ($('#bz-msgs')) draw(); });
    }
    $('#bz-send').onclick = send;
    $('#bz-ta').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    $('#bz-back').onclick = BC.toggleBizzy;
    $('#bz-clear').onclick = function () { if (confirm('Clear Bizzy\'s memory on this device?')) { BC.lsSet('bc.bizzy', { history: [], notes: [] }); draw(); } };
    $('#bz-img').onclick = function () { $('#bz-file').click(); };
    $('#bz-file').onchange = function () { var f = this.files[0]; if (!f) return; BC.resizeImage(f, 1280).then(function (data) { img = { mime: 'image/jpeg', base64: data.split(',')[1] }; $('#bz-pend').innerHTML = '<div class="pf"><img src="' + data + '" alt="">screenshot<button id="bz-rm" aria-label="Remove">✕</button></div>'; $('#bz-rm').onclick = function () { img = null; $('#bz-pend').innerHTML = ''; }; }, function (e) { BC.toast(e.message, true); }); };
    draw(); if (!BC.isPhone()) $('#bz-ta').focus();
  };

  /* ---------- reusable "screenshot -> AI help" control for any view ---------- */
  BC.shotPicker = function (id) {
    return '<span class="shot"><button class="btn sm" data-shot="' + id + '" title="Attach a screenshot for AI help">🖼️ Screenshot</button><input type="file" accept="image/*" class="hidden" id="shotf-' + id + '"><span class="tiny muted" id="shotn-' + id + '"></span></span>';
  };
  BC.shots = {};
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-shot]'); if (b) { var id = b.getAttribute('data-shot'); $('#shotf-' + id).click(); } });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t.id || t.id.indexOf('shotf-') !== 0) return; var id = t.id.slice(6), f = t.files[0]; if (!f) return;
    BC.resizeImage(f, 1280).then(function (data) { BC.shots[id] = { mime: 'image/jpeg', base64: data.split(',')[1], url: data }; var n = $('#shotn-' + id); if (n) n.innerHTML = '<img src="' + data + '" alt="" class="thumb"> attached <button class="btn sm" data-unshot="' + id + '" aria-label="Remove screenshot">✕</button>'; }, function (er) { BC.toast(er.message, true); });
  });
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-unshot]'); if (b) { var id = b.getAttribute('data-unshot'); delete BC.shots[id]; $('#shotn-' + id).innerHTML = ''; } });
  BC.takeShot = function (id) { var s = BC.shots[id]; delete BC.shots[id]; var n = $('#shotn-' + id); if (n) n.innerHTML = ''; return s ? [{ mime: s.mime, base64: s.base64 }] : undefined; };

  /* ---------- service worker + updates ---------- */
  var swReg = null;
  function registerSW() {
    if (!('serviceWorker' in navigator) || window.Capacitor || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js?v=' + BC.BUILD).then(function (reg) {
      swReg = reg;
      reg.addEventListener('updatefound', function () { var nw = reg.installing; if (!nw) return; nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); }); });
    }).catch(function (e) { console.warn('SW', e.message); });
    var reloaded = false, had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (!had) { had = true; return; } if (reloaded) return; reloaded = true; location.reload(); });
  }
  function showUpdate() { if ($('#upd')) return; var d = document.createElement('div'); d.id = 'upd'; d.className = 'toast'; d.style.pointerEvents = 'auto'; d.innerHTML = '✨ New version ready <button class="btn sm primary">Reload</button>'; $('#toasts').appendChild(d); $('button', d).onclick = function () { if (swReg && swReg.waiting) swReg.waiting.postMessage('skipWaiting'); else location.reload(); }; }
  BC.checkForUpdate = function () { if (swReg) swReg.update().then(function () { BC.toast(swReg.waiting ? 'Update found' : 'You are on the latest build (' + BC.BUILD + ')'); if (swReg.waiting) showUpdate(); }); else BC.toast('Build ' + BC.BUILD + (window.Capacitor ? ' (app updates come as new APKs)' : '')); };

  /* ---------- Android hardware back ---------- */
  function initNative() {
    var C = window.Capacitor; if (!C || !C.Plugins || !C.Plugins.App) return;
    C.Plugins.App.addListener('backButton', function () {
      if ($('#modals').lastElementChild) { $('#modals').lastElementChild.remove(); return; }
      if ($('#bizzy-root') && $('#bizzy-root').innerHTML) { $('#bizzy-root').innerHTML = ''; return; }
      if ($('#shell') && $('#shell').classList.contains('drawer')) { closeDrawer(); return; }
      if (BC.route().view === 'hub') C.Plugins.App.exitApp(); else BC.goBack();
    });
  }

  BC.start = function () {
    BC.applyTheme(); renderShell(); initNative();
    if (!location.hash) BC.go('hub', true);
    render(); registerSW();
  };
})();
