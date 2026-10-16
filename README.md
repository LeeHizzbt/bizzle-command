# Bizzle Command v4.20

A free, bring-your-own-key AI command center that runs entirely in your browser (installable PWA) or as an Android app.

**Live:** https://leehizzbt.github.io/bizzle-command/

## Rooms
| Room | What it really does |
|---|---|
| 🛰️ Command Hub | Sidebar/hub linking every room. Shows status, a usage meter and quick actions. |
| 📡 Trend Radar | Live scan of Hacker News (Algolia API), dev.to and Google News RSS (through public CORS readers, with automatic fallback). Optional Gemini Google-Search grounding. Duplicates merged; each card shows its source links and how fresh it is. Daily archive, editable watch list, **Draft this** (AI X post / thread / LinkedIn / outline) and **Share to X** (x.com intent). |
| 🔎 SEO Pipeline | Import Search Console CSVs or the zip export, or connect Google with **your own** OAuth client ID. Finds pages with high impressions and low CTR, plus queries ranking just off page 1. Then: AI brief → AI article → spam-policy review (heuristics + AI) → approval queue. |
| ✅ Approvals | Nothing is published without your approval. Approved articles can go to your GitHub Pages / Jekyll blog through the GitHub Contents API, using an optional fine-grained token entered in Settings. You can also download them as .md, copy the HTML, or share to X. |
| 🧠 Memory Vault | Markdown notes with `[[wikilinks]]`, #tags and backlinks, plus a force-directed graph view. Obsidian-compatible zip export/import. |
| 🎬 Studio | Makes short videos in the browser (canvas + MediaRecorder → .webm download) in 9:16, 1:1 or 16:9. Voiceover can be Gemini TTS (mixed into the file) or a browser voice preview. |
| 🎯 Goal Mode | Multi-step agent (search news, read a URL, search/save vault notes) with a step cap of 1–12. Anything it wants to publish goes to Approvals. |
| 💬 AI Chat | Chat with a screenshot upload, a web-search toggle and a copy button on every reply. |
| 📊 Usage & Quota | Per-provider daily meter and auto-fallback chain. |

**In every view:** a themed back button, a copy button on each AI reply, screenshot upload, the ⚙️ Advanced AI Settings button, 6 AI colour themes, the **Bizzy Bot** pop-up helper (it remembers things: say `remember: …`), and clear errors for no key / rate limited / offline / service down.

## AI: bring your own free key
- **Gemini** (default): free key from Google AI Studio. Models fall back pro → flash → flash-lite → Gemma.
- **Groq**: free key, OpenAI-compatible.
- **OpenRouter**: `:free` models only.

Keys are stored **only on your device** (localStorage). They are sent only to the provider you chose and never to any Bizzle server; there isn't one. When a provider is rate limited or down, auto-fallback tries the next provider in your chain.

## Privacy
Everything (notes, trends, queue, chats) lives in your browser's IndexedDB. Use **Settings → Backup** to export it.

## Daily scan
Optional free GitHub Actions scan: see [DAILY_SCAN.md](DAILY_SCAN.md).

## Android
Capacitor 7 wrapper (`com.nunyabizz.command`, 4.20.0, minSdk 23).
**Direct download:** https://github.com/LeeHizzbt/bizzle-command/releases/download/command-v4.20/BizzleCommand-v4.20.apk
SHA-256 `16e052f14a1b85311012c0c2b26e4eb3a38840a3c51fde5b2418dcd4ad8ab669` (signed v1+v2, checked with `apksigner verify`).
To build it yourself: `npm ci && npx cap sync android && cd android && ./gradlew assembleRelease`, with your own keystore in `keystore/keystore.properties` (git-ignored).

## Limits (honest)
- Public CORS readers (r.jina.ai, allorigins, codetabs) are free and sometimes flaky. Google News may be skipped on a given scan; HN and dev.to don't need them.
- Gemini grounding uses a separate, small free quota and may return "rate limited".
- A browser (Web Speech) voice can't be recorded into the video file; only Gemini TTS is mixed in.
- X posting uses the x.com share intent (no API).
- Google Search Console sign-in needs your own OAuth client ID and works on the web build only. CSV import works everywhere.
- The usage meter estimates usage on this device; it isn't the provider's official quota.

## Tests
See [TEST_REPORT.md](TEST_REPORT.md) (`python tests/e2e.py`).

## Credits
- [JSZip](https://stuk.github.io/jszip/) v3.10.2, used under the MIT license (`docs/vendor/jszip-LICENSE.md`).
- Inspired by the general idea of AI "agent dashboards". No third-party code or assets were copied apart from JSZip.

MIT © Nunya Bizz
