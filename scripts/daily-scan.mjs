// Bizzle Command v4.20 daily trend scan for GitHub Actions (Node 20+, no dependencies).
// Reads scan-config.json, fetches Hacker News (Algolia API) + Google News RSS + dev.to,
// merges duplicates and writes feed/trends.json. The app's Trend Radar > Daily feed tab imports it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const cfg = JSON.parse(await readFile('scan-config.json', 'utf8').catch(() => '{}'));
const watch = (cfg.watch || ['AI agents', 'SEO', 'open source AI']).slice(0, 10);
const since = Math.floor(Date.now() / 1000) - 86400;
const STOP = new Set('a an the and or of to in on for with by at from is are was were be as it its this that how why what new into over after about vs via your you we our'.split(' '));
const log = [];

async function get(url, type = 'json') {
  const r = await fetch(url, { headers: { 'User-Agent': 'bizzle-command-daily-scan (+https://github.com/LeeHizzbt/bizzle-command)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
  return type === 'json' ? r.json() : r.text();
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function hn(term) {
  const url = term
    ? `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&query=${encodeURIComponent(term)}&numericFilters=created_at_i>${since}`
    : 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
  const d = await get(url);
  return (d.hits || []).filter((h) => h.title).map((h) => {
    const hnUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
    return { title: h.title, url: h.url || hnUrl, source: h.url ? host(h.url) : 'news.ycombinator.com', via: 'Hacker News', published: h.created_at, points: h.points || 0, comments: h.num_comments || 0, hn: hnUrl, term: term || 'HN front page' };
  });
}
async function gnews(term) {
  const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(term + ' when:1d')}&hl=en-US&gl=US&ceid=US:en`, 'text');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map((m) => {
    const tag = (n) => decode((m[1].match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1] || '');
    const pub = tag('pubDate');
    return { title: tag('title'), url: tag('link'), source: tag('source') || 'Google News', via: 'Google News', published: pub ? new Date(pub).toISOString() : null, term };
  }).filter((x) => x.title && x.url);
}
async function devto() {
  const d = await get('https://dev.to/api/articles?top=1&per_page=30');
  const words = watch.join(' ').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return d.filter((a) => words.some((w) => (a.title + ' ' + (a.tag_list || []).join(' ')).toLowerCase().includes(w)))
    .map((a) => ({ title: a.title, url: a.url, source: 'dev.to', via: 'dev.to API', published: a.published_at, points: a.positive_reactions_count, comments: a.comments_count, term: 'dev.to' }));
}
async function safe(name, p) { try { const x = await p; log.push(`ok ${name}: ${x.length}`); return x; } catch (e) { log.push(`FAIL ${name}: ${e.message}`); return []; } }

const lists = [await safe('HN front page', hn(''))];
for (const t of watch) lists.push(await safe(`HN "${t}"`, hn(t)));
for (const t of watch) lists.push(await safe(`Google News "${t}"`, gnews(t)));
lists.push(await safe('dev.to', devto()));
const all = lists.flat();

// merge duplicates: same URL or >= 50% title-word overlap
const toks = (t) => [...new Set(t.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)))];
const out = [];
for (const it of all) {
  const tk = toks(it.title);
  const hit = out.find((o) => o.url === it.url || (tk.length >= 3 && tk.filter((w) => o._t.includes(w)).length / new Set([...tk, ...o._t]).size >= 0.5));
  if (hit) { hit.points = Math.max(hit.points || 0, it.points || 0); hit.comments = Math.max(hit.comments || 0, it.comments || 0); if (!hit.hn && it.hn) hit.hn = it.hn; continue; }
  out.push({ ...it, _t: tk });
}
const items = out.map(({ _t, ...x }) => x).slice(0, 150);
const now = new Date();
const day = now.toLocaleDateString('en-CA', { timeZone: cfg.timeZone || 'America/New_York' });
await mkdir('feed', { recursive: true });
await writeFile('feed/trends.json', JSON.stringify({ app: 'Bizzle Command', version: '4.20', day, generatedAt: now.toISOString(), watch, raw: all.length, log, items }, null, 1));
console.log(log.join('\n'));
console.log(`${all.length} raw -> ${items.length} merged items for ${day}`);
if (!all.length) process.exit(1);
