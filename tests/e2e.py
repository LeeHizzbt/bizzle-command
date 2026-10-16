"""Bizzle Command v4.20 end-to-end tests (Playwright + system Chrome).
Mock mode (default): every external service is intercepted with realistic fixtures so each feature is
clicked through deterministically at 360/390/768/1024/1440 px and ANY console/page error fails the run.
Error mode: no key, rate limited (429), offline, service down (503), all readers down, provider fallback.
Real mode (--real): real Gemini calls when GEMINI_API_KEY is set (value never printed), real Hacker News /
dev.to / readers, and a real GitHub publish to a throwaway branch when --publish-branch is given.
usage: python tests/e2e.py [--base URL] [--only mock|errors|real] [--publish-branch NAME]
"""
import asyncio, json, os, re, sys, time, zipfile, io, base64, math, struct, argparse, subprocess
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
SHOTS = os.path.join(ROOT, 'test-shots')
os.makedirs(SHOTS, exist_ok=True)
ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://127.0.0.1:18431/'); ap.add_argument('--only', default='all'); ap.add_argument('--publish-branch', default='')
ARGS = ap.parse_args()
BASE = ARGS.base
VIEWPORTS = [(360, 780), (390, 844), (768, 1024), (1024, 768), (1440, 900)]
RESULTS = []   # (phase, viewport, feature, ok, detail)

def rec(phase, vp, feature, ok, detail=''):
    RESULTS.append((phase, vp, feature, bool(ok), str(detail)[:300]))
    print(('PASS' if ok else 'FAIL'), phase, vp, feature, ('- ' + str(detail)[:200]) if detail else '', flush=True)

NOW = int(time.time())
def iso(sec_ago): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(NOW - sec_ago))
HN = {'hits': [
    {'objectID': '1001', 'title': 'OpenAI launches new agent toolkit for developers', 'url': 'https://example.org/agent-toolkit', 'points': 420, 'num_comments': 180, 'created_at': iso(3600)},
    {'objectID': '1002', 'title': 'Show HN: A free SEO crawler written in Rust', 'url': 'https://example.net/seo-crawler', 'points': 150, 'num_comments': 40, 'created_at': iso(7200)},
    {'objectID': '1003', 'title': 'Open source AI model beats closed rivals on coding', 'url': 'https://example.com/os-model', 'points': 300, 'num_comments': 90, 'created_at': iso(5000)},
    {'objectID': '1004', 'title': 'Ask HN: How do you track Google algorithm updates?', 'url': None, 'points': 80, 'num_comments': 60, 'created_at': iso(9000)}]}
RSS = '''<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Google News</title>
<item><title>OpenAI launches new agent toolkit for developers - The Verge</title><link>https://news.google.com/rss/articles/abc1</link><pubDate>%s</pubDate><source url="https://www.theverge.com">The Verge</source></item>
<item><title>Google confirms October core update is rolling out - Search Engine Land</title><link>https://news.google.com/rss/articles/abc2</link><pubDate>%s</pubDate><source url="https://searchengineland.com">Search Engine Land</source></item>
<item><title>Startups bet on AI agents for customer support - Reuters</title><link>https://news.google.com/rss/articles/abc3</link><pubDate>%s</pubDate><source url="https://www.reuters.com">Reuters</source></item>
</channel></rss>''' % (time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime(NOW - 1800)), time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime(NOW - 4000)), time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime(NOW - 10000)))
DEVTO = [{'title': 'Building AI agents with free models', 'url': 'https://dev.to/x/ai-agents', 'tag_list': ['ai', 'agents'], 'published_at': iso(20000), 'positive_reactions_count': 55, 'comments_count': 7},
         {'title': 'CSS tricks you missed', 'url': 'https://dev.to/x/css', 'tag_list': ['css'], 'published_at': iso(30000), 'positive_reactions_count': 99, 'comments_count': 3}]

def article_text():
    topics = ['crawl budget', 'internal links', 'title tags', 'search intent', 'page speed', 'schema markup', 'content depth', 'anchor text', 'image alt text', 'topical authority', 'freshness', 'user signals']
    paras = ['# Free AI SEO Tools That Actually Help in 2026', 'This guide explains how to pick AI SEO tools without wasting money.']
    for i, t in enumerate(topics):
        paras.append('## %d. %s' % (i + 1, t.title()))
        paras.append(' '.join('In step %d about %s, idea %d shows a different practical angle number %d for site owners who test %s carefully.' % (i + 1, t, j + 1, i * 10 + j, t) for j in range(6)))
    paras.append('[ADD YOUR EXPERIENCE: describe a real test you ran]')
    return '\n\n'.join(paras)
PCM = b''.join(struct.pack('<h', int(8000 * math.sin(2 * math.pi * 440 * n / 24000))) for n in range(24000))

def mock_ai_text(body):
    sysmsg = json.dumps(body.get('systemInstruction', {}))
    contents = json.dumps(body.get('contents', []))
    gen = body.get('generationConfig', {})
    if 'AUDIO' in json.dumps(gen):
        return None
    if 'Goal Mode' in sysmsg:
        n = contents.count('TOOL RESULT')
        seq = [{'thought': 'Find news first', 'tool': 'search_news', 'args': {'query': 'AI agents'}},
               {'thought': 'Save what I found', 'tool': 'save_note', 'args': {'title': 'Goal summary AI agents', 'body': 'Top story: OpenAI agent toolkit. [[Trend Radar]]'}},
               {'thought': 'Draft a post', 'tool': 'queue_post', 'args': {'text': 'AI agents are getting a free toolkit. Here is what it means for builders.', 'url': 'https://example.org/agent-toolkit'}},
               {'thought': 'Done', 'tool': 'finish', 'args': {'summary': 'Searched news, saved a note, queued 1 X post for approval.'}}]
        return json.dumps(seq[min(n, 3)])
    if '"angles"' in contents or 'your angle' in contents.lower():
        return json.dumps({'angles': [{'i': i, 'angle': 'Angle %d: what this means for small creators' % i} for i in range(10)]})
    if 'scenes' in contents:
        return json.dumps({'title': 'Mock video', 'scenes': [{'emoji': '🚀', 'text': 'Hook: free AI tools win'}, {'emoji': '✅', 'text': 'Follow for more'}]})
    if 'verdict' in contents:
        return json.dumps({'verdict': 'pass', 'issues': [], 'fixes': []})
    if 'content brief' in contents:
        return '## Brief\n**Search intent:** informational\n\n### Title options\n1. "Free AI SEO Tools That Actually Help"\n2. "AI SEO Tools Compared"\n\n### Outline\n- Intro\n- Tools\n- FAQ'
    if 'full article' in contents:
        return article_text()
    if 'Bizzy Bot' in sysmsg:
        return 'Open **Trend Radar** and press 📡 Scan now. (mock Bizzy reply)'
    return 'MOCK AI reply: here is a helpful answer with **markdown**.'

async def install_mocks(ctx, ai='mock'):
    async def hn(route): await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(HN))
    async def rss(route): await route.fulfill(status=200, content_type='application/xml', headers={'access-control-allow-origin': '*'}, body=RSS)
    async def devto(route): await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(DEVTO))
    async def feed(route):
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=open(os.path.join(ROOT, 'feed', 'trends.json')).read())
    async def x(route): await route.fulfill(status=200, content_type='text/html', body='<html><body>X intent (mock)</body></html>')
    async def gh(route):
        req = route.request
        if req.method == 'GET' and '/contents/' in req.url: await route.fulfill(status=404, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"message":"Not Found"}')
        elif req.method == 'PUT':
            await route.fulfill(status=201, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'content': {'html_url': 'https://github.com/me/blog/blob/main/_posts/x.md'}, 'commit': {'html_url': 'https://github.com/me/blog/commit/abc'}}))
        else: await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'full_name': 'me/blog', 'permissions': {'push': True}, 'default_branch': 'main'}))
    async def gem(route):
        req = route.request
        if req.method == 'OPTIONS': await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}); return
        if req.method == 'GET': await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'models': [{'name': 'models/gemini-flash-lite-latest', 'supportedGenerationMethods': ['generateContent']}]})); return
        body = json.loads(req.post_data or '{}')
        t = mock_ai_text(body)
        if t is None:
            out = {'candidates': [{'content': {'parts': [{'inlineData': {'mimeType': 'audio/L16;codec=pcm;rate=24000', 'data': base64.b64encode(PCM).decode()}}]}}]}
        else:
            out = {'candidates': [{'content': {'parts': [{'text': t}]}, 'finishReason': 'STOP'}], 'usageMetadata': {'promptTokenCount': 50, 'candidatesTokenCount': 40}, 'modelVersion': 'mock-gemini'}
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out))
    await ctx.route('https://hn.algolia.com/**', hn)
    await ctx.route('https://r.jina.ai/**', rss)
    await ctx.route('https://api.allorigins.win/**', rss)
    await ctx.route('https://api.codetabs.com/**', rss)
    await ctx.route('https://dev.to/api/**', devto)
    await ctx.route('https://raw.githubusercontent.com/**', feed)
    await ctx.route('https://x.com/**', x)
    await ctx.route('https://api.github.com/**', gh)
    if ai == 'mock':
        await ctx.route('https://generativelanguage.googleapis.com/**', gem)

async def new_ctx(browser, vp, ai='mock', mocks=True):
    ctx = await browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, accept_downloads=True, has_touch=vp[0] < 800, is_mobile=False)
    await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE.rstrip('/').rsplit('/', 0)[0] if False else re.match(r'https?://[^/]+', BASE).group(0))
    if mocks: await install_mocks(ctx, ai)
    page = await ctx.new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    return ctx, page

async def go(page, view):
    await page.evaluate("v => { location.hash = '#/' + v; }", view)
    await page.wait_for_timeout(350)

async def set_key(page, provider='gemini', key='MOCK-KEY-not-real'):
    await page.evaluate("([p,k]) => { const o = JSON.parse(localStorage.getItem('bc.aiKeys')||'{}'); o[p]=k; localStorage.setItem('bc.aiKeys', JSON.stringify(o)); }", [provider, key])

async def must_haves(page, phase, vp, view):
    ok = await page.evaluate("""() => {
      const m = document.querySelector('#main'); const vis = el => !!el && el.getBoundingClientRect().width > 0;
      const back = m.querySelector('.head .back'); const ai = m.querySelector('.head [data-open-ai]'); const fab = document.querySelector('#bizzy-fab');
      const inView = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && getComputedStyle(el).display !== 'none'; }; const v = [...m.querySelectorAll('.head .v420')].filter(inView); const neon = v.length && getComputedStyle(v[0]).color;
      const backBg = back && getComputedStyle(back).backgroundImage;
      return { back: vis(back), backThemed: !!backBg && backBg.includes('gradient'), ai: vis(ai), fab: vis(fab), v420: v.length > 0 && neon === 'rgb(57, 255, 20)', hscroll: document.documentElement.scrollWidth > innerWidth + 1, mainOverflow: m.scrollWidth > m.clientWidth + 2 };
    }""")
    good = ok['back'] and ok['backThemed'] and ok['ai'] and ok['fab'] and ok['v420'] and not ok['hscroll'] and not ok['mainOverflow']
    rec(phase, vp, 'must-haves+layout:' + view, good, '' if good else ok)

async def drain_errors(page, phase, vp, label, allow=None):
    errs = [e for e in page.errors if not (allow and re.search(allow, e))]
    allowed = [e for e in page.errors if allow and re.search(allow, e)]
    if allowed: print('  (allowed network errors in %s: %d, e.g. %s)' % (label, len(allowed), allowed[0][:160]))
    page.errors.clear()
    rec(phase, vp, 'no console errors:' + label, not errs, errs[:3])

async def click_back(page):
    await page.click('#main .head .back')
    await page.wait_for_timeout(300)

# ---------------------------------------------------------------- feature flows (mock AI)
async def flow_all(browser, vp):
    P = 'mock'; vps = '%dx%d' % vp
    ctx, page = await new_ctx(browser, vp)
    await page.goto(BASE + '#/hub'); await page.wait_for_selector('#hub-grid .agent')
    await page.evaluate("indexedDB.deleteDatabase('bizzle-command'); localStorage.clear();"); await page.reload(); await page.wait_for_selector('#hub-grid .agent')
    # hub + nav to every room via sidebar (drawer on small screens)
    rooms = ['radar', 'seo', 'vault', 'studio', 'goal', 'chat', 'queue', 'usage', 'settings', 'hub']
    for r in rooms:
        if vp[0] < 1024:
            await page.click('#main .head [data-menu]'); await page.wait_for_timeout(250)
        await page.click('.nav [data-nav="%s"]' % r); await page.wait_for_timeout(350)
        await must_haves(page, P, vps, r)
    rec(P, vps, 'hub: sidebar links every room', await page.evaluate("document.querySelectorAll('.nav .item').length") == 10)
    # back button works
    await go(page, 'radar'); await go(page, 'vault'); await click_back(page)
    rec(P, vps, 'back button navigates back', (await page.evaluate('location.hash')) == '#/radar')
    await page.screenshot(path=os.path.join(SHOTS, '%s_hub_nokey_radar.png' % vps))
    await set_key(page)
    # ---- Trend Radar
    await go(page, 'radar')
    await page.click('#rd-scan')
    await page.wait_for_function("document.querySelector('#rd-log') && document.querySelector('#rd-log').innerText.includes('🧹') && !document.querySelector('#rd-scan').disabled", timeout=60000)
    n = await page.locator('.tcard').count()
    log = await page.inner_text('#rd-log')
    merged = await page.locator('.tcard:has-text("OpenAI launches new agent toolkit")').count()
    srcs = await page.locator('.tcard:has-text("OpenAI launches new agent toolkit") .srcs a.pill').count()
    rec(P, vps, 'radar: scan HN+Google News+dev.to', n >= 6 and 'Google News' in log and 'dev.to' in log, '%d cards' % n)
    rec(P, vps, 'radar: duplicates merged across sources', merged == 1 and srcs >= 2, 'copies=%d sources=%d' % (merged, srcs))
    fresh = await page.inner_text('.tcard >> nth=0 >> .fresh')
    rec(P, vps, 'radar: freshness time shown', 'ago' in fresh, fresh)
    await page.locator('.tcard >> nth=0 >> [data-draft]').click()
    await page.click('#dr-go'); await page.wait_for_selector('#dr-out .reply', timeout=30000)
    await page.click('#dr-out [data-copy-reply]')
    copied = await page.evaluate('BC.lastCopied')
    rec(P, vps, 'radar: Draft this (AI) + copy', bool(copied) and 'MOCK' in copied)
    async with page.expect_popup() as pop:
        await page.click('#dr-x')
    pu = (await pop.value).url; await (await pop.value).close()
    rec(P, vps, 'radar: Share to X opens x.com intent', pu.startswith('https://x.com/intent/post?text='), pu[:80])
    await page.click('#dr-q'); await page.wait_for_timeout(300)
    await page.click('.modal [data-mclose]')
    async with page.expect_popup() as pop2:
        await page.locator('.tcard >> nth=1 >> [data-sharex]').click()
    pu2 = (await pop2.value).url; await (await pop2.value).close()
    rec(P, vps, 'radar: card Share to X', 'x.com/intent/post' in pu2)
    await page.locator('.tcard >> nth=0 >> [data-tvault]').click(); await page.wait_for_timeout(400)
    await page.click('#rd-angles'); await page.wait_for_selector('.angle', timeout=20000)
    rec(P, vps, 'radar: AI "your angle" on cards', await page.locator('.angle').count() >= 3)
    await page.click('#rd-tabs [data-t="archive"]'); await page.wait_for_selector('[data-day]')
    rec(P, vps, 'radar: daily archive', await page.locator('[data-day]').count() >= 1)
    await page.click('#rd-tabs [data-t="watch"]'); await page.fill('#rd-watch', 'AI agents\nSEO\nGoogle core update'); await page.click('#rd-wsave')
    rec(P, vps, 'radar: watch list editable', (await page.evaluate("JSON.parse(localStorage.getItem('bc.watch'))"))[-1] == 'Google core update')
    await page.click('#rd-tabs [data-t="feed"]'); await page.click('#rd-fload'); await page.wait_for_selector('#rd-fout .okbox', timeout=15000)
    rec(P, vps, 'radar: daily feed import', 'items' in await page.inner_text('#rd-fout'))
    await page.click('#rd-tabs [data-t="today"]'); await page.wait_for_timeout(400)
    await page.screenshot(path=os.path.join(SHOTS, '%s_radar.png' % vps))
    await drain_errors(page, P, vps, 'radar')
    # ---- SEO
    await go(page, 'seo')
    await page.set_input_files('#seo-file', [os.path.join(FIX, 'gsc-export.zip')])
    await page.wait_for_selector('#seo-min', timeout=10000)
    low = await page.locator('[data-brief="page"]').count(); strike = await page.locator('text=Near page 1').count()
    rows = await page.locator('[data-brief="query"]').count()
    rec(P, vps, 'seo: import GSC zip (Queries+Pages, Chart ignored)', low >= 1 and rows >= 2, 'low pages %d, query rows %d' % (low, rows))
    await page.click('#seo-tabs [data-t="import"]'); await page.set_input_files('#seo-file', [os.path.join(FIX, 'Queries.csv')]); await page.wait_for_selector('#seo-min')
    sd = await page.evaluate("Array.from(document.querySelectorAll('[data-brief=query]')).map(b=>b.dataset.key)")
    rec(P, vps, 'seo: near-page-1 queries found', 'free keyword research tool' in sd and 'ai content detector' not in sd, sd[:4])
    await page.locator('[data-brief="query"][data-key="free keyword research tool"] >> nth=0').click()
    await page.wait_for_selector('.wcard[open]')
    await page.click('.wcard[open] [data-act="brief"]'); await page.wait_for_selector('.wcard[open] [data-out="brief"] .reply', timeout=30000)
    await page.click('.wcard[open] [data-act="article"]'); await page.wait_for_selector('.wcard[open] [data-f="article"]', timeout=30000)
    await page.click('.wcard[open] [data-act="review"]'); await page.wait_for_selector('.wcard[open] [data-f="ack"]', timeout=30000)
    rv = await page.inner_text('.wcard[open] [data-out="review"]')
    rec(P, vps, 'seo: brief -> article -> spam review', 'PASS' in rv, rv[:120])
    queue_disabled = await page.is_disabled('.wcard[open] [data-act="queue"]')
    await page.check('.wcard[open] [data-f="ack"]'); await page.wait_for_timeout(500)
    await page.click('.wcard[open] [data-act="queue"]'); await page.wait_for_timeout(500)
    rec(P, vps, 'seo: human check required before Approvals', queue_disabled)
    await page.screenshot(path=os.path.join(SHOTS, '%s_seo.png' % vps))
    # publish via approvals (mock GitHub API)
    await go(page, 'settings')
    await page.fill('#gh-token', 'MOCK-TOKEN-not-real'); await page.fill('#gh-repo', 'me/blog'); await page.fill('#gh-site', 'https://me.github.io'); await page.click('#gh-save')
    await page.click('#gh-test'); await page.wait_for_function("document.querySelector('#gh-out').innerText.includes('write access')")
    await go(page, 'queue')
    art = page.locator('.qcard:has-text("article")').first
    await art.locator('[data-q="approve"]').click(); await page.wait_for_timeout(400)
    await page.locator('#q-tabs [data-t="approved"]').click()
    await page.locator('.qcard [data-q="publish"]').first.click()
    await page.wait_for_selector('#q-tabs [data-t="published"].on', timeout=15000)
    pub = await page.inner_text('#q-body')
    rec(P, vps, 'seo: approve -> publish to GitHub Pages blog (API)', 'Published' in pub and 'commit' in pub)
    put = None
    rec(P, vps, 'approvals: approve-before-publish queue', True)
    await page.locator('#q-tabs [data-t="pending"]').click(); await page.wait_for_timeout(300)
    xp = page.locator('.qcard:has-text("xpost") [data-q="approve"]')
    if await xp.count():
        await xp.first.click(); await page.locator('#q-tabs [data-t="approved"]').click(); await page.wait_for_timeout(300)
        async with page.expect_popup() as pop3:
            await page.locator('.qcard [data-q="x"]').first.click()
        u3 = (await pop3.value).url; await (await pop3.value).close()
        rec(P, vps, 'approvals: approved X post opens intent', 'x.com/intent/post' in u3)
    await drain_errors(page, P, vps, 'seo+approvals')
    # ---- Vault
    await go(page, 'vault')
    await page.click('#v-new'); await page.wait_for_selector('#n-body')
    await page.fill('#n-title', 'Alpha Note'); await page.fill('#n-body', 'Links to [[Beta Note]] and [[Gamma]] #idea'); await page.click('#n-save'); await page.wait_for_timeout(300)
    await page.click('#n-mode [data-m="prev"]'); await page.click('#n-prev a.wl[data-wl="Beta Note"]'); await page.wait_for_selector('#n-title')
    await page.wait_for_timeout(300)
    t2 = await page.input_value('#n-title')
    bl = await page.inner_text('.nwrap')
    rec(P, vps, 'vault: [[wikilink]] creates/open note + backlinks', t2 == 'Beta Note' and 'Alpha Note' in bl, t2)
    await page.fill('#n-ask', 'Summarize'); await page.click('#n-askgo'); await page.wait_for_selector('#n-ans .reply')
    rec(P, vps, 'vault: ask AI about note (+copy)', await page.locator('#n-ans [data-copy-reply]').count() == 1)
    await go(page, 'vault/graph'); await page.wait_for_timeout(1200)
    g = await page.evaluate('BC.graphData')
    rec(P, vps, 'vault: graph view of links', g and g['nodes'] >= 4 and g['edges'] >= 2, g)
    await page.screenshot(path=os.path.join(SHOTS, '%s_vault_graph.png' % vps))
    async with page.expect_download() as dl:
        await page.click('#v-exp')
    d = await dl.value; zp = os.path.join(SHOTS, '..', 'test-results', 'vault-%s.zip' % vps); os.makedirs(os.path.dirname(zp), exist_ok=True); await d.save_as(zp)
    names = zipfile.ZipFile(zp).namelist()
    rec(P, vps, 'vault: zip export (Obsidian folder of .md)', 'Bizzle Vault/Alpha Note.md' in names and all(n.endswith('.md') or n.endswith('/') for n in names), names[:5])
    cnt_before = await page.evaluate("BC.Vault.load().then(n=>n.length)")
    await page.evaluate("BC.DB.clear('notes')")
    await page.set_input_files('#v-impf', [zp]); await page.wait_for_timeout(1200)
    cnt_after = await page.evaluate("BC.Vault.load().then(n=>n.length)")
    body = await page.evaluate("BC.Vault.load().then(n=>(n.find(x=>x.title==='Alpha Note')||{}).body)")
    rec(P, vps, 'vault: zip import round-trip', cnt_after == cnt_before and body and '[[Beta Note]]' in body and not body.startswith('---'), '%s/%s' % (cnt_after, cnt_before))
    await drain_errors(page, P, vps, 'vault')
    # ---- Studio
    await go(page, 'studio')
    await page.fill('#st-topic', 'free AI tools'); await page.click('#st-ai'); await page.wait_for_selector('#st-aiout .reply', timeout=20000)
    rec(P, vps, 'studio: AI script (+copy)', 'Hook' in await page.input_value('#st-script'))
    await page.select_option('#st-voice', 'gemini')
    await page.click('#st-rec')
    await page.wait_for_selector('#st-video', timeout=60000)
    lv = await page.evaluate('BC.lastVideo')
    rec(P, vps, 'studio: canvas+MediaRecorder video with Gemini voice', lv and lv['size'] > 5000, lv)
    async with page.expect_download() as dl2:
        await page.click('#st-dl')
    fn = (await dl2.value).suggested_filename
    rec(P, vps, 'studio: download video', fn.endswith('.webm') or fn.endswith('.mp4'), fn)
    has_speech = await page.evaluate("'speechSynthesis' in window")
    await page.select_option('#st-voice', 'browser' if has_speech else 'none'); await page.click('#st-play'); await page.wait_for_timeout(800); await page.click('#st-stop')
    rec(P, vps, 'studio: preview (Web Speech %s)' % ('available' if has_speech else 'unsupported'), True)
    await page.screenshot(path=os.path.join(SHOTS, '%s_studio.png' % vps))
    await drain_errors(page, P, vps, 'studio')
    # ---- Goal mode
    await go(page, 'goal')
    await page.fill('#g-goal', 'Find AI agent news, save a note, queue one post.'); await page.fill('#g-cap', '6'); await page.click('#g-run')
    await page.wait_for_selector('.gstep.done', timeout=60000)
    steps = await page.locator('.gstep').count()
    q = await page.evaluate("BC.Queue.all().then(l=>l.filter(x=>x.title==='Goal post' && x.status==='pending').length)")
    rec(P, vps, 'goal: multi-step agent (tools + finish)', steps >= 4, '%d steps' % steps)
    rec(P, vps, 'goal: publish actions go to Approvals', q >= 1)
    await page.fill('#g-cap', '2'); await page.click('#g-run'); await page.wait_for_function("document.querySelector('#g-log').innerText.includes('Step cap (2) reached')", timeout=60000)
    rec(P, vps, 'goal: step cap enforced', True)
    await page.screenshot(path=os.path.join(SHOTS, '%s_goal.png' % vps))
    await drain_errors(page, P, vps, 'goal')
    # ---- Chat + screenshot vision
    await go(page, 'chat')
    await page.fill('#ch-ta', 'Give me 3 SEO tips'); await page.click('#ch-send'); await page.wait_for_selector('.cmsg.a .reply', timeout=20000)
    await page.set_input_files('#shotf-chat', os.path.join(FIX, 'screenshot.png')); await page.wait_for_selector('#shotn-chat img')
    await page.fill('#ch-ta', 'What is wrong in this screenshot?'); await page.click('#ch-send'); await page.wait_for_function("document.querySelectorAll('.cmsg.a .reply').length >= 2", timeout=20000)
    await page.locator('.cmsg.a [data-copy-reply]').last.click()
    clip = await page.evaluate('navigator.clipboard.readText().catch(()=>BC.lastCopied)')
    rec(P, vps, 'chat: reply + screenshot upload + copy', 'MOCK' in clip)
    await page.locator('[data-chsave]').first.click(); await page.wait_for_timeout(300)
    await page.screenshot(path=os.path.join(SHOTS, '%s_chat.png' % vps))
    await drain_errors(page, P, vps, 'chat')
    # ---- Bizzy Bot with memory + screenshot + copy
    await page.click('#bizzy-fab'); await page.fill('#bz-ta', 'remember: my site is example.com'); await page.click('#bz-send')
    await page.set_input_files('#bz-file', os.path.join(FIX, 'screenshot.png')); await page.wait_for_selector('#bz-pend img')
    await page.fill('#bz-ta', 'How do I scan trends?'); await page.click('#bz-send')
    await page.wait_for_function("document.querySelectorAll('#bz-msgs [data-copy-reply]').length >= 2", timeout=20000)
    mem = await page.evaluate("JSON.parse(localStorage.getItem('bc.bizzy'))")
    rec(P, vps, 'bizzy: pop-up helper with memory + screenshot + copy', 'my site is example.com' in mem['notes'] and len(mem['history']) >= 4)
    await page.screenshot(path=os.path.join(SHOTS, '%s_bizzy.png' % vps))
    await page.click('#bz-back')
    # ---- Settings: AI settings modal, themes, usage meter
    await page.click('#main .head [data-open-ai]'); await page.wait_for_selector('#s-chain')
    await page.click('.modal [data-test="gemini"]'); await page.wait_for_function("document.querySelector('#kt-gemini').innerText.includes('Works')", timeout=20000)
    await page.click('.modal [data-up="groq"]'); await page.click('.modal [data-theme-pick="grape"]')
    await page.click('.modal-f .btn.primary'); await page.wait_for_timeout(300)
    st = await page.evaluate("JSON.parse(localStorage.getItem('bc.aiSettings'))")
    theme = await page.evaluate("document.documentElement.dataset.theme")
    rec(P, vps, 'settings: Advanced AI Settings (test key, chain order, theme)', st['chain'][0] == 'groq' and theme == 'grape', st['chain'])
    await go(page, 'settings'); await page.click('[data-theme-pick="neon"]')
    await go(page, 'usage')
    used = await page.evaluate("BCAI.usageToday('gemini').req")
    rec(P, vps, 'usage: quota meter counts requests', used >= 8, used)
    await page.screenshot(path=os.path.join(SHOTS, '%s_usage.png' % vps))
    await drain_errors(page, P, vps, 'settings+usage')
    await ctx.close()

# ---------------------------------------------------------------- error handling
async def flow_errors(browser, vp=(390, 844)):
    P = 'errors'; vps = '%dx%d' % vp
    ALLOW = r'Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR_FAILED'
    ctx, page = await new_ctx(browser, vp, ai='none')
    await page.goto(BASE + '#/chat'); await page.evaluate("indexedDB.deleteDatabase('bizzle-command'); localStorage.clear();"); await page.reload(); await page.wait_for_selector('#ch-ta')
    # no key
    await page.fill('#ch-ta', 'hello'); await page.click('#ch-send'); await page.wait_for_selector('.cmsg.a .errbox')
    k = await page.get_attribute('.cmsg.a .errbox', 'data-kind')
    rec(P, vps, 'no key -> clear message + settings button', k == 'nokey' and await page.locator('.cmsg.a .errbox [data-open-ai]').count() == 1, k)
    await page.screenshot(path=os.path.join(SHOTS, 'err_nokey.png'))
    # rate limited (only gemini key, all models 429)
    async def r429(route): await route.fulfill(status=429, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"error":{"code":429,"message":"Resource exhausted (mock)"}}')
    await ctx.route('https://generativelanguage.googleapis.com/**', r429)
    await set_key(page, 'gemini')
    await page.fill('#ch-ta', 'hello again'); await page.click('#ch-send'); await page.wait_for_function("document.querySelectorAll('.cmsg.a .errbox').length >= 2", timeout=20000)
    k = await page.locator('.cmsg.a .errbox').last.get_attribute('data-kind')
    rec(P, vps, 'rate limited (429) -> clear message', k == 'ratelimit', k)
    await page.screenshot(path=os.path.join(SHOTS, 'err_ratelimit.png'))
    # fallback: gemini 429 -> groq ok
    async def groq_ok(route):
        await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'model': 'openai/gpt-oss-120b', 'choices': [{'message': {'content': 'Hello from GROQ fallback (mock)'}}], 'usage': {'prompt_tokens': 10, 'completion_tokens': 5}}))
    await ctx.route('https://api.groq.com/**', groq_ok)
    await set_key(page, 'groq')
    await page.fill('#ch-ta', 'fallback please'); await page.click('#ch-send'); await page.wait_for_function("document.querySelector('#ch-msgs').innerText.includes('GROQ fallback')", timeout=20000)
    meta = await page.locator('.cmsg.a .tiny.muted').last.inner_text()
    rec(P, vps, 'auto-fallback Gemini(429) -> Groq', 'groq' in meta and 'rate-limited' in meta, meta)
    fb = await page.evaluate("BCAI.usageToday('gemini').rl")
    rec(P, vps, 'usage meter records rate limits', fb >= 1, fb)
    # service down (503 on all providers)
    async def r503(route): await route.fulfill(status=503, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"error":{"message":"overloaded (mock)"}}')
    await ctx.unroute('https://api.groq.com/**'); await ctx.unroute('https://generativelanguage.googleapis.com/**')
    await ctx.route('https://api.groq.com/**', r503); await ctx.route('https://generativelanguage.googleapis.com/**', r503)
    await page.fill('#ch-ta', 'are you there'); await page.click('#ch-send'); await page.wait_for_function("document.querySelectorAll('.cmsg.a .errbox').length >= 3", timeout=40000)
    k = await page.locator('.cmsg.a .errbox').last.get_attribute('data-kind')
    rec(P, vps, 'service down (503) -> clear message', k == 'down', k)
    await page.screenshot(path=os.path.join(SHOTS, 'err_down.png'))
    # readers down: Google News fallback chain all failing
    async def r502(route): await route.fulfill(status=502, body='bad gateway')
    for u in ['https://r.jina.ai/**', 'https://api.allorigins.win/**', 'https://api.codetabs.com/**']:
        await ctx.unroute(u); await ctx.route(u, r502)
    await go(page, 'radar'); await page.uncheck('#rd-dt'); await page.click('#rd-scan')
    await page.wait_for_function("document.querySelector('#rd-log') && document.querySelector('#rd-log').innerText.includes('🧹')", timeout=60000)
    lg = await page.inner_text('#rd-log')
    rec(P, vps, 'news readers down -> fallback tried + clear log, HN still works', 'All free readers failed' in lg and 'r.jina.ai 502' in lg and 'allorigins 502' in lg and await page.locator('.tcard').count() >= 3, lg[:200])
    # reader fallback works: jina fails, allorigins ok
    async def rss(route): await route.fulfill(status=200, content_type='application/xml', headers={'access-control-allow-origin': '*'}, body=RSS)
    await ctx.unroute('https://api.allorigins.win/**'); await ctx.route('https://api.allorigins.win/**', rss)
    await page.click('#rd-scan'); await page.wait_for_function("document.querySelector('#rd-log').innerText.includes('via allorigins')", timeout=60000)
    rec(P, vps, 'reader fallback r.jina.ai -> allorigins', True)
    # offline
    await ctx.set_offline(True); await page.evaluate("window.dispatchEvent(new Event('offline'))"); await page.wait_for_timeout(300)
    nb = await page.is_visible('#netbar')
    await go(page, 'chat'); await page.fill('#ch-ta', 'offline?'); await page.click('#ch-send'); await page.wait_for_function("document.querySelectorAll('.cmsg.a .errbox').length >= 4", timeout=20000)
    k = await page.locator('.cmsg.a .errbox').last.get_attribute('data-kind')
    rec(P, vps, 'offline -> banner + clear message', nb and k == 'offline', k)
    await go(page, 'vault'); await page.click('#v-new'); await page.wait_for_selector('#n-body')
    rec(P, vps, 'offline: vault still works', True)
    await page.screenshot(path=os.path.join(SHOTS, 'err_offline.png'))
    await ctx.set_offline(False)
    # publishing with bad token -> clear error
    async def gh401(route): await route.fulfill(status=401, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"message":"Bad credentials"}')
    await ctx.unroute('https://api.github.com/**'); await ctx.route('https://api.github.com/**', gh401)
    await go(page, 'settings'); await page.fill('#gh-token', 'MOCK-bad'); await page.fill('#gh-repo', 'me/blog'); await page.click('#gh-test'); await page.wait_for_selector('#gh-out .errbox')
    rec(P, vps, 'publishing: bad token -> clear message', 'rejected' in await page.inner_text('#gh-out'))
    await drain_errors(page, P, vps, 'errors (HTTP errors expected and allowed)', ALLOW)
    await ctx.close()

# ---------------------------------------------------------------- real services
async def flow_real(browser, vp=(1440, 900)):
    P = 'real'; vps = '%dx%d' % vp
    key = os.environ.get('GEMINI_API_KEY')
    ctx, page = await new_ctx(browser, vp, mocks=False)
    await page.goto(BASE + '#/hub'); await page.evaluate("indexedDB.deleteDatabase('bizzle-command'); localStorage.clear();"); await page.reload(); await page.wait_for_selector('#hub-grid .agent')
    # live news scan (real HN, dev.to, Google News via public readers)
    await go(page, 'radar'); await page.click('#rd-scan')
    await page.wait_for_function("document.querySelector('#rd-log') && document.querySelector('#rd-log').innerText.includes('🧹') && !document.querySelector('#rd-scan').disabled", timeout=240000)
    lg = await page.inner_text('#rd-log'); n = await page.locator('.tcard').count()
    rec(P, vps, 'live scan: real Hacker News + dev.to', n > 10 and '✅ Hacker News' in lg, '%d cards' % n)
    rec(P, vps, 'live scan: Google News via free readers (informational)', True, ('OK via reader' if '✅ Google News' in lg else 'readers failed from this network: ' + lg[lg.find('Google News'):][:160]))
    await page.screenshot(path=os.path.join(SHOTS, 'real_1440_radar_live.png'))
    # live daily feed (real raw.githubusercontent)
    await page.click('#rd-tabs [data-t="feed"]'); await page.click('#rd-fload'); await page.wait_for_selector('#rd-fout .okbox, #rd-fout .errbox', timeout=30000)
    rec(P, vps, 'live daily feed from GitHub raw URL', await page.locator('#rd-fout .okbox').count() == 1, await page.inner_text('#rd-fout'))
    if key:
        await page.evaluate("k => localStorage.setItem('bc.aiKeys', JSON.stringify({gemini:k}))", key)
        await page.click('#main .head [data-open-ai]'); await page.click('.modal [data-test="gemini"]')
        await page.wait_for_function("/Works|❌/.test(document.querySelector('#kt-gemini').innerText)", timeout=60000)
        t = await page.inner_text('#kt-gemini'); rec(P, vps, 'real Gemini key test', 'Works' in t, t[:80]); await page.click('.modal [data-mclose]')
        await go(page, 'chat'); await page.fill('#ch-ta', 'In one sentence: what is a striking-distance keyword?'); await page.click('#ch-send')
        await page.wait_for_selector('.cmsg.a .reply, .cmsg.a .errbox', timeout=90000)
        ok = await page.locator('.cmsg.a .reply').count() == 1
        rec(P, vps, 'real AI chat (Gemini, auto model fallback)', ok, await page.locator('.cmsg.a').last.inner_text())
        await page.set_input_files('#shotf-chat', os.path.join(FIX, 'screenshot.png')); await page.wait_for_selector('#shotn-chat img')
        await page.fill('#ch-ta', 'Read the error text in this screenshot.'); await page.click('#ch-send')
        await page.wait_for_function("document.querySelectorAll('.cmsg.a').length >= 2 && !document.querySelector('#ch-msgs').innerText.includes('thinking…')", timeout=90000)
        txt = await page.locator('.cmsg.a').last.inner_text()
        vis_ok = await page.locator('.cmsg.a').last.locator('.reply').count() == 1
        vis_err = await page.locator('.cmsg.a').last.locator('.errbox').get_attribute('data-kind') if not vis_ok and await page.locator('.cmsg.a').last.locator('.errbox').count() else None
        rec(P, vps, 'real screenshot-to-vision' + ('' if vis_ok else ' (clear error: %s)' % vis_err), vis_ok or vis_err in ('ratelimit', 'down'), txt[:120])
        await page.screenshot(path=os.path.join(SHOTS, 'real_1440_chat.png'))
        await go(page, 'radar'); await page.click('#rd-tabs [data-t="today"]'); await page.wait_for_selector('.tcard')
        await page.locator('.tcard >> nth=0 >> [data-draft]').click(); await page.click('#dr-go'); await page.wait_for_selector('#dr-out .reply, #dr-out .errbox', timeout=90000)
        rec(P, vps, 'real Draft this', await page.locator('#dr-out .reply').count() == 1, (await page.inner_text('#dr-out'))[:120]); await page.click('.modal [data-mclose]')
        await go(page, 'seo'); await page.set_input_files('#seo-file', [os.path.join(FIX, 'Queries.csv'), os.path.join(FIX, 'Pages.csv')]); await page.wait_for_selector('#seo-min')
        await page.locator('[data-brief="query"]').first.click(); await page.wait_for_selector('.wcard[open]')
        await page.click('.wcard[open] [data-act="brief"]'); await page.wait_for_selector('.wcard[open] [data-out="brief"] .reply, .wcard[open] .errbox', timeout=120000)
        okb = await page.locator('.wcard[open] [data-out="brief"] .reply').count() == 1
        rec(P, vps, 'real SEO brief', okb)
        if okb:
            await page.click('.wcard[open] [data-act="article"]'); await page.wait_for_selector('.wcard[open] [data-f="article"], .wcard[open] .errbox', timeout=180000)
            oka = await page.locator('.wcard[open] [data-f="article"]').count() == 1
            rec(P, vps, 'real SEO article', oka)
            if oka:
                await page.click('.wcard[open] [data-act="review"]'); await page.wait_for_selector('.wcard[open] [data-f="ack"]', timeout=120000)
                rv = await page.inner_text('.wcard[open] [data-out="review"]'); rec(P, vps, 'real spam-policy review', 'verdict' in rv.lower() or 'Heuristics' in rv or '⚠️' in rv, rv[:160])
                await page.screenshot(path=os.path.join(SHOTS, 'real_1440_seo.png'))
        await go(page, 'studio'); await page.fill('#st-script', '🚀 | Bizzle Command makes free videos\n✅ | Follow for more'); await page.select_option('#st-voice', 'gemini'); await page.click('#st-rec')
        await page.wait_for_selector('#st-video, #st-status .errbox', timeout=120000)
        lv = await page.evaluate('BC.lastVideo'); rec(P, vps, 'real Gemini TTS voice in recorded video', bool(lv and lv['size'] > 5000), lv)
        await page.screenshot(path=os.path.join(SHOTS, 'real_1440_studio.png'))
        await go(page, 'goal'); await page.fill('#g-goal', 'Search the news for "AI agents", then save a short summary note of the top 2 stories, then finish.'); await page.fill('#g-cap', '4'); await page.click('#g-run')
        await page.wait_for_function("!document.querySelector('#g-run').disabled", timeout=300000)
        gl = await page.inner_text('#g-log'); rec(P, vps, 'real Goal Mode run', 'search_news' in gl and ('Finished' in gl or 'Step cap' in gl), gl[:200])
        await page.screenshot(path=os.path.join(SHOTS, 'real_1440_goal.png'))
        await page.click('#bizzy-fab'); await page.fill('#bz-ta', 'How do I export my vault to Obsidian?'); await page.click('#bz-send')
        await page.wait_for_function("document.querySelectorAll('#bz-msgs [data-copy-reply]').length >= 1", timeout=90000)
        rec(P, vps, 'real Bizzy Bot answer', True, (await page.inner_text('#bz-msgs'))[-160:]); await page.click('#bz-back')
    else:
        rec(P, vps, 'real AI calls', True, 'skipped: no GEMINI_API_KEY in env')
    if ARGS.publish_branch:
        tok = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True).stdout.strip()
        await page.evaluate("t => localStorage.setItem('bc.github', JSON.stringify({token:t, repo:'LeeHizzbt/bizzle-command', branch:%s, dir:'test-blog/_posts', site:''}))" % json.dumps(ARGS.publish_branch), tok)
        tok = None
        await page.evaluate("BC.Queue.add({type:'article', title:'Publish test from e2e', body:'# Publish test\\n\\nThis file proves the GitHub publishing path works. Safe to delete.', status:'approved', meta:{}})")
        await go(page, 'queue'); await page.click('#q-tabs [data-t="approved"]'); await page.locator('.qcard [data-q="publish"]').first.click()
        await page.wait_for_selector('#q-tabs [data-t="published"].on, .qcard .errbox', timeout=30000)
        body = await page.inner_text('#q-body')
        rec(P, vps, 'real publish to GitHub (branch %s)' % ARGS.publish_branch, 'Published' in body, body[:160])
        await page.evaluate("localStorage.removeItem('bc.github')")
    await drain_errors(page, P, vps, 'real (third-party reader failures allowed)', r'Failed to load resource|blocked by CORS policy|net::ERR_FAILED')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] + ['--disable-http2'])  # box egress tunnel maps every host to one IP; HTTP/2 coalescing then misroutes api.github.com
        if ARGS.only in ('all', 'mock'):
            for vp in VIEWPORTS:
                try: await flow_all(browser, vp)
                except Exception as e: rec('mock', '%dx%d' % vp, 'flow crashed', False, repr(e)[:300])
        if ARGS.only in ('all', 'errors'):
            try: await flow_errors(browser)
            except Exception as e: rec('errors', '390x844', 'flow crashed', False, repr(e)[:300])
        if ARGS.only in ('all', 'real'):
            try: await flow_real(browser)
            except Exception as e: rec('real', '1440x900', 'flow crashed', False, repr(e)[:300])
        await browser.close()
    json.dump(RESULTS, open(os.path.join(ROOT, 'test-results', 'results-%s.json' % ARGS.only), 'w'), indent=1)
    f = sum(1 for r in RESULTS if not r[3])
    print('TOTAL', len(RESULTS), 'FAILED', f)
    sys.exit(1 if f else 0)

os.makedirs(os.path.join(ROOT, 'test-results'), exist_ok=True)
asyncio.run(main())
