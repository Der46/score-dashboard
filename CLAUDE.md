# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static, build-free dashboard (GitHub Pages, installable PWA) showing weekly / monthly scores for a game team. UI copy, comments and commit-facing docs are in Traditional Chinese; the UI also ships English and Vietnamese.

Live site: https://der46.github.io/score-dashboard/ — pushing to `main` deploys it.

## Commands

There is no bundler, package.json or linter. The page loads CSV with `fetch`, so it must be served over HTTP:

```bash
python -m http.server 8000          # then open http://localhost:8000
```

Tests (Python `unittest`, no extra deps beyond `requirements.txt`):

```bash
python -m unittest discover -s tests                                   # all
python -m unittest tests.test_week_utils                               # one file
python -m unittest tests.test_week_utils.ResolveAutoWeekIdTest         # one class
```

Syntax checks that CI runs (`.github/workflows/test.yml`):

```bash
python -m py_compile scripts/*.py
node --check js/app.js && node --check js/icons.js && node --check sw.js && node --check tools/backfill-contribution.js
cp ScoreDashboardScript.gs /tmp/s.js && node --check /tmp/s.js        # Apps Script is plain JS
```

Running the sync pipeline locally (scripts import `week_utils` from their own folder, so run them as `python scripts/<name>.py` from the repo root):

```bash
pip install -r requirements.txt
INPUT_XLSX=work/2026-10-w3.xlsx OUTPUT_CSV=data/2026-10-w3.csv python scripts/convert_excel_to_csv.py
WEEK_ID=2026-10-w3 python scripts/update_weeks_csv.py
INPUT_WEEK_ID= python scripts/resolve_week.py        # prints week_id / fallback_week_id
```

## Architecture

### Data pipeline (Google Sheet → CSV → page)

`sync-google-sheet-week.yml` runs every 3 hours (cron `17 */3 * * *`):

1. `scripts/resolve_week.py` picks the week via `scripts/week_utils.py`. Week IDs are `yyyy-MM-wN`; week 1 starts on the month's first Monday, days before it belong to the previous month's last week. Auto mode switches to the new week only after **Wednesday 21:00 Asia/Taipei**, and then also outputs the previous week as `fallback_week_id`.
2. `scripts/download_google_sheet_week.py` finds the tab named exactly the week ID (Sheets API, key sent in the `x-goog-api-key` header) and downloads it via the public export URL — the sheet must be shared as "anyone with the link". Exit code **3** = tab not found.
3. `scripts/convert_excel_to_csv.py` writes `data/<week>.csv` atomically. Exit code **4** = no member rows (empty/template tab). On 3 or 4 the workflow retries with the fallback week instead of failing.
4. `scripts/update_weeks_csv.py` upserts `data/weeks.csv` (the index the page reads).
5. `data/updated-at.json` is rewritten **only when the scores changed**, so unchanged syncs make no commit / redeploy. The page labels it "資料最後更新" (data last updated), not "last synced".
6. Push uses `git pull --rebase -X theirs` with retries; bot commits are titled `Update weekly score data for <week>`.

`backfill-google-sheet-weeks.yml` (manual) re-downloads listed weeks or `all`, and fails at the end if any week failed. Both workflows share one concurrency group.

### Front end (`js/app.js`, single file, no framework)

- **Loading:** `initApp` fetches `i18n.json`, `updated-at.json`, `weeks.csv` and every weekly CSV in parallel (`cache: "no-cache"`). A week that fails to load goes into `state.failedWeeks`; `state.allWeeks` keeps the full order so "vs last week" can show "—" instead of skipping a gap.
- **Week model (`buildWeekModel`):** throws if `CM` / `LINE名稱` / `一週總分` are missing or there are no member rows. Exact duplicate rows (same CM + LINE) keep the regular-section row, then the higher score. Unparseable score cells count as 0 (invested/uninvested become null) and are reported in the notice. Contribution is recomputed from the team total including returning accounts; the CSV's contribution columns are ignored.
- **Member identity:** key is `cm:<cm>` (or `line:<line>` when CM is empty). `applyStableMemberKeys` switches a CM to `cm:<cm>|line:<line>` in **every** week if it is ever shared by different LINE names, so month aggregation, deltas and profiles stay joined across weeks.
- **Month model (`buildMonthModel`):** aggregates week models, memoised in `state.monthCache`; `getCurrentScope` caches table rows per `view:period` in `state.rowsCache`.
- **Rendering:** `renderAll` (period/view change) redraws notice, the "還差一點就合格" pending list, podium, watch list, stats and table; `renderTable` (search / filter / sort) redraws only the table. URL hash stores only `view` and `period`.
- **Text:** all UI strings go through `t("path")` from `i18n.json` (`zh-Hant` default, `en`, `vi`); add new keys to all three locales. `i18n.json` is CRLF with no trailing newline — a `json.dumps(..., ensure_ascii=False, indent=2)` round-trip with `\r\n` reproduces it exactly.
- **`sw.js`:** network-first for same-origin files (offline fallback to cache), cache-first for Google Fonts. Bump `CACHE_VERSION` when changing the strategy or `PRECACHE_URLS`; `tests/test_consistency.py` checks every precached file exists.

### Google Sheet side (`ScoreDashboardScript.gs`)

Apps Script for the sheet's 積分工具 menu (create week sheets, sort, sort the 成員名單 member list). It is **not deployed by CI** — changes must be pasted into the sheet's Apps Script editor by hand. `onEdit` re-sorts the week sheet under a document lock (falls back to an unlocked sort if `LockService` is unavailable).

### Shared rules

- Pass = weekly **invested** ≥ 200,000, Elder ≥ 500,000. These live in both `CONFIG` in `js/app.js` and `PASS_SCORE` / `ELDER_SCORE` in the `.gs`; `tests/test_consistency.py` fails if they differ.
- "Bottom eligible" (`isBottomEligible`) excludes returning accounts and captain / vice captains; the pending list and watch list use it.

## Product conventions

- **Reminder tone, no public low rankings.** Lists about members below the pass line show only the gap ("還差 X"), not scores, ranks or "bottom N"; don't add bottom-N columns/filters or numbered "worst" lists. The sheet status 淘汰 is displayed as 未達合格 in amber, not red. Don't add notes that call out which groups are excluded.
- `tools/backfill-contribution.js` is a one-off maintenance script that rewrites `data/*.csv` in place (keeps a `.bak`); the page no longer needs its output.
