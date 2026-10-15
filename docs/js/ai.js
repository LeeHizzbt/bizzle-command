/* Bizzle Command v4.20 — AI layer: Gemini (default), Groq, OpenRouter free models.
   Bring-your-own keys, stored only in this device's localStorage. Never sent anywhere except the provider.
   Adapted from Bizzle Huddle v4.20 (same owner, MIT). Adds: cross-provider auto-fallback, usage/quota meter,
   Gemini Google Search grounding, Gemini TTS and JSON mode. */
(function () {
  'use strict';
  var PROVIDERS = {
    gemini: {
      label: 'Google Gemini', short: 'Gemini', keyUrl: 'https://aistudio.google.com/app/apikey', vision: true, dailyDefault: 1000,
      tiers: { Fast: 'gemini-flash-lite-latest', Pro: 'gemini-flash-latest', Max: 'gemini-pro-latest' },
      fallback: { 'gemini-pro-latest': 'gemini-flash-latest', 'gemini-flash-latest': 'gemini-flash-lite-latest', 'gemini-flash-lite-latest': 'gemma-4-31b-it' },
      models: ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest', 'gemma-4-31b-it']
    },
    groq: {
      label: 'Groq', short: 'Groq', keyUrl: 'https://console.groq.com/keys', vision: true, dailyDefault: 1000,
      tiers: { Fast: 'openai/gpt-oss-20b', Pro: 'openai/gpt-oss-120b', Max: 'openai/gpt-oss-120b' },
      fallback: { 'openai/gpt-oss-120b': 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b': 'openai/gpt-oss-20b' },
      visionModels: ['qwen/qwen3.8-27b'],
      models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
    },
    openrouter: {
      label: 'OpenRouter (free models)', short: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', vision: true, dailyDefault: 50,
      tiers: { Fast: 'openrouter/free', Pro: 'google/gemma-4-31b-it:free', Max: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
      fallback: { 'nvidia/nemotron-3-ultra-550b-a55b:free': 'google/gemma-4-31b-it:free', 'google/gemma-4-31b-it:free': 'openrouter/free' },
      models: ['openrouter/free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']
    }
  };
  var ORDER = ['gemini', 'groq', 'openrouter'];
  var LS_KEYS = 'bc.aiKeys', LS_SET = 'bc.aiSettings', LS_USE = 'bc.usage';

  function getKeys() { try { return JSON.parse(localStorage.getItem(LS_KEYS) || '{}'); } catch (e) { return {}; } }
  function setKeys(k) { localStorage.setItem(LS_KEYS, JSON.stringify(k || {})); }
  function defaults() {
    return { provider: 'gemini', model: '', chain: ORDER.slice(), autoFallback: true, temperature: 0.7, maxTokens: 2048,
      systemPrompt: '', theme: 'neon', limits: { gemini: 1000, groq: 1000, openrouter: 50 }, grounding: false };
  }
  function getSettings() {
    var d = defaults();
    try { var s = JSON.parse(localStorage.getItem(LS_SET) || '{}'); for (var k in s) d[k] = s[k]; } catch (e) {}
    if (!Array.isArray(d.chain) || !d.chain.length) d.chain = ORDER.slice();
    return d;
  }
  function setSettings(s) { localStorage.setItem(LS_SET, JSON.stringify(s)); }
  function hasAnyKey() { var k = getKeys(); return ORDER.some(function (p) { return !!k[p]; }); }
  function modelFor(provider, effort) { var p = PROVIDERS[provider] || PROVIDERS.gemini; return p.tiers[effort || 'Pro']; }
  function estTokens(s) { return Math.ceil((s || '').length / 4); }

  /* ---------- usage / quota meter (per device, per local day) ---------- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function getUsage() { try { return JSON.parse(localStorage.getItem(LS_USE) || '{}'); } catch (e) { return {}; } }
  function bump(provider, field, n) {
    var u = getUsage(), d = today();
    u[d] = u[d] || {}; u[d][provider] = u[d][provider] || { req: 0, tok: 0, err: 0, rl: 0, fb: 0 };
    u[d][provider][field] = (u[d][provider][field] || 0) + (n == null ? 1 : n);
    var days = Object.keys(u).sort(); while (days.length > 30) delete u[days.shift()];
    localStorage.setItem(LS_USE, JSON.stringify(u));
    try { window.dispatchEvent(new CustomEvent('bc-usage')); } catch (e) {}
  }
  function usageToday(provider) { var u = getUsage()[today()] || {}; return u[provider] || { req: 0, tok: 0, err: 0, rl: 0, fb: 0 }; }

  function AIError(msg, status, provider, model, kind) {
    var e = new Error(msg); e.status = status; e.provider = provider; e.model = model;
    e.kind = kind || (status === 429 ? 'ratelimit' : status >= 500 ? 'down' : status === 401 || status === 403 ? 'badkey' : status === 0 ? 'network' : 'error');
    return e;
  }

  function buildRequest(opts) {
    var provider = opts.provider, model = opts.model, key = opts.key || '';
    var msgs = opts.messages || [], sys = opts.system || '';
    var temperature = opts.temperature == null ? 0.7 : Number(opts.temperature);
    var maxTokens = opts.maxTokens || 2048;
    if (provider === 'gemini') {
      var contents = msgs.map(function (m) {
        var parts = [];
        if (m.text) parts.push({ text: m.text });
        (m.images || []).forEach(function (img) { parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } }); });
        if (!parts.length) parts.push({ text: '(empty)' });
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
      });
      var merged = [];
      contents.forEach(function (c) { var last = merged[merged.length - 1]; if (last && last.role === c.role) last.parts = last.parts.concat(c.parts); else merged.push(c); });
      if (merged.length && merged[0].role === 'model') merged.unshift({ role: 'user', parts: [{ text: '(conversation start)' }] });
      var gen = { temperature: temperature, maxOutputTokens: maxTokens };
      if (opts.json && !opts.grounding) gen.responseMimeType = 'application/json';
      var body = { contents: merged, generationConfig: gen };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
      if (opts.grounding) body.tools = [{ google_search: {} }];
      return { url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) } };
    }
    var url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    var vision = provider !== 'groq' || PROVIDERS.groq.visionModels.indexOf(model) >= 0;
    var out = [];
    if (sys) out.push({ role: 'system', content: sys });
    msgs.forEach(function (m) {
      var imgs = vision ? (m.images || []) : [];
      if (imgs.length && m.role !== 'assistant') {
        var content = [{ type: 'text', text: m.text || 'See image.' }];
        imgs.forEach(function (img) { content.push({ type: 'image_url', image_url: { url: 'data:' + img.mime + ';base64,' + img.base64 } }); });
        out.push({ role: 'user', content: content });
      } else {
        var t = m.text || '';
        if ((m.images || []).length && !vision) t += '\n[An image was attached but this model has no vision.]';
        out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: t || '(empty)' });
      }
    });
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://leehizzbt.github.io/bizzle-command/'; headers['X-Title'] = 'Bizzle Command v4.20'; }
    var b = { model: model, messages: out, temperature: temperature, max_tokens: maxTokens };
    if (opts.json) b.response_format = { type: 'json_object' };
    if (provider === 'groq' && /gpt-oss/.test(model)) b.reasoning_effort = opts.effort === 'Max' ? 'high' : (opts.effort === 'Fast' ? 'low' : 'medium');
    return { url: url, init: { method: 'POST', headers: headers, body: JSON.stringify(b) } };
  }

  function parseResponse(provider, data) {
    if (provider === 'gemini') {
      var c = (data.candidates || [])[0];
      var text = c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.thought ? '' : (p.text || ''); }).join('') : '';
      if (!text && c && c.finishReason) text = '[No text returned: ' + c.finishReason + ']';
      var u = data.usageMetadata || {};
      var sources = [];
      var gm = c && c.groundingMetadata;
      if (gm && gm.groundingChunks) gm.groundingChunks.forEach(function (g) { if (g.web && g.web.uri) sources.push({ title: g.web.title || g.web.uri, url: g.web.uri }); });
      return { text: text, promptTokens: u.promptTokenCount || 0, completionTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), model: data.modelVersion, sources: sources,
        queries: gm && gm.webSearchQueries || [] };
    }
    var ch = (data.choices || [])[0];
    var t = ch && ch.message ? (typeof ch.message.content === 'string' ? ch.message.content : (ch.message.content || []).map(function (p) { return p.text || ''; }).join('')) : '';
    var us = data.usage || {};
    return { text: t || '', promptTokens: us.prompt_tokens || 0, completionTokens: us.completion_tokens || 0, model: data.model, sources: [] };
  }

  function friendlyError(status, provider, raw) {
    var msg = '';
    try { var j = JSON.parse(raw); msg = (j.error && (j.error.message || j.error)) || j.message || ''; } catch (e) { msg = (raw || '').slice(0, 200); }
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    var L = PROVIDERS[provider].label, hint = '';
    if (status === 400 && /api key|API_KEY/i.test(msg)) hint = 'Your ' + L + ' key looks invalid.';
    else if (status === 401 || status === 403) hint = 'The ' + L + ' key was rejected (' + status + '). Check it in Advanced AI Settings.';
    else if (status === 404) hint = 'That ' + L + ' model is not available for this key.';
    else if (status === 429) hint = L + ': free quota or rate limit hit (429).';
    else if (status >= 500) hint = L + ' is down or overloaded (' + status + ').';
    return (hint ? hint + ' ' : '') + (msg ? '— ' + msg.slice(0, 200) : '');
  }

  /* One provider, with its own model fallback chain. */
  function callProvider(provider, opts) {
    var key = opts.key || getKeys()[provider];
    var P = PROVIDERS[provider];
    var model = opts.model || modelFor(provider, opts.effort);
    if (!key) return Promise.reject(AIError('No ' + P.label + ' key on this device.', 0, provider, model, 'nokey'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(AIError('You are offline. AI needs an internet connection.', 0, provider, model, 'offline'));
    var tries = 0, retried = {};
    function attempt(m) {
      tries++;
      var req = buildRequest({ provider: provider, model: m, key: key, messages: opts.messages, system: opts.system, temperature: opts.temperature,
        maxTokens: opts.maxTokens, effort: opts.effort, json: opts.json, grounding: opts.grounding && provider === 'gemini' });
      if (opts.signal) req.init.signal = opts.signal;
      bump(provider, 'req');
      return fetch(req.url, req.init).then(function (r) {
        return r.text().then(function (raw) {
          if (!r.ok) {
            bump(provider, r.status === 429 ? 'rl' : 'err');
            var fb = opts.model ? null : (P.fallback || {})[m];
            if ((r.status === 429 || r.status === 503 || r.status === 404 || r.status === 500) && fb && tries < 4) { bump(provider, 'fb'); return attempt(fb); }
            if ((r.status === 503 || r.status === 500) && !retried[m]) { retried[m] = true; return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return attempt(m); }); }
            throw AIError(friendlyError(r.status, provider, raw), r.status, provider, m);
          }
          var data; try { data = JSON.parse(raw); } catch (e) { throw AIError(P.label + ' returned something that is not JSON (service problem).', 502, provider, m, 'down'); }
          var out = parseResponse(provider, data);
          if (!out.promptTokens && !out.completionTokens) { out.estimated = true; out.promptTokens = estTokens((opts.system || '') + (opts.messages || []).map(function (x) { return x.text || ''; }).join(' ')); out.completionTokens = estTokens(out.text); }
          bump(provider, 'tok', out.promptTokens + out.completionTokens);
          out.provider = provider; out.model = out.model || m; out.requestedModel = m;
          return out;
        });
      }, function (err) {
        if (err && err.name === 'AbortError') throw err;
        bump(provider, 'err');
        var off = typeof navigator !== 'undefined' && navigator.onLine === false;
        throw AIError(off ? 'You are offline. AI needs an internet connection.' : 'Could not reach ' + P.label + ' (network error, blocked, or the service is down).', 0, provider, m, off ? 'offline' : 'network');
      });
    }
    return attempt(model);
  }

  /* Main entry: tries providers in the chain order (auto-fallback) unless a provider is pinned.
     opts: {messages, system, effort, json, grounding, provider (pin), model (pin), temperature, maxTokens, signal}
     Returns {text, provider, model, sources, promptTokens, completionTokens, fallbacks:[...]} */
  function run(opts) {
    var st = getSettings(), keys = getKeys();
    var o = Object.assign({ temperature: st.temperature, maxTokens: st.maxTokens }, opts);
    if (st.systemPrompt && o.system !== undefined) o.system = o.system + '\n\n' + st.systemPrompt;
    var chain;
    if (o.provider) chain = [o.provider];
    else if (st.autoFallback) chain = st.chain.filter(function (p) { return PROVIDERS[p]; });
    else chain = [st.provider || 'gemini'];
    if (o.grounding) chain = ['gemini'].concat(chain.filter(function (p) { return p !== 'gemini'; }));
    var withKey = chain.filter(function (p) { return !!keys[p]; });
    if (!withKey.length) return Promise.reject(AIError('No AI key on this device yet. Open ⚙️ Advanced AI Settings and paste a free Gemini, Groq or OpenRouter key.', 0, chain[0], '', 'nokey'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(AIError('You are offline. AI features need an internet connection; your notes and saved data still work.', 0, chain[0], '', 'offline'));
    var notes = [], i = 0, lastErr = null;
    function next() {
      if (i >= withKey.length) {
        var e = lastErr || AIError('All AI providers failed.', 0, '', '', 'down');
        if (notes.length > 1) e.message = 'Every provider failed. ' + notes.join(' | ');
        return Promise.reject(e);
      }
      var p = withKey[i++];
      var po = Object.assign({}, o);
      if (o.provider) po.model = o.model || null;
      else po.model = (p === st.provider && st.model) ? st.model : null;
      return callProvider(p, po).then(function (out) { out.fallbacks = notes.slice(); return out; }, function (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e; notes.push(PROVIDERS[p].short + ': ' + (e.kind === 'ratelimit' ? 'rate-limited' : e.kind === 'down' ? 'down' : e.kind === 'badkey' ? 'key rejected' : e.kind === 'offline' ? 'offline' : e.kind));
        if (e.kind === 'offline') throw e;
        if (o.provider) throw e;
        if (i < withKey.length) bump(withKey[i], 'fb');
        return next();
      });
    }
    return next();
  }

  /* Gemini text-to-speech. Returns {buffer: ArrayBuffer (PCM16 mono or WAV), mime, sampleRate} */
  function tts(text, voice) {
    var key = getKeys().gemini;
    if (!key) return Promise.reject(AIError('AI voice needs a Gemini key (free) in Advanced AI Settings.', 0, 'gemini', '', 'nokey'));
    if (navigator.onLine === false) return Promise.reject(AIError('You are offline.', 0, 'gemini', '', 'offline'));
    var models = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];
    var idx = 0;
    function attempt() {
      var m = models[idx++];
      bump('gemini', 'req');
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } } } } })
      }).then(function (r) {
        return r.text().then(function (raw) {
          if (!r.ok) { bump('gemini', r.status === 429 ? 'rl' : 'err'); if (idx < models.length && (r.status === 429 || r.status === 404 || r.status >= 500)) return attempt(); throw AIError(friendlyError(r.status, 'gemini', raw), r.status, 'gemini', m); }
          var d = JSON.parse(raw); var part = (((d.candidates || [])[0] || {}).content || {}).parts || [];
          var inl = (part[0] || {}).inlineData || (part[0] || {}).inline_data;
          if (!inl) throw AIError('Gemini returned no audio.', 502, 'gemini', m, 'down');
          var bin = atob(inl.data), buf = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          var rate = +((/rate=(\d+)/.exec(inl.mimeType || inl.mime_type || '') || [])[1] || 24000);
          return { buffer: buf.buffer, mime: inl.mimeType || inl.mime_type, sampleRate: rate, model: m };
        });
      }, function () { throw AIError('Could not reach Gemini for the AI voice.', 0, 'gemini', m, 'network'); });
    }
    return attempt();
  }

  function listModels(provider) {
    var key = getKeys()[provider], P = PROVIDERS[provider];
    if (provider === 'openrouter') {
      return fetch('https://openrouter.ai/api/v1/models').then(function (r) { return r.json(); }).then(function (d) {
        return (d.data || []).filter(function (m) { return /:free$/.test(m.id) || m.id === 'openrouter/free'; }).map(function (m) { return { id: m.id }; });
      });
    }
    if (!key) return Promise.resolve(P.models.map(function (id) { return { id: id }; }));
    if (provider === 'gemini') {
      return fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }).then(function (r) { return r.json(); }).then(function (d) {
        return (d.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && !/tts|image|lyria|robotics|computer-use|transcribe|banana|live|audio|veo|embedding|aqa|research/.test(m.name); })
          .map(function (m) { return { id: m.name.replace(/^models\//, '') }; });
      });
    }
    return fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } }).then(function (r) { return r.json(); }).then(function (d) {
      return (d.data || []).filter(function (m) { return m.active !== false && !/whisper|guard|tts|orpheus/.test(m.id); }).map(function (m) { return { id: m.id }; });
    });
  }

  /* Pull the first JSON object/array out of a model reply (tolerates code fences and chatter). */
  function parseJSON(text) {
    var t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (e) {}
    var s = t.search(/[\[{]/); if (s < 0) return null;
    var open = t[s], close = open === '{' ? '}' : ']', depth = 0, inStr = false, esc = false;
    for (var i = s; i < t.length; i++) {
      var c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close) { depth--; if (!depth) { try { return JSON.parse(t.slice(s, i + 1)); } catch (e2) { return null; } } }
    }
    return null;
  }

  window.BCAI = { PROVIDERS: PROVIDERS, ORDER: ORDER, getKeys: getKeys, setKeys: setKeys, getSettings: getSettings, setSettings: setSettings,
    hasAnyKey: hasAnyKey, modelFor: modelFor, buildRequest: buildRequest, parseResponse: parseResponse, friendlyError: friendlyError,
    run: run, callProvider: callProvider, tts: tts, listModels: listModels, parseJSON: parseJSON, getUsage: getUsage, usageToday: usageToday, today: today, estTokens: estTokens };
})();
