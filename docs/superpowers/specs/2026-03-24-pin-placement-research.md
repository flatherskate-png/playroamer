# Pin Placement Algorithm Research

## Problem Name

**Point-Feature Label Placement (PFLP)** — studied since the 1980s in computational geometry and cartography. Proven NP-hard in general form, but for N=6 circular markers this is not a practical concern.

Canonical paper: Christensen, Marks, and Shieber (1995). *"An empirical study of algorithms for point-feature label placement."* ACM Transactions on Graphics.

## Current State

The current nudge algorithm (ported from Kate's v6, post-migration) uses a custom iterative repulsion approach: push overlapping pairs apart using a blend of perpendicular-to-segment and separation-vector directions, 35/65 split, up to 60 passes, shrink pin radius on failure. It works but the pin overlap problem is still present in the latest version.

## Recommendation for a Future Improvement

**Use D3's `forceSimulation` headlessly — no DOM, no animation.**

For N=6, circular pins, varying radii (~20–55px), real-time canvas rendering with stem lines back to true position:

**Phase 1 — Overlap detection:**
Compute pairwise distances between all 15 pairs. Any pair where `distance < radius_a + radius_b + padding` is overlapping. Trivially fast at N=6.

**Phase 2 — Displacement:**
```js
import { forceSimulation, forceCollide, forceX, forceY } from 'd3-force';

const nodes = stops.map((s, i) => ({ x: trueX[i], y: trueY[i], r: pinR }));

forceSimulation(nodes)
  .force('collide', forceCollide(d => d.r + 4))
  .force('x', forceX(d => d.x).strength(0.15))
  .force('y', forceY(d => d.y).strength(0.15))
  .tick(300)
  .stop();

// nodes[i].x, nodes[i].y are now the displaced positions
// draw stem from trueX[i]/trueY[i] to nodes[i].x/nodes[i].y
```

The `strength` on `forceX`/`forceY` (0.1–0.3) controls how aggressively pins snap home vs. spread out. Run `.tick()` synchronously — for N=6 this completes in <50ms.

## Why This Beats the Current Approach

| | Current nudge | D3 forceSimulation |
|---|---|---|
| Algorithm type | Custom iterative repulsion | Physics simulation |
| Handles all angles | Partially (blended direction) | Yes — finds natural intermediate angles |
| Converges reliably | Sometimes needs radius shrink | Yes — always converges |
| Easy to tune | No — many interacting constants | Yes — two knobs (strength + padding) |
| Library support | None | D3 is already in the project (Leaflet/D3 globe) |

## What NOT to Use

- **Simulated annealing:** Better optimizer globally but hundreds–thousands of iterations, slow to tune, overkill for N=6
- **Fixed candidate positions (8-direction grid):** Can fail when a pin is surrounded; doesn't handle varying radii naturally
- **MarkerClusterer / Supercluster:** Merges markers — wrong, every pin must stay individually visible
- **Mapbox collision approach:** Hides losers, doesn't displace them

## Relevant Papers / Libraries

- [d3-force forceCollide](https://d3js.org/d3-force/collide) — the exact primitive needed
- [Automatic label placement (Wikipedia)](https://en.wikipedia.org/wiki/Automatic_label_placement) — good overview
- [On Map Labeling with Leaders (Springer, 2009)](https://link.springer.com/chapter/10.1007/978-3-642-03456-5_20) — academic formalization of the stem-line variant
- [Dymo (GitHub)](https://github.com/migurski/Dymo) — simulated annealing reference implementation (Python, offline)

## Implementation Notes

- D3 is already a dependency (used for the globe animation in `roamer-globe.js`) — `d3-force` can be added without a new library decision
- Run headlessly: `forceSimulation(...).tick(300).stop()` — no DOM attachment needed
- Cache result same as current approach; invalidate on canvas resize >30px
- This replaces `computePinLayout()`'s nudge algorithm only — the radius formula, caching, and hit-testing stay the same
