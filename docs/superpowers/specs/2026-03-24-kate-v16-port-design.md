# Design: Port Kate's v4→v16 Changes to Modular Frontend

## Context

Roamer has two parallel frontend versions:

- **Kate's canonical version** — a single-file HTML, currently at v16, iterated using AI prompts
- **Modular version** (this repo) — split into `index.html`, `roamer-engine.js`, `roamer-globe.js`, `roamer-lightbox.js`, `roamer.css`; currently based on Kate's v4; preferred going forward because its smaller file size fits within AI context windows

The modular version is also fully connected to the FastAPI backend — it fetches routes dynamically at startup from `localhost:8000` rather than using an embedded JS array.

The goal of this work is to bring the modular version up to parity with Kate's v16 by replaying her changes in order.

## Source Material

All source material lives in:
```
~/Downloads/testable version files-20260324T183412Z-1-001.zip
```

Extracted to `/tmp/kate_files/testable version files/` for reference.

The zip contains 11 numbered folders, each representing one or more versions of change. Most include a prompt or spec doc plus the resulting HTML file(s).

## Approach

For each step, in order:

1. Read the prompt or spec for that step
2. Adapt it to reference the modular files instead of a single HTML file
3. Present the adapted prompt to Josh for review
4. Apply after approval
5. Spot-check the result against Kate's corresponding HTML version

Each step is its own session. Sessions are independent — a future session picks up at the next uncompleted step.

## File Mapping

When Kate's prompts reference "the single HTML file", map sections to:

| Content type | Modular file |
|---|---|
| Game logic, state, rendering, event handlers | `frontend/roamer-engine.js` |
| Globe animation | `frontend/roamer-globe.js` |
| Lightbox | `frontend/roamer-lightbox.js` |
| Styles | `frontend/roamer.css` |
| HTML structure / markup | `frontend/index.html` |

## API Integration Caveat

Kate's HTML embeds routes as a static JS `ROUTES` array. The modular version fetches routes from the backend API at startup (`fetchRoutes()` in `roamer-engine.js`, hitting `localhost:8000`). Any step that touches route loading, the `ROUTES` array, or route data must be adapted to preserve the `fetchRoutes()` / API pattern rather than reverting to a static array.

## Session Plan

Each session follows the review gate in the Approach section: adapt prompt/spec → present to Josh → wait for approval → apply → spot-check against ground truth HTML.

### Session 1 — Pin system overhaul (v4 → v6)
- **Folder:** `2 - Getting from v4 to almost pins/`
- **Source:** `roamer-pin-upgrade-prompt.txt` (full prompt)
- **Scope:** Replace DOM-based pin overlay with canvas-drawn pins; new `computePinLayout()` algorithm
- **Ground truth:** `roamer-kate-v6 (pins almost great).html`
- **Touches:** `roamer-engine.js` (heavy), `roamer.css` (minor)

### Session 2 — Wrapping routes (v6 → v7)
- **Folder:** `3 - Tweak to fix round the world pins/`
- **Source:** `roamer-wrap-fix-prompt.md` (full prompt)
- **Scope:** Detect and render circumnavigating routes correctly; display longitude system; antimeridian fix
- **Ground truth:** `roamer-kate-v7-wrap-fix.html`
- **Touches:** `roamer-engine.js`

### Session 3 — Mobile pin sizing (v7 → v8)
- **Folder:** `4 - fix mobile (especially italy)/`
- **Source:** `roamer-v8-mobile-pin-fix.md` (4 surgical edits, precisely specified)
- **Scope:** Pin radius cap on small canvases; canvas height bumps; resize cache clear
- **Ground truth:** `roamer-kate-v8 - fix mobile.html`
- **Touches:** `roamer-engine.js`, `roamer.css`

### Session 4 — Cosmetic tweaks and copy (v8 → v9)
- **Folder:** `5 - cosmetic tweaks/`
- **Source:** `roamer-v9-changelog.md` (changelog, implement from doc)
- **Scope:** "Winter 2024" → "Recent Travels"; dynamic route counts; travel times removed from map; locked pack cards; CTA copy change
- **Ground truth:** `roamer-kate-v9 (cosmetic).html`
- **Touches:** `roamer-engine.js`, `index.html`, `roamer.css`

### Session 5 — New routes loaded (v9 → v10)
- **Folder:** `6 - loaded new routes/`
- **Source:** No spec — diff v9 vs v10 HTML to extract changes
- **Scope:** Route data additions and any supporting code changes
- **Ground truth:** `roamer-kate-v10 (new routes).html`
- **Note:** Since the modular version loads routes from the API (not a static array), route data changes here may be data-only (routes.csv) rather than code. Diff first to confirm. If the diff shows JS logic changes alongside `ROUTES` array additions, those logic changes belong in `roamer-engine.js`; pure data additions go to `routes.csv` only. See API Integration Caveat above — do not introduce a static `ROUTES` array.
- **Touches:** TBD from diff; likely `backend/data/routes.csv`

### Session 6 — Completion screen overhaul (v10 → v11)
- **Folder:** `7 - fix completion screen/`
- **Source:** `roamer-v10-to-v11-changes.md` (prompt-style spec)
- **Scope:** Unified completion path for all route types; map at top; guess history with visual cells; `ROUTE_BLURBS` replacing `ROUTE_FACTS`; standalone share/blurb/reactions panels
- **Ground truth:** `roamer-kate-v11 (completion screen).html`
- **Note:** See API Integration Caveat above — `ROUTE_BLURBS` should not embed a static `ROUTES` array; adapt any route-data references to use the API-loaded data.
- **Touches:** `roamer-engine.js` (heavy), `roamer.css`

### Session 7 — Submit button and text tweaks (v11 → v11b)
- **Folder:** `8 - fix submit button - tweak text/`
- **Source:** No spec — diff v11 completion-screen vs v11 submit HTML to extract changes
- **Ground truth:** `roamer-kate-v11 (submit).html`
- **Touches:** TBD from diff

### Session 8 — Stable card grid and mobile tray (v11 → v14)
- **Folder:** `9 - good test for cards that don't move/`
- **Source:** `roamer-v12-to-v14-spec.md` (detailed spec)
- **Scope:** Cards render in stable shuffle order (no resorting); placed cards darken in place; cyan glow on selected; new mobile tray with featured photo + thumbnail strip; `mobileFeaturedName` state variable
- **Ground truth:** `roamer-kate-v14.html`
- **Note:** Largest single change. Folder 9 also contains `roamer-kate-v13.html` — this is an intermediate artifact, ignore it. The spec covers the full v11→v14 delta; use only v14 for verification.
- **Touches:** `roamer-engine.js` (heavy), `roamer.css` (heavy), `index.html`

### Session 9 — Desktop layout harmonization (v14 → v15)
- **Folder:** `10 - harmonize desktop layouts/`
- **Source:** `roamer-v14-v15-spec.docx` — convert before reading:
  ```bash
  python3 -c "import docx; print('\n'.join(p.text for p in docx.Document('/tmp/kate_files/testable version files/10 - harmonize desktop layouts/roamer-v14-v15-spec.docx').paragraphs))"
  ```
  If `python-docx` is unavailable, try `pandoc roamer-v14-v15-spec.docx -t plain`. Fallback: diff v14 vs v15 HTML directly.
- **Ground truth:** `roamer-kate-v15.html`
- **Touches:** TBD after reading docx; likely `roamer-engine.js`, `roamer.css`

### Session 10 — Post-guess grid reorder (v15 → v16)
- **Folder:** `11 - add the last guess into the photo grid/`
- **Source:** `roamer-v15-to-v16-spec.md` (detailed spec, already read)
- **Scope:** New `gridOrder` state variable; grid reorders after each guess to show placed photos in stop order; unused photos below separator; feedback badges on each card
- **Ground truth:** `roamer-kate-v16.html`
- **Touches:** `roamer-engine.js`, `roamer.css`

### Session 11 — Data files (do last)
- **Folder:** `1 - Test routes with descriptions/`
- **Source:** `Roamer Routes - Testable final.csv`, `roamer_route_blurbs.csv`
- **Scope:** Replace `backend/data/routes.csv` with Kate's updated routes; load blurbs into the backend or embed in the frontend depending on architecture at that point
- **Note:** Kate is still working on more routes and v17 — do this session only when she signals the data is stable. Also in this folder: `roamer_copy_brief.docx` (copy guidelines for UI text) and `roamer_route_blurbs.docx` (blurbs in Word format, same content as the CSV). Use the CSVs; the docx files are for reference only.
- **Note:** See API Integration Caveat above — routes load via the API, so updated data goes into `routes.csv` for the backend to serve, not a frontend JS array.
- **Touches:** `backend/data/routes.csv`, TBD for blurbs

## What This Plan Does Not Cover

- Connecting the frontend to the backend (already done)
- Remote beta infrastructure (sign-up flow, metrics)
- Any features Kate adds in v17+
