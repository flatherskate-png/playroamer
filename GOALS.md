# Roamer — Project Goals

## What It Is

Roamer is a daily, timed route-discovery game. Players see photos of iconic places, sort them into the correct geographic order, and watch the route animate across a map. Core session: 3–5 minutes.

The mechanic is spatial sequencing: pattern recognition first, geography second. No trivia. Not GeoGuessr. Cinematic, editorial tone.

## North Star

A map-native pattern game that gains resolution over time. Starts with major global anchors (Layer 1), progressively adds regional nuance, then historic arcs, then systems-level geography — all on the same core mechanic.

## Current State

**Frontend:** Single-file HTML (Kate's canonical version, currently v16) plus a modularized version in this repo. Leaflet maps, D3 globe, separate desktop/mobile layouts.

**Backend:** Python/FastAPI, reads routes from `backend/data/routes.csv`. Not yet connected to the frontend.

**Routes (12 built):**
- `daily`: Pacific Coast Highway
- `grand`: Wonders of the World, Round the World, Top to Toe South America, Roof to Rainbow (Africa), The Eastern Arc
- `winter`: Southwest Desert Loop, Italian Riviera to Amalfi, East Coast Classic, Atlantic to Adriatic, The Moorish Trail, Gods and Ghats

## Current Priority: Sit-Down Testing (5–10 people)

### Still needs fixing before testing
- [ ] "Eastern Arc" has spurious small pictures on the right
- [ ] Pin size — try again
- [ ] Should all routes be side-by-side? What does that mean for Round the World?
- [ ] Zip codes appearing on Southwest Desert Loop
- [ ] Say where decoy photos are from (on reveal)
- [ ] 403 error on East Coast Classic
- [ ] Make guess tiles clickable
- [ ] Make solutions persistent when navigating back
- [ ] Score should show red if player got < 6/6
- [ ] Consolidate top bar / make it smaller
- [ ] Consistent photo sizes so all sit side by side
- [ ] Re-zoom map after guess is submitted
- [ ] After guess, photos reorder to guessed order
- [ ] Back button should go back only one screen
- [ ] Body scroll not locked when game overlay is open
- [ ] Lightbox arrow navigation advances by 2 instead of 1 (possible double event binding)

### Files to integrate
- Kate's v16 HTML is the source of truth for the current frontend
- Route descriptions (completion screen blurbs) are partially written but not all finished
- Roamer Routes file has all test routes to load

## Next Phase: Remote Beta (25 people)

- ~~Connect backend to frontend~~ ✓ Done (modular frontend fetches from FastAPI at startup)
- Add "sign up for updates" on completion screen
- Metrics: route starts, completions, guess count, time to complete

## MVP Scope (what ships first)

Layer 1 routes only · 6-photo ordering · timer · route animation · pins light up · country fills on completion. No badges, no historic arcs, no system overlays.

## Open Questions

- How do users actually use the map? (travel times go unnoticed)
- Does photo reordering after submit confuse players?
- Are large pin callouts worth the placement complexity?
- Desktop fixed grid vs. mobile swipe — are they diverging too much?

## Design Principles

- Cinematic, not SaaS
- Default users into Daily puzzle — no onboarding friction
- Premium but not luxury-pretentious
- Mobile-first; desktop enhances, doesn't redesign
