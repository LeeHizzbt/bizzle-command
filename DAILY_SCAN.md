# Daily trend scan (optional, free GitHub Actions)

Trend Radar scans live from your browser. If you also want a scan that runs **every day even when your phone is off**, you can use GitHub Actions. It's free on public repos.

## What it does
`scripts/daily-scan.mjs` (Node 20, no dependencies) reads `scan-config.json` and:
- fetches Hacker News (Algolia API), Google News RSS (fetched directly, so no CORS reader is needed on a server) and dev.to,
- merges duplicates,
- writes `feed/trends.json`.

The workflow commits that file. In the app, open **Trend Radar → Daily feed**, paste the raw URL of the file and tap **Load feed into archive**.

## Setup (about 2 minutes)
1. Fork or copy this repo (it has to be public for free raw URLs).
2. Copy `templates/daily-scan.yml` to `.github/workflows/daily-scan.yml` and commit it.
   You need to do this yourself in the GitHub web UI or with a token that has the `workflow` scope. The build bot's token didn't have that scope, so the workflow ships as a template.
3. Edit `scan-config.json` to set your watch list (up to 10 terms).
4. Go to **Actions → Daily trend scan → Run workflow** to test it. After that it runs daily at 11:17 UTC (7:17 AM New York during EDT).
5. In the app, set the feed URL to
   `https://raw.githubusercontent.com/<you>/<repo>/main/feed/trends.json`

## Tested so far
- The script was run locally on Oct 15, 2026 (136 raw items → 128 after dedupe). The `feed/trends.json` in this repo comes from that run.
- The app's feed loader was tested against the live raw URL.
- The workflow file itself has **not** been run on GitHub yet, because it couldn't be installed without the `workflow` scope.

No API keys are needed. The scan uses only public, keyless endpoints.
