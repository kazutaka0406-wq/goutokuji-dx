# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

豪徳寺 (Goutokuji Temple) Premium DX — a single-page web app providing a paid digital
pilgrimage/stamp-rally experience for visitors to Goutokuji Temple in Setagaya, Tokyo.
Visitors progress through 10 temple spots, each with photos, AI narration text, and a
history quiz; completing all 10 unlocks a digital Goshuin stamp sheet and a fortune
(omikuji) draw.

The entire application is **one static file: `index.html`** (~3850 lines: inline
`<style>` + inline `<script>`, no framework, no build step, no `node_modules`).

## Running / Deploying

There is no build, lint, or test command — this is plain HTML/CSS/JS served statically.

- **Local preview**: open `index.html` directly in a browser, or serve the directory
  with any static file server (e.g. `netlify dev`) since `/.netlify/functions/config`
  is called at runtime.
- **Hosting**: Netlify (primary — see `netlify.toml`, function at
  `netlify/functions/config.js`). A `firebase.json` also exists from an earlier
  Firebase Hosting setup but Netlify is the active target (see `公開URL.txt` for the
  live demo/production URLs).
- **Payment mode**: `netlify/functions/config.js` returns `paymentMode` from the
  `PAYMENT_MODE` env var (`"demo"` default or `"live"`). In demo mode, checkout is
  skipped/free; in live mode, Stripe checkout would be required (not yet wired up).

### Git branch / deploy workflow (from `コマンド/claudeへの依頼フォーマット.txt`)

- `main` = development branch (デバッグ用 Netlify site).
- `production` = live/commercial branch (商用 Netlify site).
- To promote main to production:
  ```
  git checkout production
  git merge main
  git push
  git checkout main
  ```
- Commit messages should be written in Japanese, describing the change.
- Don't push unless asked — when a request says「デプロイなし」, make the edits but do
  not commit/push; when it says「デプロイあり」, do `git add` / `commit` / `push` and
  report back the Japanese commit message used.

## Architecture (all inside `index.html`)

### Page flow (SPA via show/hide, no router)

All screens are `<section class="page" id="page-...">` elements; `showPage(id)` toggles
the `.active` class and runs per-page setup (slideshows, audio, content builders).

`PAGE_ORDER` defines the back-button sequence:
`page-lang-select → page-app-appeal → page-checkout → page-sync → page-manners →
page-welcome-map → page-full-map → page-quest → page-clear`

(`page-visual-intro`, `page-manner-gate`, `page-welcome`, `page-group-share` exist in
HTML but are not part of the active `PAGE_ORDER` flow.)

### Global state

```js
const state = {lang, group, visit, currentStep, rating, omikujiDraws,
                omikujiGroupSize, visitedSpots: Set, foundCats: []};
```
`currentStep` (0–9) indexes into the 10 quest spots. `localStorage` persists
`goutokuji_dx_lang`, `goutokuji_dx_page`, `goutokuji_dx_step` (cleared on every fresh
page load via `localStorage.clear()` in `DOMContentLoaded`).

### Internationalization — CRITICAL

**Every language has its own complete copy of the content.** Languages: `ja`
(Japanese, default), `en`, `zh`, `ko`. **Any content/copy/feature change must be
applied to all four languages**, or the non-Japanese UI will silently show stale or
missing text.

I18n is spread across several top-level objects keyed by language code:

- `CONFIG_LANG` (largest) — UI strings, manner items, omikuji results, map spot
  descriptions, and crucially `CONFIG_LANG[lang].steps[0..9]` — the 10 quest spots,
  each with `title`, `img`, `images[]`, `narrative`, `question`, `options[]`
  (with `correct: true/false`), `correctFb`, `wrongFb`.
- `SHOP_I18N`, `OMIKUJI_LOCK_I18N`, `CLEAR_BRANCH_I18N`, `HIDDEN_CATS_I18N`,
  `TOPIC_DATA` (per-spot "topic box" trivia, keyed by step index then language),
  `AR_DATA` (per-spot WebAR overlay copy).
- `applyLangUI(lk)` pushes `CONFIG_LANG[lk]` strings into DOM elements by id via the
  `_set(id, prop, val)` helper. `buildQuestContent()` and `buildClearContent()`
  re-render per-step content from `state.lang` each time those pages are shown.

### Quest / quiz mechanics

- `buildQuestContent()` renders the current step's narrative, image carousel
  (`_buildQuestSlides`), quiz question/options, and AR badge.
- `selectOption()` / `answerQuiz()` handle quiz answers; correct answers call
  `stampSpot(idx)` to mark `state.visitedSpots` and play `playCheckSound()`.
- `jumpToSpot(stepIdx)` lets users jump to any step (used from the clear screen for
  unfinished spots).
- Step 2 (Three-Story Pagoda, index 1) has a special "hidden cats" mini-game
  (`_buildHiddenCatsSection`, `handleCatPhotoUpload`) — a photo-upload + simulated
  AI-judgement flow tracked via `state.foundCats`.
- `openAR()` / `AR_DATA` simulate a WebAR "scan to find the hidden cat" overlay.

### Clear / completion screen

- `buildClearContent()` + `updateStampRail_clear()` render the final stamp sheet
  (`manganjouju-seal`), branch messaging by stamp count (`CLEAR_BRANCH_I18N`), the
  shop info carousel (`SHOP_I18N` / `shopSection`), and the omikuji draw
  (`executeOmikujiFlow()`, locked via `OMIKUJI_LOCK_I18N` until all 10 stamps).

### Audio

- Real narration playback (`_initRealAudio`/`_initWmAudio` and the `wm*`/`audio*`
  functions) plays `mp3/map_ja.mp3` / `mp3/map_en.mp3` (only ja/en audio exists; zh/ko
  fall back to `en` audio where referenced).
- UI sound effects (`playClickSound`, `playCoinSound`, `playCheckSound`,
  `_playMissionCompleteSound`) are synthesized via the Web Audio API
  (`AudioContext` oscillators) — no sound asset files needed for these.

### Assets

- `images/` — on-site photos, named `<spotNumber>_<spotNameJa>...jpg` (e.g.
  `4_招福殿の招き猫6.jpg`), plus `full-map-optimized.jpg` / `全体マップ.jpg` for the
  map page. Files are large (multi-MB JPEGs); avoid adding unnecessary copies.
- `mp3/` — narration and (currently unused/removed) BGM tracks.
- `mp4/` — reference videos (not directly referenced by the app; for content
  reference only).
- `原稿.txt` — source script/narration draft text per spot, in Japanese, English, and
  Chinese — useful reference when writing/adjusting narration copy.

## Editing conventions for this single-file app

- Keep JS additions inside the existing `<script>` block (starts ~line 1639) and CSS
  inside the existing `<style>` block (starts ~line 9); don't introduce separate JS/CSS
  files or a bundler.
- The CSS uses a small set of design tokens defined in `:root` (`--ink`, `--parchment`,
  `--gold`, `--red`, `--sage`, `--font-display`, `--font-body`, etc.) — reuse these
  rather than hardcoding new colors/fonts.
- When adding a new piece of UI copy, add it to `CONFIG_LANG` (or the relevant
  `*_I18N`/`TOPIC_DATA` object) for **all four languages** and wire it up via `_set`/
  `applyLangUI` (or the relevant builder function) rather than hardcoding text in the
  HTML.
