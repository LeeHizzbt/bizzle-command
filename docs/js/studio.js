/* Bizzle Command v4.20 — Studio: short kinetic-text videos made in the browser (canvas + MediaRecorder),
   with a Web Speech voiceover preview or a Gemini AI voice that is mixed into the downloaded video. Original code (MIT). */
(function () {
  'use strict';
  var BC = window.BC, AI = BC.AI, $ = BC.$, $$ = BC.$$, esc = BC.esc;
  var FORMATS = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] };
  var playing = null;

  function parseScript(text) {
    return String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 20).map(function (l) {
      var m = /^(\S{1,4})\s*\|\s*(.+)$/.exec(l); return m ? { emoji: m[1], text: m[2] } : { emoji: '', text: l };
    });
  }
  function timings(scenes, total) {
    var words = scenes.map(function (s) { return Math.max(3, s.text.split(/\s+/).length); });
    var sum = words.reduce(function (a, b) { return a + b; }, 0);
    var dur = total ? words.map(function (w) { return w / sum * total; }) : words.map(function (w) { return Math.max(2.2, w * 0.38); });
    var t = 0; return dur.map(function (d) { var o = { start: t, end: t + d }; t += d; return o; });
  }
  function wrap(ctx, text, maxW) { var words = text.split(/\s+/), lines = [], cur = ''; words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
  function drawFrame(ctx, W, H, scenes, times, t, col, title) {
    var i = 0; while (i < times.length - 1 && t >= times[i].end) i++;
    var sc = scenes[i], tm = times[i], local = Math.max(0, t - tm.start), len = tm.end - tm.start;
    var g = ctx.createLinearGradient(0, 0, W, H), hue = (t * 12) % 360;
    g.addColorStop(0, col.bg || '#0b0f0c'); g.addColorStop(1, col.panel || '#111814');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = col.accent;
    for (var k = 0; k < 6; k++) { var r = (Math.sin(t * 0.7 + k) * 0.5 + 0.5) * W * 0.25 + 30; ctx.beginPath(); ctx.arc((k * 0.19 * W + t * 25 * (k % 2 ? 1 : -1)) % (W + 200) - 100, H * (0.15 + k * 0.14), r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    var fs = Math.round(Math.min(W, H) * 0.075);
    ctx.font = '800 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var lines = wrap(ctx, sc.text, W * 0.84), lh = fs * 1.22, y0 = H / 2 - (lines.length - 1) * lh / 2;
    var totalWords = sc.text.split(/\s+/).length, shown = Math.min(totalWords, Math.floor(local / Math.max(0.12, (len * 0.7) / totalWords)) + 1), cnt = 0;
    var inA = Math.min(1, local / 0.35), outA = Math.min(1, (len - local) / 0.3);
    ctx.globalAlpha = Math.max(0, Math.min(inA, outA));
    if (sc.emoji) { ctx.font = Math.round(fs * 1.6) + 'px system-ui'; ctx.fillText(sc.emoji, W / 2, y0 - lh * 1.4); ctx.font = '800 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; }
    lines.forEach(function (line, li) {
      var ws = line.split(' '), vis = []; ws.forEach(function (w) { cnt++; if (cnt <= shown) vis.push(w); });
      ctx.shadowColor = col.accent; ctx.shadowBlur = 18; ctx.fillStyle = li === 0 ? col.accent : col.text;
      ctx.fillText(vis.join(' '), W / 2, y0 + li * lh + (1 - inA) * 20);
    });
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    var total = times[times.length - 1].end;
    ctx.fillStyle = col.accent; ctx.fillRect(0, H - 8, W * Math.min(1, t / total), 8);
    ctx.font = '600 ' + Math.round(fs * 0.38) + 'px system-ui'; ctx.fillStyle = col.text; ctx.globalAlpha = 0.75; ctx.textAlign = 'left';
    ctx.fillText((title || '').slice(0, 48), 18, 28); ctx.textAlign = 'right'; ctx.fillText((i + 1) + '/' + scenes.length, W - 18, 28); ctx.globalAlpha = 1;
    return i;
  }
  function pickMime() { var c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']; for (var i = 0; i < c.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i]; return ''; }
  function pcmToBuffer(ac, tts) {
    if (/wav/i.test(tts.mime || '')) return ac.decodeAudioData(tts.buffer.slice(0));
    var dv = new DataView(tts.buffer), n = Math.floor(tts.buffer.byteLength / 2), buf = ac.createBuffer(1, n, tts.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    return Promise.resolve(buf);
  }
  function stop() { if (playing) { playing.stop(); playing = null; } if (window.speechSynthesis) speechSynthesis.cancel(); }

  /* run the animation (and optionally record). opts: {record, voice:'none'|'browser'|'gemini'} */
  function run(opts) {
    stop();
    var scenes = parseScript($('#st-script').value);
    if (!scenes.length) { BC.toast('Write at least one scene line', true); return Promise.resolve(); }
    var fmt = FORMATS[$('#st-fmt').value] || FORMATS['9:16'], cv = $('#st-canvas'), W = fmt[0], H = fmt[1];
    cv.width = W; cv.height = H; var ctx = cv.getContext('2d'), col = BC.themeColors(), title = $('#st-title').value.trim();
    var status = $('#st-status'), audioP = Promise.resolve(null), ac = null;
    if (opts.voice === 'gemini') {
      status.innerHTML = '<span class="muted">🎙️ Generating AI voice with Gemini…</span>';
      ac = new (window.AudioContext || window.webkitAudioContext)();
      audioP = AI.tts(scenes.map(function (s) { return s.text; }).join('\n'), $('#st-gvoice').value).then(function (t) { return pcmToBuffer(ac, t); });
    }
    return audioP.then(function (abuf) {
      var times = timings(scenes, abuf ? abuf.duration : 0), total = times[times.length - 1].end;
      var rec = null, chunks = [], src = null, mime = pickMime(), spoken = -1, t0, alive = true, done;
      var finished = new Promise(function (r) { done = r; });
      if (opts.record) {
        if (!cv.captureStream || !window.MediaRecorder) { status.innerHTML = BC.errorHtml({ message: 'This browser cannot record canvas video (no MediaRecorder/captureStream).' }); return; }
        var stream = cv.captureStream(30);
        if (abuf) { var dest = ac.createMediaStreamDestination(); src = ac.createBufferSource(); src.buffer = abuf; src.connect(dest); src.connect(ac.destination); dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); }); }
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          var type = (rec.mimeType || mime || 'video/webm').split(';')[0], blob = new Blob(chunks, { type: type }), ext = /mp4/.test(type) ? 'mp4' : 'webm';
          var url = URL.createObjectURL(blob), name = BC.slug(title || scenes[0].text) + '.' + ext;
          BC.lastVideo = { size: blob.size, type: type, duration: total };
          $('#st-result').innerHTML = '<div class="card"><b>🎞️ Your video</b> <span class="tiny muted">' + esc(type) + ' · ' + (blob.size / 1048576).toFixed(2) + ' MB · ' + total.toFixed(1) + ' s' + (abuf ? ' · with AI voice' : ' · silent') + '</span><video id="st-video" src="' + url + '" controls playsinline style="width:100%;max-height:60vh;margin-top:8px;border-radius:12px;background:#000"></video><div class="row wrap" style="margin-top:8px"><button class="btn primary" id="st-dl">⬇️ Download ' + ext.toUpperCase() + '</button><button class="btn" id="st-q">✅ Queue post with this script</button></div></div>';
          $('#st-dl').onclick = function () { BC.saveBlob(blob, name); };
          $('#st-q').onclick = function () { BC.Queue.add({ type: 'xpost', title: title || scenes[0].text, body: scenes.map(function (s) { return s.text; }).join(' ').slice(0, 270), meta: { video: name } }).then(function () { BC.toast('Queued (attach the downloaded video when you post)'); }); };
          status.innerHTML = '✅ Recorded ' + total.toFixed(1) + ' s. Download it below.';
          done();
        };
      }
      var raf;
      function frame() {
        if (!alive) return;
        var t = (performance.now() - t0) / 1000;
        if (t >= total) { drawFrame(ctx, W, H, scenes, times, total - 0.001, col, title); alive = false; setTimeout(function () { if (rec && rec.state !== 'inactive') rec.stop(); else done(); if (ac && !rec) ac.close(); }, 250); if (!rec) status.textContent = '✅ Preview finished (' + total.toFixed(1) + ' s)'; playing = null; return; }
        var i = drawFrame(ctx, W, H, scenes, times, t, col, title);
        if (opts.voice === 'browser' && i !== spoken && window.speechSynthesis) { spoken = i; var u = new SpeechSynthesisUtterance(scenes[i].text); var vs = speechSynthesis.getVoices(), vn = $('#st-bvoice').value; var v = vs.filter(function (x) { return x.name === vn; })[0]; if (v) u.voice = v; u.rate = 1.05; speechSynthesis.speak(u); }
        raf = requestAnimationFrame(frame);
      }
      drawFrame(ctx, W, H, scenes, times, 0, col, title);
      status.innerHTML = opts.record ? '⏺️ Recording… ' + total.toFixed(1) + ' s (keep this tab open)' : '▶️ Previewing…';
      if (rec) rec.start(250);
      if (src) src.start();
      else if (abuf && !opts.record) { src = ac.createBufferSource(); src.buffer = abuf; src.connect(ac.destination); src.start(); }
      t0 = performance.now(); raf = requestAnimationFrame(frame);
      playing = { stop: function () { alive = false; cancelAnimationFrame(raf); try { if (src) src.stop(); } catch (e) {} if (rec && rec.state !== 'inactive') rec.stop(); else done(); status.textContent = '⏹️ Stopped'; } };
      return finished;
    }).catch(function (e) { status.innerHTML = BC.errorHtml(e); if (ac) ac.close(); });
  }
  BC.Studio = { run: run, parseScript: parseScript, timings: timings, stop: stop };

  BC.rooms.studio = function (main) {
    var seed = BC.studioSeed; BC.studioSeed = null;
    var saved = BC.lsGet('bc.studio', { title: 'Bizzle Command v4.20', script: '🛰️ | Meet Bizzle Command v4.20\n📡 | It scans the news every day from free sources\n🧠 | Saves ideas into a linked memory vault\n🎬 | And turns them into short videos like this one\n✅ | You approve everything before it goes out' });
    var hasSpeech = 'speechSynthesis' in window;
    main.innerHTML = BC.header('🎬 Studio', 'Short videos made in your browser · canvas + MediaRecorder · voiceover') + '<div class="body"><div class="studio">' +
      '<div class="card"><label style="margin-top:0">Topic (for the AI script)</label><div class="row wrap"><input id="st-topic" class="grow" placeholder="e.g. 3 free AI SEO tips" value="' + esc(seed ? seed.topic : '') + '">' + BC.shotPicker('studio') + '<button class="btn primary" id="st-ai">✨ AI script</button></div><div id="st-aiout"></div>' +
      '<label>Title</label><input id="st-title" value="' + esc(seed ? seed.topic.slice(0, 60) : saved.title) + '">' +
      '<label>Script — one scene per line, optional "emoji | text"</label><textarea id="st-script" rows="8">' + esc(saved.script) + '</textarea>' +
      '<div class="row wrap" style="margin-top:8px"><label class="ck">Format <select id="st-fmt" style="width:auto"><option>9:16</option><option>1:1</option><option>16:9</option></select></label>' +
      '<label class="ck">Voice <select id="st-voice" style="width:auto"><option value="none">None (silent)</option><option value="browser"' + (hasSpeech ? '' : ' disabled') + '>Browser voice (live, not in file)' + (hasSpeech ? '' : ' — not supported here') + '</option><option value="gemini">Gemini AI voice (in the file)</option></select></label>' +
      '<select id="st-bvoice" style="width:auto;max-width:200px" class="hidden"></select><select id="st-gvoice" style="width:auto" class="hidden">' + ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'].map(function (v) { return '<option>' + v + '</option>'; }).join('') + '</select></div>' +
      '<div class="row wrap" style="margin-top:10px"><button class="btn" id="st-play">▶️ Preview</button><button class="btn primary" id="st-rec">⏺️ Record &amp; download</button><button class="btn" id="st-stop">⏹️ Stop</button></div><div id="st-status" class="small" style="margin-top:8px"></div></div>' +
      '<div class="card canvaswrap"><canvas id="st-canvas" width="540" height="960" aria-label="Video preview"></canvas></div></div><div id="st-result" style="margin-top:12px"></div></div>';
    function persist() { BC.lsSet('bc.studio', { title: $('#st-title').value, script: $('#st-script').value }); }
    $('#st-script').oninput = $('#st-title').oninput = BC.debounce(persist, 400);
    function voices() { if (!hasSpeech) return; var vs = speechSynthesis.getVoices(); $('#st-bvoice').innerHTML = vs.length ? vs.map(function (v) { return '<option>' + esc(v.name) + '</option>'; }).join('') : '<option value="">default voice</option>'; }
    if (hasSpeech) { voices(); speechSynthesis.onvoiceschanged = voices; }
    $('#st-voice').onchange = function () { $('#st-bvoice').classList.toggle('hidden', this.value !== 'browser'); $('#st-gvoice').classList.toggle('hidden', this.value !== 'gemini'); };
    $('#st-play').onclick = function () { run({ record: false, voice: $('#st-voice').value }); };
    $('#st-rec').onclick = function () { persist(); run({ record: true, voice: $('#st-voice').value }); };
    $('#st-stop').onclick = stop;
    $('#st-ai').onclick = function () {
      var topic = $('#st-topic').value.trim() || $('#st-title').value.trim(); if (!topic) { BC.toast('Type a topic', true); return; }
      $('#st-aiout').innerHTML = '<span class="muted">✨ Writing script…</span>';
      AI.run({ effort: 'Fast', json: true, temperature: 0.8, system: 'You write punchy 20-40 second vertical video scripts.',
        messages: [{ role: 'user', text: 'Topic: ' + topic + (seed && seed.url ? '\nSource: ' + seed.url : '') + '\nWrite 5-7 scenes, each max 14 words, first scene is a hook, last is a call to action. Reply JSON {"title":"","scenes":[{"emoji":"","text":""}]}', images: BC.takeShot('studio') }] })
        .then(function (r) {
          var j = AI.parseJSON(r.text) || {}; var sc = (j.scenes || []).filter(function (s) { return s && s.text; });
          if (!sc.length) throw Object.assign(new Error('The AI reply had no scenes. Try again.'), { kind: 'error' });
          $('#st-script').value = sc.map(function (s) { return (s.emoji ? s.emoji + ' | ' : '') + s.text; }).join('\n'); if (j.title) $('#st-title').value = j.title; persist();
          $('#st-aiout').innerHTML = BC.reply('**' + (j.title || topic) + '**\n' + sc.map(function (s, i) { return (i + 1) + '. ' + (s.emoji || '') + ' ' + s.text; }).join('\n'));
        }).catch(function (e) { $('#st-aiout').innerHTML = BC.errorHtml(e); });
    };
    var sc = parseScript($('#st-script').value);
    if (sc.length) { var cv = $('#st-canvas'); drawFrame(cv.getContext('2d'), cv.width, cv.height, sc, timings(sc), 1.5, BC.themeColors(), $('#st-title').value); }
    BC.onLeave = stop;
  };
})();
