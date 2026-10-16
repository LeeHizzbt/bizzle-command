# Bizzle Command v4.20: test report

- **Build:** `2026-10-15.2207`. Run on 2026-10-15 (America/New_York).
- **Runner:** `tests/e2e.py`, using Playwright (Python) with system Chrome at `/usr/bin/google-chrome` and `--no-sandbox`, against a local static server of `docs/`.
- **Rule:** any console error or uncaught page error fails the run. The only exception is the error and real phases, where expected HTTP failures such as `Failed to load resource` are allowed and listed.

## Summary
| Phase | Viewport | Pass | Fail |
|---|---|---|---|
| Feature walk-through (mocked services) | 360×780 | 52 | 0 |
| Feature walk-through (mocked services) | 390×844 | 52 | 0 |
| Feature walk-through (mocked services) | 768×1024 | 52 | 0 |
| Feature walk-through (mocked services) | 1024×768 | 52 | 0 |
| Feature walk-through (mocked services) | 1440×900 | 52 | 0 |
| Error handling | 390×844 | 11 | 0 |
| Real services (live HN/dev.to/feed, real Gemini key from env) | 1440×900 | 14 | 0 |
| Real GitHub publish to the `publish-test` branch (update-existing path) | 1440×900 | 6 | 0 |
| **Total** | | **291** | **0** |

## What each viewport run clicks through (52 checks)
- **Every room** (hub, radar, seo, vault, studio, goal, chat, approvals, usage, settings) is opened from the sidebar, or from the ☰ drawer under 1024 px. In every view the run checks the themed (gradient) back button, the ⚙️ Advanced AI Settings button, the Bizzy Bot button and a visible neon `v4.20` (rgb 57,255,20) in the header. It also checks that nothing scrolls sideways. That makes 10 checks.
- **Navigation:** the back button navigates back.
- **Trend Radar:** a scan across HN, Google News and dev.to; duplicates merged across sources (1 card, 3 source links); the freshness time; Draft this (AI) and copy; Share to X (`x.com/intent/post`) from the draft and from a card; AI "your angle"; the daily archive; an editable watch list; the daily feed import.
- **SEO:** importing a GSC zip (Queries + Pages, with the Chart CSV ignored); finding near-page-1 queries; the low-CTR page list; brief → article → spam-policy review; the human check that has to be ticked before anything can go to Approvals; approve → publish to a GitHub Pages blog through the Contents API (mocked here, and real below).
- **Approvals:** the approve-before-publish queue. An approved X post opens the intent link.
- **Memory Vault:** `[[wikilink]]` opens or creates a note and shows backlinks; asking AI about a note, with a copy button; the graph view (4 nodes, 2 edges); Obsidian zip export (a folder of .md files); zip import round-trip.
- **Studio:** AI script; canvas + MediaRecorder video with a Gemini TTS voice mixed in; .webm download; Web Speech preview.
- **Goal Mode:** a 4-step tool run that finishes; the publish action lands in Approvals; the step cap is enforced (cap 2).
- **Chat:** reply + screenshot upload (vision) + copy on every reply + save to vault.
- **Bizzy Bot:** the pop-up remembers `remember: …`, takes a screenshot upload, and has a copy button.
- **Settings:** the Advanced AI Settings modal (key test, fallback chain order, AI colour theme); the usage meter counts requests.
- **Console errors:** a no-console-errors check after each section (7).

## Error handling (390×844)
No key → clear message + Settings button · Gemini 429 → "rate limited" · auto-fallback Gemini (429) → Groq, with the fallback shown on the reply · the usage meter records rate limits · all providers 503 → "service down" · all news readers down → the log names each reader's failure, and HN still works · reader fallback r.jina.ai → allorigins · offline → banner + "offline" message, while the vault still works · bad GitHub token → "rejected" message.

## Real services (no mocks)
- Live Hacker News + dev.to scan returned 83 cards. Google News readers failed from the box network (r.jina.ai 401, allorigins/codetabs timeouts). The app logged this clearly and carried on.
- Live daily feed from `raw.githubusercontent.com` returned 128 items.
- Real Gemini: the key test, chat, Draft this, SEO brief → article → spam review (the AI reviewer correctly flagged the unfilled `[ADD YOUR EXPERIENCE]` placeholder), Gemini TTS mixed into a 4 s, 753 KB .webm, a Goal Mode run (search_news → save_note) and a Bizzy Bot answer all worked.
- Screenshot vision: the free tier returned 429 during the run, and the app showed a clear "rate limited" error. Vision works in the mocked runs, and the request format is the standard Gemini `inlineData`.
- Real GitHub publish through the app's own code to `LeeHizzbt/bizzle-command@publish-test` worked. The file already existed, so the 422 → fetch sha → update path was exercised too (commit at 2026-10-15 22:04 EDT).

## Not covered automatically
- Google OAuth for Search Console needs the owner's own OAuth client ID and a Google sign-in, so it was not run. CSV/zip import is the tested path.
- Groq and OpenRouter were tested with mocked responses only, because no keys were in the env.
- Logs from this run are in `test-results/` (git-ignored). Screenshots are in `test-shots/`.
