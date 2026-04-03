/* ═══════════════════════════════════════════════════════
   ROAMER — Game engine
   Interaction model: tap photo → tap pin to place
   Routes are fetched from the backend API at startup.
   ═══════════════════════════════════════════════════════ */

// ── API ──
// TODO: replace with deployed Railway URL (e.g. https://roamer-backend-production.up.railway.app)
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'https://roadtrip-production-cb0a.up.railway.app';

// ── Feedback result mapping (semantic API values → display) ──
const FEEDBACK = {
  correct:    { bg: "rgba(22,101,52,0.3)",   border: "#4ade80", icon: "✓", emoji: "🟩" },
  wrong_slot: { bg: "rgba(113,63,18,0.35)",  border: "#facc15", icon: "↕", emoji: "🟨" },
  decoy:      { bg: "rgba(127,29,29,0.3)",   border: "#f87171", icon: "✗", emoji: "🟥" },
};

// ── Remote state ──
let dailyRoute   = null;   // RoutePublic from /routes/daily
let allRoutes    = [];     // RoutePublic[] from /routes
let routesLoaded = false;
let revealData   = null;   // RouteRevealed from /routes/{id}/reveal (post-game)

// ── State ──
let screen       = "home";
let currentRoute = null;
let cards        = [];
let assignments  = {};   // slotIndex -> card
let revealed     = false;
let score        = null;
let history      = loadHistory();
let leafletMap   = null;
let playSource   = "home";
let lightboxIndex = null;
let confirmedDecoyIdsGlobal = new Set();

// ── World topo cache (D3 land rendering) ──
let worldTopoCache    = null;   // 110m — used during crossfade animation
let worldTopo50Cache  = null;   // 50m  — used for final flat map
let worldTopoLoading  = false;
let worldTopo50Loading = false;

// selected photo card (held in hand)
let selectedCard = null;

// ── Mobile tray state ──
let mobileFeaturedName = null;   // card.id of featured photo in mobile tray
let userFlaggedDecoys  = new Set(); // card.ids user suspects are decoys (orange state)

// ── Grid order (v16) ──
// Stable display order for the photo grid and mobile thumbnail strip.
// Initialized to shuffle order; reordered after each guess to show placed
// cards in stop order followed by unused cards.
let gridOrder = [];   // array of card.id strings

// Landscape layout detection
let isLandscape = false;
let resizeObserver = null;

function checkLandscape() {
  const overlay = document.getElementById('game-overlay');
  if (!overlay) return false;
  return overlay.offsetWidth > overlay.offsetHeight;
}

function attachResizeObserver() {
  if (resizeObserver) resizeObserver.disconnect();
  const overlay = document.getElementById('game-overlay');
  if (!overlay || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeObserver._timer);
    resizeObserver._timer = setTimeout(() => {
      if (geoAnimating) return;
      const nowLandscape = checkLandscape();
      const nowMobile = (document.getElementById('game-overlay')?.offsetWidth ?? window.innerWidth) <= 768;
      if ((nowLandscape !== isLandscape || nowMobile !== isMobile()) && screen === 'play') {
        isLandscape = nowLandscape;
        render();
      }
    }, 150);
  });
  resizeObserver.observe(overlay);
}

const MAX_GUESSES = 3;
let guessesRemaining = MAX_GUESSES;
let guessHistory     = [];
let lastFeedback     = {};

// ── Persistent per-stop flags (reactions, etc.) stored in localStorage ──
function loadStopFlags() {
  try { return JSON.parse(localStorage.getItem('roamer_stop_flags') || '{}'); } catch { return {}; }
}
function saveStopFlags(flags) {
  try { localStorage.setItem('roamer_stop_flags', JSON.stringify(flags)); } catch {}
}

// ── Persistent route history (score badges) ──
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('roamer_history') || '[]'); } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem('roamer_history', JSON.stringify(history)); } catch {}
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame(r, source) {
  if (!r) return;
  currentRoute     = r;
  playSource       = source || "home";
  // r.photos is already shuffled by the server (stops + decoys mixed, no lat/lng).
  // Reshuffle client-side so retries get a fresh order.
  cards            = shuffle([...r.photos]);
  gridOrder        = cards.map(c => c.id);
  assignments      = {};
  selectedCard     = null;
  mobileFeaturedName = null;
  userFlaggedDecoys  = new Set();
  revealed         = false;
  revealData       = null;
  score            = null;
  guessesRemaining = MAX_GUESSES;
  guessHistory     = [];
  lastFeedback     = {};
  cachedPinLayout = null;
  // Clear pin image cache for new route
  Object.keys(pinImageCache).forEach(k => delete pinImageCache[k]);
  if (leafletMap)  { leafletMap.remove(); leafletMap = null; }
  window._persistCanvas = null;
  geoT = 0;
  geoAnimating = false;
  if (geoAnimHandle) { cancelAnimationFrame(geoAnimHandle); geoAnimHandle = null; }
  screen = "play";
  isLandscape = checkLandscape();
  attachResizeObserver();
  render();
}

function isMobile() {
  const overlay = document.getElementById('game-overlay');
  return overlay ? overlay.offsetWidth <= 768 : window.innerWidth <= 768;
}

// After placing a card, advance mobileFeaturedName to the next actionable card.
// Priority: yellow (wrong_slot in last guess) > neutral (never placed) > skip green/red.
// After placing a card, advance mobileFeaturedName to the next actionable card.
// Order: yellows (wrong_slot) in gridOrder sequence, then neutrals (never placed).
// Greens (locked) and confirmed reds are always skipped.
function advanceMobileFeatured(placedId) {
  const lastGuess = guessHistory.length > 0 ? guessHistory[guessHistory.length - 1] : null;

  const lastFbOf = {};
  if (lastGuess) {
    Object.entries(lastGuess.assignments).forEach(([si, card]) => {
      if (card) lastFbOf[card.id] = lastGuess.feedback[parseInt(si)];
    });
  }

  function cardIsSkippable(c) {
    if (confirmedDecoyIdsGlobal.has(c.id)) return true;
    const placedEntry = Object.entries(assignments).find(([, a]) => a.id === c.id);
    return placedEntry ? slotIsLocked(parseInt(placedEntry[0])) : false;
  }

  // Build the full priority sequence: yellows in gridOrder order, then neutrals in gridOrder order.
  // Build BEFORE filtering out placedId so we can find our current position in the sequence.
  const yellows  = gridOrder.filter(id => {
    const c = cards.find(card => card.id === id);
    return c && !cardIsSkippable(c) && lastFbOf[id] === 'wrong_slot';
  });
  const neutrals = gridOrder.filter(id => {
    const c = cards.find(card => card.id === id);
    // A neutral is a card with no last-guess feedback that isn't currently locked/elim.
    // Include placedId here temporarily so we can find position; it will be skipped on next render.
    const isPlaced = id !== placedId && Object.values(assignments).some(a => a.id === id);
    return c && !cardIsSkippable(c) && !lastFbOf[id] && !isPlaced;
  });
  const sequence = [...yellows, ...neutrals];
  console.log('[advance] placedId:', placedId);
  console.log('[advance] yellows:', yellows);
  console.log('[advance] neutrals:', neutrals);
  console.log('[advance] sequence:', sequence);
  console.log('[advance] curIdx in sequence:', sequence.indexOf(placedId));

  if (!sequence.length) { mobileFeaturedName = placedId; return; }

  // Find where placedId sits in the sequence and advance to the next entry
  const curIdx = sequence.indexOf(placedId);
  if (curIdx !== -1 && curIdx < sequence.length - 1) {
    // Currently in the sequence — step forward
    mobileFeaturedName = sequence[curIdx + 1];
  } else {
    // Not in sequence (e.g. was a neutral not yet in sequence) or at end — start from beginning
    mobileFeaturedName = sequence[0];
  }
}

// Resolve which card should be shown in the featured slot
function resolveMobileFeatured() {
  if (!cards.length) return null;
  // 1. Armed card
  if (selectedCard) return selectedCard;
  // 2. Explicit user choice
  if (mobileFeaturedName) {
    const c = cards.find(c => c.id === mobileFeaturedName);
    if (c) return c;
  }
  // 3. First unplaced, non-eliminated
  const unplaced = cards.find(c => {
    const isPlaced = Object.values(assignments).some(a => a.id === c.id);
    const isElim   = confirmedDecoyIdsGlobal.has(c.id);
    return !isPlaced && !isElim;
  });
  if (unplaced) return unplaced;
  // 4. Fallback
  return cards[0] ?? null;
}


function slotIsLocked(i) {
  if (guessHistory.length === 0) return false;
  return guessHistory[guessHistory.length - 1].feedback[i] === "correct";
}

// ── Interaction: tap a photo ──
function tapPhoto(card) {
  if (revealed) return;
  const isDecoyElim = confirmedDecoyIdsGlobal.has(card.id);
  if (isDecoyElim) return;

  const placedSlot = Object.entries(assignments).find(([, c]) => c.id === card.id);

  if (selectedCard?.id === card.id) {
    selectedCard = null;
  } else if (placedSlot) {
    const slotIdx = parseInt(placedSlot[0]);
    if (slotIsLocked(slotIdx)) return;
    delete assignments[slotIdx];
    selectedCard = card;
  } else {
    selectedCard = card;
  }
  // Stop expand pulse on any photo interaction
  document.querySelectorAll('.ob-pulse-target').forEach(el => el.classList.remove('ob-pulse-target'));
  mobileFeaturedName = card.id;
  render();
  redrawGeoMap();
  // Fire hint after render so #ob-hint-slot exists in DOM
  if (typeof window.obHint_photoSelected === 'function') window.obHint_photoSelected();
}

// ── Interaction: tap a pin ──
function tapPin(slotIndex) {
  if (revealed) return;
  if (slotIsLocked(slotIndex)) return;

  if (selectedCard) {
    const placedId = selectedCard.id;
    assignments[slotIndex] = selectedCard;
    selectedCard = null;
    advanceMobileFeatured(placedId);
  } else {
    if (assignments[slotIndex]) {
      if (slotIsLocked(slotIndex)) return;
      delete assignments[slotIndex];
    }
  }
  render();
  redrawGeoMap();
  // Fire hint after render so #ob-hint-slot exists in DOM
  if (typeof window.obHint_photoPlaced === 'function') window.obHint_photoPlaced();
}

function allSlotsFilled() {
  return Array.from({length: currentRoute.stop_count}, (_, i) => i).every(i => assignments[i]);
}

async function checkAnswers() {
  const guessNumber = guessHistory.length + 1;
  const assignmentsList = Object.entries(assignments).map(([slot, card]) => ({
    slot_index: parseInt(slot),
    photo_id: card.id,
  }));

  const btn = document.getElementById('btn-submit');
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(
      `${API_BASE}/api/v1/routes/${currentRoute.id}/guess?guess_number=${guessNumber}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_id: currentRoute.id, assignments: assignmentsList }),
      }
    );
    if (!response.ok) throw new Error(`Guess failed: ${response.status}`);
    const result = await response.json();

    const feedback = {};
    result.feedback.forEach(f => { feedback[f.slot_index] = f.result; });
    lastFeedback = feedback;
    guessHistory.push({ assignments: { ...assignments }, feedback: { ...feedback } });
    guessesRemaining = result.guesses_remaining;

    // ── v16: reorder grid to reflect this guess ──
    {
      const N = currentRoute.stop_count;
      const placedIds = Array.from({ length: N }, (_, i) => assignments[i]?.id).filter(Boolean);
      const placedSet = new Set(placedIds);
      const unusedIds = gridOrder.filter(id => !placedSet.has(id));
      gridOrder = [...placedIds, ...unusedIds];
    }

    if (result.solved || result.guesses_remaining === 0) {
      const revealResp = await fetch(`${API_BASE}/api/v1/routes/${currentRoute.id}/reveal`);
      revealData = await revealResp.json();
      score = result.correct_count;
      revealed = true;
      history.push({ id: currentRoute.id, route: currentRoute.name, score: result.correct_count, total: result.total_stops });
      saveHistory();
      render();
      setTimeout(initLeafletMap, 50);
    } else {
      const newAssignments = {};
      Array.from({length: currentRoute.stop_count}, (_, i) => i).forEach(i => {
        if (feedback[i] === "correct") newAssignments[i] = assignments[i];
      });
      assignments  = newAssignments;
      selectedCard = null;

      // ── v16 mobile: set featured card after reorder ──
      {
        const lastGuess = guessHistory[guessHistory.length - 1];
        const fbById = {};
        if (lastGuess) {
          Object.entries(lastGuess.assignments).forEach(([si, card]) => {
            if (card) fbById[card.id] = lastGuess.feedback[parseInt(si)];
          });
        }
        const freshDecoys = new Set(confirmedDecoyIdsGlobal);
        if (lastGuess) {
          Object.entries(lastGuess.assignments).forEach(([si, card]) => {
            if (card && lastGuess.feedback[parseInt(si)] === 'decoy') freshDecoys.add(card.id);
          });
        }
        const isSkippable = (id) => {
          if (freshDecoys.has(id)) return true;
          const pe = Object.entries(newAssignments).find(([, a]) => a?.id === id);
          return pe ? slotIsLocked(parseInt(pe[0])) : false;
        };
        const N = currentRoute.stop_count;
        const placedZone = gridOrder.slice(0, N);
        const unusedZone = gridOrder.slice(N);
        const firstYellow = placedZone.find(id => !isSkippable(id) && fbById[id] === 'wrong_slot') || null;
        const firstNeutral = unusedZone.find(id => !isSkippable(id)) || null;
        mobileFeaturedName = firstYellow || firstNeutral || gridOrder[0];
      }

      render();
      redrawGeoMap();
    }
  } catch (err) {
    console.error('Failed to submit guess:', err);
    if (btn) btn.disabled = false;
  }
}

function initLeafletMap() {
  if (!revealData) return;
  const el = document.getElementById("leaflet-map");
  if (!el || !window.L) return;
  const stops = revealData.stops;
  const wrapping = isWrappingRoute(currentRoute);
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: true, worldCopyJump: wrapping });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

  // Correctness comes from the final guess's feedback (server is the truth)
  const finalFeedback = guessHistory.length > 0 ? guessHistory[guessHistory.length - 1].feedback : {};

  if (wrapping) {
    // For wrapping routes, use display longitudes so the polyline wraps correctly
    const displayLngs = getDisplayLngs(currentRoute);
    const latlngs = currentRoute.slots.map((s, i) => [s.lat, displayLngs[i]]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds.pad(0.15));
    L.polyline(latlngs, { color: "rgba(125,211,252,0.7)", weight: 3, dashArray: "8 5" }).addTo(map);
    stops.forEach((stop, i) => {
      const correct = finalFeedback[i] === "correct";
      const col = correct ? "#4ade80" : "#f87171";
      const bg  = correct ? "rgba(22,101,52,0.85)" : "rgba(127,29,29,0.85)";
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2px solid ${col};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;font-family:'DM Sans',sans-serif;">${correct ? "✓" : "✗"}</div>
          <div style="margin-top:3px;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;color:${col};text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;">${stop.name}</div>
        </div>`,
        iconSize: [140, 50], iconAnchor: [70, 14],
      });
      L.marker([stop.lat, displayLngs[i]], { icon, interactive: false }).addTo(map);
    });
  } else {
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.25));
    L.polyline(stops.map(s => [s.lat, s.lng]), { color: "rgba(125,211,252,0.7)", weight: 3, dashArray: "8 5" }).addTo(map);
    stops.forEach((stop, i) => {
      const correct = finalFeedback[i] === "correct";
      const col = correct ? "#4ade80" : "#f87171";
      const bg  = correct ? "rgba(22,101,52,0.85)" : "rgba(127,29,29,0.85)";
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2px solid ${col};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;font-family:'DM Sans',sans-serif;">${correct ? "✓" : "✗"}</div>
          <div style="margin-top:3px;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;color:${col};text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;">${stop.name}</div>
        </div>`,
        iconSize: [140, 50], iconAnchor: [70, 14],
      });
      L.marker([stop.lat, stop.lng], { icon, interactive: false }).addTo(map);
    });
  }
  leafletMap = map;
  setTimeout(() => map.invalidateSize(), 200);
}


/* ═══════════════════════════════════════════════════════════
   GEO MAP SYSTEM
   ═══════════════════════════════════════════════════════════ */

const GEO_RINGS = [[[-67,47],[-70,46],[-72,45],[-74,45],[-76,44],[-79,43],[-80,43],[-82,42],[-83,42],[-83,44],[-84,46],[-85,47],[-88,48],[-95,49],[-100,49],[-110,49],[-115,49],[-123,49],[-124,49],[-124,48],[-124.5,47],[-124.5,45],[-124,44],[-124.5,42],[-124.5,40],[-124,39],[-123,38],[-123,37],[-122,36],[-121,35],[-120,34],[-118,34],[-118,33],[-117,32],[-114,32],[-111,31],[-108,31],[-106,32],[-104,29],[-101,28],[-99,27],[-97,27],[-97,26],[-96,27],[-94,29],[-93,29],[-90,28],[-90,29],[-88,30],[-85,30],[-82,29],[-82,26],[-82,24],[-81,24],[-81,25],[-80,25],[-80,27],[-80,29],[-80,31],[-80,32],[-79,33],[-78,34],[-77,34],[-76,35],[-76,37],[-76,38],[-75,39],[-74,40],[-73,41],[-71,42],[-70,43],[-69,44],[-68,44],[-67,47]],[[-141,60],[-148,60],[-152,58],[-158,57],[-162,60],[-164,63],[-168,66],[-165,60],[-160,59],[-156,60],[-153,60],[-141,68],[-141,60]],[[-117,32],[-116,31],[-114,30],[-112,28],[-110,26],[-109,24],[-110,23],[-117,32]],[[-81,24],[-81,25],[-80,25],[-80,24],[-81,24]],[[-117,32],[-110,23],[-109,23],[-105,20],[-97,22],[-94,22],[-92,21],[-90,21],[-89,21],[-88,21],[-87,20],[-86,18],[-87,18],[-88,18],[-90,21],[-92,21],[-96,21],[-97,20],[-92,19],[-90,18],[-88,16],[-83,10],[-77,8],[-77,9],[-83,11],[-88,16],[-90,18],[-92,19],[-96,22],[-97,26],[-97,27],[-99,27],[-101,28],[-104,29],[-106,32],[-108,31],[-111,31],[-117,32]],[[-25,83],[-44,76],[-52,70],[-64,66],[-57,63],[-52,67],[-43,70],[-24,72],[-18,76],[-15,82],[-25,83]],[[-77,8],[-72,12],[-72,10],[-68,6],[-62,4],[-58,2],[-62,-45],[-60,-38],[-57,-38],[-53,-34],[-50,-33],[-48,-28],[-45,-24],[-42,-23],[-39,-20],[-37,-14],[-35,-10],[-35,-4],[-40,2],[-50,5],[-52,-3],[-52,-10],[-56,-15],[-60,-22],[-62,-32],[-65,-38],[-66,-44],[-68,-54],[-65,-55],[-70,-30],[-70,-22],[-70,-18],[-72,-16],[-75,-14],[-77,-12],[-80,-8],[-80,-4],[-78,-2],[-80,2],[-80,6],[-77,8]],[[-5,48],[-3,50],[-2,51],[0,51],[1,51],[2,51],[3,51],[4,52],[8,57],[8,55],[10,55],[12,56],[10,58],[8,57],[5,57],[5,58],[8,62],[12,65],[15,68],[18,69],[20,70],[24,70],[26,68],[28,65],[26,60],[24,58],[22,58],[20,59],[18,57],[15,57],[14,55],[12,56],[10,55],[8,54],[7,51],[6,51],[5,51],[3,51],[2,51],[2,44],[3,44],[4,44],[5,44],[6,44],[7,44],[8,44],[9,41],[10,40],[10,38],[11,38],[12,38],[13,38],[14,38],[15,38],[16,38],[16,40],[16,41],[15,42],[14,44],[7,44],[6,44],[5,46],[6,47],[7,47],[8,47],[10,47],[12,47],[13,46],[14,46],[14,44],[13,44],[12,44],[11,44],[10,44],[9,44],[8,44],[7,44],[6,43],[5,43],[3,43],[-2,44],[-4,44],[-5,44],[-8,44],[-9,44],[-9,42],[-9,39],[-9,37],[-6,37],[-5,36],[-2,37],[-1,37],[0,38],[1,40],[3,42],[3,43],[0,44],[-1,44],[-2,44],[-2,47],[-5,48]],[[14,46],[14,44],[16,42],[18,41],[20,41],[20,40],[20,38],[22,37],[24,38],[26,40],[26,41],[26,42],[24,43],[22,44],[20,45],[18,46],[14,46]],[[20,38],[20,37],[22,36],[26,36],[28,37],[26,38],[24,37],[22,37],[20,38]],[[26,38],[26,42],[30,42],[34,42],[38,42],[42,42],[44,40],[42,38],[40,38],[38,37],[36,36],[32,36],[28,37],[26,38]],[[14,54],[14,52],[16,50],[18,50],[20,50],[22,56],[26,68],[28,70],[30,60],[30,58],[28,56],[24,58],[26,60],[28,60],[26,58],[24,58],[22,56],[18,54],[14,54]],[[28,70],[28,54],[30,46],[36,47],[42,52],[60,56],[80,54],[100,50],[110,50],[120,48],[130,50],[140,60],[140,50],[138,46],[134,36],[130,34],[126,34],[126,38],[130,42],[132,44],[138,46],[140,68],[140,70],[120,72],[100,73],[80,74],[60,72],[40,70],[28,70]],[[-5,36],[-5,32],[-8,28],[-12,24],[-16,20],[-16,12],[-14,10],[-10,6],[-4,5],[0,5],[5,2],[10,-8],[14,-22],[18,-30],[22,-34],[28,-34],[30,-25],[34,-18],[36,-5],[40,-1],[42,2],[44,4],[44,8],[42,12],[38,22],[37,22],[35,28],[33,30],[30,30],[25,31],[20,34],[15,37],[10,37],[5,37],[0,36],[-5,36]],[[44,-12],[44,-24],[50,-25],[50,-16],[44,-12]],[[34,32],[34,26],[36,22],[38,20],[42,14],[44,12],[48,12],[52,12],[58,14],[58,22],[56,24],[50,26],[44,28],[42,28],[38,30],[36,32],[34,32]],[[60,24],[68,28],[72,28],[74,32],[76,32],[80,32],[80,28],[82,26],[82,20],[82,14],[80,8],[78,8],[74,20],[72,22],[68,24],[60,24]],[[80,6],[78,8],[80,10],[82,8],[80,6]],[[96,20],[94,18],[96,8],[100,2],[104,2],[108,10],[106,14],[100,20],[96,20]],[[108,2],[108,6],[116,8],[118,8],[118,4],[108,2]],[[96,5],[98,2],[106,-2],[106,5],[96,5]],[[130,32],[130,34],[132,44],[141,44],[141,40],[140,38],[136,36],[134,35],[132,34],[130,32]],[[114,-22],[114,-26],[118,-32],[126,-34],[132,-34],[138,-36],[142,-38],[146,-38],[150,-38],[152,-34],[154,-32],[154,-28],[152,-26],[148,-22],[146,-20],[142,-18],[140,-16],[136,-12],[132,-12],[128,-14],[122,-18],[118,-20],[114,-22]],[[-84,22],[-82,23],[-78,23],[-75,22],[-74,20],[-75,20],[-78,20],[-82,22],[-84,22]],[[-74,18],[-74,20],[-72,20],[-68,20],[-68,18],[-74,18]],[[74,38],[74,36],[76,32],[80,28],[82,28],[88,28],[92,28],[96,28],[98,24],[100,22],[102,22],[104,22],[106,14],[108,16],[110,18],[114,22],[120,28],[122,32],[126,34],[126,40],[124,42],[122,46],[120,48],[116,48],[110,48],[106,48],[100,44],[96,44],[90,42],[86,44],[80,42],[74,38]]];

let geoT           = 0;
let geoRot         = 0;
let geoAnimHandle  = null;
let geoAnimating   = false;
let lastDrawnPinPts  = []; // pin positions for hit-testing
let lastPinR         = 30; // current filled pin radius
let lastEmptyR       = 12; // current empty pin radius
let cachedPinLayout  = null;    // { pts, pinR, emptyR }
let cachedLayoutSize = null;    // { w, h } when layout was last computed
const pinImageCache  = {};      // url -> loaded Image objects for canvas drawing

// ── Wrapping route support ──
// Detects routes that circumnavigate the globe (traveling > 300° of longitude)
// and computes "display longitudes" that let the route read left→right
// continuously, with the map showing the full wrap.
function isWrappingRoute(route) {
  const lngs = route.slots.map(s => s.lng);
  const display = [lngs[0]];
  for (let i = 1; i < lngs.length; i++) {
    let d = lngs[i] - lngs[i - 1];
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    display.push(display[i - 1] + d);
  }
  const span = Math.max(...display) - Math.min(...display);
  return span > 300;
}

// For a wrapping route, compute display longitudes that increase
// monotonically left-to-right. For non-wrapping routes, returns real lngs.
function getDisplayLngs(route) {
  if (!isWrappingRoute(route)) return route.slots.map(s => s.lng);
  const lngs = route.slots.map(s => s.lng);
  const display = [lngs[0]];
  for (let i = 1; i < lngs.length; i++) {
    let d = lngs[i] - lngs[i - 1];
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    display.push(display[i - 1] + d);
  }
  return display;
}

function getRouteViewport(route) {
  const lats = route.slots.map(s => s.lat);
  const lngs = getDisplayLngs(route);
  const routeSpanLat = Math.max(...lats) - Math.min(...lats) || 4;
  const routeSpanLng = Math.max(...lngs) - Math.min(...lngs) || 6;
  const padLat = Math.max(2.5, routeSpanLat * 0.65);
  const padLng = Math.max(2.5, routeSpanLng * 0.65);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  return {
    minLat: centerLat - padLat,
    maxLat: centerLat + padLat,
    minLng: centerLng - padLng,
    maxLng: centerLng + padLng,
    centerLat,
    centerLng,
    wrapping: isWrappingRoute(route),
    displayLngs: lngs,
  };
}

function globeProject(lat, lng, rotDeg, cx, cy, R) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = (lng + rotDeg) * Math.PI / 180;
  const x3 = R * Math.sin(phi) * Math.cos(theta);
  const y3 = R * Math.cos(phi);
  const z3 = R * Math.sin(phi) * Math.sin(theta);
  return { x: cx + x3, y: cy - y3, z3, visible: z3 > -R * 0.05 };
}

function flatProject(lat, lng, vp, W, H) {
  const latSpan = vp.maxLat - vp.minLat;
  const lngSpan = vp.maxLng - vp.minLng;
  const scaleByLat = H / latSpan;
  const scaleByLng = W / lngSpan;
  const scale = Math.min(scaleByLat, scaleByLng) * 0.88;
  const offX = W / 2 - vp.centerLng * scale;
  const offY = H / 2 + vp.centerLat * scale;
  return { x: lng * scale + offX, y: offY - lat * scale };
}

function lerpProject(lat, lng, t, rotDeg, vp, W, H, cx, cy, R) {
  const gp = globeProject(lat, lng, rotDeg, cx, cy, R);
  const fp = flatProject(lat, lng, vp, W, H);
  const globeVis = gp.visible ? 1 : 0;
  const vis = globeVis + (1 - globeVis) * t;
  return { x: gp.x + (fp.x - gp.x) * t, y: gp.y + (fp.y - gp.y) * t, alpha: vis };
}

function computePinLayout(route, W, H) {
  const vp = getRouteViewport(route);
  const displayLngs = vp.displayLngs || route.slots.map(s => s.lng);
  const MARGIN = 12;

  // True geo positions — pins sit exactly at geographic coordinates, no nudging
  const pts = route.slots.map((s, i) => {
    const p = flatProject(s.lat, displayLngs[i], vp, W, H);
    return {
      x: Math.max(MARGIN, Math.min(W - MARGIN, p.x)),
      y: Math.max(MARGIN, Math.min(H - MARGIN, p.y))
    };
  });

  // Pin radius scales with canvas diagonal at 35% of the guaranteed 7% stop separation.
  // Routes are curated to keep adjacent stops ≥7% of route diagonal apart,
  // so this size never causes overlap.
  const diag = Math.hypot(W, H);
  const pinR = Math.round(Math.max(10, Math.min(30, diag * 0.07 * 0.35)));
  const emptyR = Math.max(7, Math.round(pinR * 0.55));

  return { pts, pinR, emptyR };
}

function drawGeoMap(t, rotDeg) {
  const canvas = document.getElementById('route-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth  || 600;
  const H   = canvas.offsetHeight || 300;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const vp = getRouteViewport(currentRoute);
  const cosLat = Math.cos(vp.centerLat * Math.PI / 180);
  const cx = W * 0.5, cy = H * 0.48;
  const R  = Math.min(W, H) * (0.42 - t * 0.15);

  ctx.fillStyle = t < 0.5 ? 'rgba(7,16,31,1)' : 'rgba(8,18,36,1)';
  ctx.fillRect(0, 0, W, H);

  if (t < 0.95) {
    const gA = Math.max(0, 1 - t * 2.2);
    const grd = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
    grd.addColorStop(0, `rgba(12,28,56,${gA * 0.9})`);
    grd.addColorStop(1, `rgba(7,16,31,${gA})`);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(125,211,252,${0.12 * gA})`; ctx.lineWidth = 1.5; ctx.stroke();
  }

  if (t > 0.3) {
    const fA = Math.min(1, (t - 0.3) / 0.7);
    const fg = ctx.createLinearGradient(0, 0, W, H);
    fg.addColorStop(0, `rgba(8,18,40,${fA * 0.6})`);
    fg.addColorStop(1, `rgba(6,12,28,${fA * 0.6})`);
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
  }

  // ── Land polygons: GEO_RINGS fades out, D3 topo fades in ──
  const globeLandAlpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
  if (globeLandAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = globeLandAlpha;
    const ringShifts = [0];
    if (vp.wrapping && t > 0.3) {
      if (vp.maxLng > 180) ringShifts.push(360);
      if (vp.minLng < -180) ringShifts.push(-360);
    }
    ringShifts.forEach(shiftLng => {
      GEO_RINGS.forEach(ring => {
        if (ring.length < 3) return;
        ctx.beginPath();
        let started = false;
        ring.forEach(([lng, lat]) => {
          const p = lerpProject(lat, lng + shiftLng, t, rotDeg, vp, W, H, cx, cy, R);
          if (p.alpha < 0.01) { started = false; return; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        });
        if (started) ctx.closePath();
        const lA = t < 0.5 ? 0.75 : 0.75 + (t - 0.5) * 0.5;
        ctx.fillStyle   = `rgba(32,54,88,${lA})`; ctx.fill();
        ctx.strokeStyle = `rgba(125,211,252,${0.08 + t * 0.08})`; ctx.lineWidth = t < 0.5 ? 0.5 : 0.7; ctx.stroke();
      });
    });
    ctx.restore();
  }

  // D3 flat map layer — fades in as t approaches 1
  const d3Alpha = t < 0.6 ? 0 : Math.min(1, (t - 0.6) / 0.4);
  const activeTopoCache = (worldTopo50Cache && d3Alpha > 0.8) ? worldTopo50Cache : worldTopoCache;
  if (d3Alpha > 0.01 && activeTopoCache && typeof d3 !== 'undefined' && typeof topojson !== 'undefined') {
    ctx.save();
    ctx.globalAlpha = d3Alpha;
    const landFeature = topojson.feature(activeTopoCache, activeTopoCache.objects.land);
    const vp2 = getRouteViewport(currentRoute);
    const mapScale2 = Math.min(H / (vp2.maxLat - vp2.minLat), W / (vp2.maxLng - vp2.minLng)) * 0.88;
    const offX2 = W / 2 - vp2.centerLng * mapScale2;
    const offY2 = H / 2 + vp2.centerLat * mapScale2;
    const shifts = [0];
    if (vp2.wrapping) {
      if (vp2.maxLng > 180) shifts.push(360);
      if (vp2.minLng < -180) shifts.push(-360);
    }
    shifts.forEach(shiftLng => {
      const projection = d3.geoEquirectangular()
        .scale(mapScale2 * (180 / Math.PI))
        .translate([offX2 + shiftLng * mapScale2, offY2])
        .precision(0.1);
      const pathGen = d3.geoPath().projection(projection).context(ctx);
      ctx.beginPath();
      pathGen(landFeature);
      ctx.fillStyle = 'rgba(32,54,88,1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,211,252,0.35)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    });
    ctx.restore();
  } else if (d3Alpha > 0.5 && !worldTopoCache) {
    ctx.save();
    ctx.globalAlpha = d3Alpha * 0.3;
    ctx.font = `11px 'DM Sans', sans-serif`;
    ctx.fillStyle = 'rgba(125,211,252,1)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('loading map…', W/2, H/2);
    ctx.restore();
  }

  if (t < 0.7) {
    const gA = Math.max(0, (0.7 - t) / 0.7) * 0.06;
    ctx.strokeStyle = `rgba(125,211,252,${gA})`; ctx.lineWidth = 0.5;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); let f = true;
      for (let lng2 = -180; lng2 <= 180; lng2 += 5) {
        const p = globeProject(lat, lng2, rotDeg, cx, cy, R);
        if (!p.visible) { f = true; continue; }
        f ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); f = false;
      }
      ctx.stroke();
    }
    for (let lng2 = -180; lng2 < 180; lng2 += 30) {
      ctx.beginPath(); let f = true;
      for (let lat = -80; lat <= 80; lat += 4) {
        const p = globeProject(lat, lng2, rotDeg, cx, cy, R);
        if (!p.visible) { f = true; continue; }
        f ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); f = false;
      }
      ctx.stroke();
    }
  }

  if (t > 0.5) {
    const gA = Math.min(1, (t - 0.5) / 0.5) * 0.04;
    ctx.strokeStyle = `rgba(125,211,252,${gA})`; ctx.lineWidth = 0.5;
    for (let lat = -80; lat <= 80; lat += 15) {
      ctx.beginPath();
      const a = flatProject(lat, vp.minLng - 10, vp, W, H);
      const b = flatProject(lat, vp.maxLng + 10, vp, W, H);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Extend longitude grid lines past ±180 for wrapping routes
    const gridLngMin = Math.floor(vp.minLng / 15) * 15;
    const gridLngMax = Math.ceil(vp.maxLng / 15) * 15;
    for (let lng2 = gridLngMin; lng2 <= gridLngMax; lng2 += 15) {
      ctx.beginPath();
      const a = flatProject(-80, lng2, vp, W, H);
      const b = flatProject(80,  lng2, vp, W, H);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  if (t > 0.80) {
    const routeAlpha = Math.min(1, (t - 0.80) / 0.20);
    const slots = currentRoute.slots;
    const N = slots.length;

    // Recompute pin layout if canvas resized or not yet computed
    if (!cachedPinLayout || (cachedLayoutSize &&
        (Math.abs(W - cachedLayoutSize.w) > 30 || Math.abs(H - cachedLayoutSize.h) > 30))) {
      cachedPinLayout = computePinLayout(currentRoute, W, H);
      cachedLayoutSize = { w: W, h: H };
    }
    const layout = cachedPinLayout;
    const pts = layout.pts;
    const pinR = layout.pinR;
    const emptyR = layout.emptyR;

    // Update hit-test caches
    lastDrawnPinPts = pts.map(p => ({ ...p }));
    lastPinR = pinR;
    lastEmptyR = emptyR;

    // Route line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = `rgba(125,211,252,${0.07 * routeAlpha})`;
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = `rgba(125,211,252,${0.5 * routeAlpha})`;
    ctx.lineWidth = 1.8; ctx.setLineDash([6, 5]); ctx.stroke();
    ctx.setLineDash([]);

    // Pass 1: Filled pins in REVERSE order (earlier stops on top)
    for (let i = N - 1; i >= 0; i--) {
      if (!assignments[i]) continue;
      const assigned = assignments[i];
      const locked = assigned && slotIsLocked(i);
      const isStart = i === 0;
      const isEnd = i === N - 1;
      const p = pts[i];
      const r = pinR;

      // Outer ring
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = locked
        ? `rgba(74,222,128,${0.8 * routeAlpha})`
        : `rgba(125,211,252,${0.7 * routeAlpha})`;
      ctx.lineWidth = 2.5; ctx.stroke();

      // Dark fill base
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(10,16,30,${0.95 * routeAlpha})`; ctx.fill();

      // Photo thumbnail clipped to circle
      const url = assigned.photo;
      if (!pinImageCache[url]) {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { pinImageCache[url] = img; redrawGeoMap(); };
        img.onerror = () => { pinImageCache[url] = 'error'; };
        img.src = url; pinImageCache[url] = 'loading';
      }
      const cachedImg = pinImageCache[url];
      if (cachedImg && cachedImg !== 'loading' && cachedImg !== 'error') {
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r - 1, 0, Math.PI * 2); ctx.clip();
        const iw = cachedImg.naturalWidth, ih = cachedImg.naturalHeight;
        const d = r * 2 - 2, scale = Math.max(d / iw, d / ih);
        ctx.drawImage(cachedImg, p.x - iw*scale/2, p.y - ih*scale/2, iw*scale, ih*scale);
        ctx.restore();
      }

      // Locked overlay + checkmark
      if (locked) {
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = `rgba(0,0,0,${0.15 * routeAlpha})`; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(16, r * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(22,101,52,${0.9 * routeAlpha})`; ctx.fill();
        ctx.strokeStyle = `rgba(74,222,128,${routeAlpha})`; ctx.lineWidth = 2;
        ctx.beginPath(); const ck = Math.min(6, r * 0.2);
        ctx.moveTo(p.x - ck, p.y); ctx.lineTo(p.x - ck*0.2, p.y + ck*0.7);
        ctx.lineTo(p.x + ck, p.y - ck*0.6); ctx.stroke();
      }

      // Number badge at bottom-right
      const badgeR = Math.max(8, Math.round(r * 0.28));
      const badgeX = p.x + r * 0.65, badgeY = p.y + r * 0.65;
      ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = locked ? `rgba(16,48,24,${0.95*routeAlpha})` : `rgba(6,10,18,${0.92*routeAlpha})`; ctx.fill();
      ctx.strokeStyle = locked ? `rgba(74,222,128,${0.6*routeAlpha})` : `rgba(125,211,252,${0.5*routeAlpha})`;
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = locked ? `rgba(74,222,128,${routeAlpha})` : `rgba(200,230,255,${0.9*routeAlpha})`;
      ctx.font = `bold ${Math.round(badgeR * 1.1)}px 'DM Sans', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), badgeX, badgeY);

      // START/END labels
      if (isStart || isEnd) {
        ctx.fillStyle = isStart ? `rgba(125,211,252,${0.7*routeAlpha})` : `rgba(255,255,255,${0.3*routeAlpha})`;
        ctx.font = `bold ${Math.max(8, Math.round(r * 0.3))}px 'DM Sans', sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText(isStart ? 'START' : 'END', p.x, p.y - r - 8);
      }
    }

    // Pass 2: Empty pins in forward order (always on top)
    for (let i = 0; i < N; i++) {
      if (assignments[i]) continue;
      const isSelected = selectedCard !== null;
      const isStart = i === 0;
      const isEnd = i === N - 1;
      const p = pts[i];
      const r = emptyR;

      // Glow when a photo is selected
      if (isSelected) {
        const glow = ctx.createRadialGradient(p.x, p.y, r*0.5, p.x, p.y, r+8);
        glow.addColorStop(0, `rgba(125,211,252,${0.25*routeAlpha})`);
        glow.addColorStop(1, 'rgba(125,211,252,0)');
        ctx.beginPath(); ctx.arc(p.x, p.y, r+8, 0, Math.PI*2); ctx.fillStyle = glow; ctx.fill();
      }

      // START gets extra ring
      if (isStart) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r+5, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(125,211,252,${0.15*routeAlpha})`; ctx.lineWidth = 1; ctx.stroke();
      }

      // Fill
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle = isStart ? `rgba(10,30,50,${0.85*routeAlpha})` : `rgba(10,16,30,${0.78*routeAlpha})`; ctx.fill();

      // Border
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      if (isSelected) { ctx.strokeStyle = `rgba(125,211,252,${0.8*routeAlpha})`; ctx.lineWidth = 2; }
      else if (isStart) { ctx.strokeStyle = `rgba(125,211,252,${0.7*routeAlpha})`; ctx.lineWidth = 2; }
      else { ctx.strokeStyle = `rgba(255,255,255,${0.28*routeAlpha})`; ctx.lineWidth = 1.5; ctx.setLineDash([3,2]); }
      ctx.stroke(); ctx.setLineDash([]);

      // Number text
      ctx.fillStyle = isStart ? `rgba(125,211,252,${0.95*routeAlpha})` : `rgba(220,230,245,${0.82*routeAlpha})`;
      ctx.font = `bold ${Math.round(r * 0.78)}px 'DM Sans', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y);

      // START/END labels
      if (isStart || isEnd) {
        ctx.fillStyle = isStart ? `rgba(125,211,252,${0.7*routeAlpha})` : `rgba(255,255,255,${0.3*routeAlpha})`;
        ctx.font = `bold ${Math.max(8, Math.round(r * 0.5))}px 'DM Sans', sans-serif`;
        ctx.fillText(isStart ? 'START' : 'END', p.x, p.y - r - 8);
      }
    }
  }
}

function loadWorldTopo() {
  // Load 110m first (fast, ~60KB) for the animation crossfade
  if (!worldTopoCache && !worldTopoLoading) {
    worldTopoLoading = true;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
      .then(r => r.json())
      .then(topo => {
        worldTopoCache = topo;
        worldTopoLoading = false;
        if (geoT === 1 && !geoAnimating) redrawGeoMap();
      })
      .catch(() => { worldTopoLoading = false; });
  }
  // Load 50m in parallel (~200KB) for the crisp final map
  if (!worldTopo50Cache && !worldTopo50Loading) {
    worldTopo50Loading = true;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json')
      .then(r => r.json())
      .then(topo => {
        worldTopo50Cache = topo;
        worldTopo50Loading = false;
        if (geoT === 1 && !geoAnimating) redrawGeoMap();
      })
      .catch(() => { worldTopo50Loading = false; });
  }
}

function startGeoAnimation() {
  if (geoAnimHandle) cancelAnimationFrame(geoAnimHandle);
  geoAnimating = true;
  geoT = 0;
  loadWorldTopo(); // kick off fetch early — gives ~2s to arrive before animation ends
  const vp = getRouteViewport(currentRoute);
  geoRot = -vp.centerLng;
  const SPIN_DURATION = 700, ZOOM_DURATION = 1800, TOTAL = SPIN_DURATION + ZOOM_DURATION;
  let startTime = null;
  function frame(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;
    if (elapsed < SPIN_DURATION) {
      geoRot = -vp.centerLng + (1 - elapsed / SPIN_DURATION) * 60;
      geoT   = 0;
    } else {
      const zE  = elapsed - SPIN_DURATION;
      const raw = Math.min(1, zE / ZOOM_DURATION);
      geoT = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      geoRot = (-vp.centerLng) * (1 - geoT);
    }
    drawGeoMap(geoT, geoRot);
    if (elapsed < TOTAL) {
      geoAnimHandle = requestAnimationFrame(frame);
    } else {
      geoT = 1; geoAnimating = false;
      loadWorldTopo();
      drawGeoMap(1, 0);
    }
  }
  geoAnimHandle = requestAnimationFrame(frame);
}

function stopGeoAnimation() {
  if (geoAnimHandle) cancelAnimationFrame(geoAnimHandle);
  geoAnimHandle = null; geoAnimating = false;
}

function redrawGeoMap() {
  if (geoAnimating) return;
  drawGeoMap(1, 0);
}

function routeScoreBadge(routeId) {
  const entry = [...history].reverse().find(h => h.id === routeId);
  if (!entry) return '';
  const perfect = entry.score === entry.total;
  const col = perfect ? '#4ade80' : '#f87171';
  const bg  = perfect ? 'rgba(22,101,52,0.85)' : 'rgba(127,29,29,0.85)';
  const icon = perfect ? '✓' : '✕';
  return `<div style="
    position:absolute;bottom:8px;right:10px;
    display:flex;align-items:center;gap:4px;
    padding:3px 7px;border-radius:6px;
    background:${bg};border:1.5px solid ${col};
    font-size:0.68rem;font-weight:700;color:${col};line-height:1;
    pointer-events:none;
  ">${icon} ${entry.score}/${entry.total}</div>`;
}

function routeMiniSVG(r) {
  const lats=r.slots.map(s=>s.lat), lngs=getDisplayLngs(r);
  const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
  const cosLat=Math.cos(((minLat+maxLat)/2*Math.PI)/180);
  const sc=Math.min(52/((maxLng-minLng||1)*cosLat),34/(maxLat-minLat||1));
  const cx2=(minLng+maxLng)/2, cy2=(minLat+maxLat)/2;
  const pts=r.slots.map((s,i)=>({x:36+(lngs[i]-cx2)*cosLat*sc, y:24-(s.lat-cy2)*sc}));
  const d=pts.map((p,j)=>`${j===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return `<svg width="72" height="48" viewBox="0 0 72 48" style="flex-shrink:0">
    <path d="${d}" fill="none" stroke="rgba(125,211,252,0.4)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="4 3"/>
    ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="rgba(125,211,252,0.55)"/>`).join("")}
  </svg>`;
}

function frozenRowHTML(gh, guessNum) {
  const FB_BG = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.bg]));
  const FB_BD = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.border]));
  const FB_IC = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.icon]));
  const correct = Object.values(gh.feedback).filter(f => f === "correct").length;
  const scoreCol = correct === currentRoute.stop_count ? "#4ade80" : "#7dd3fc";
  return `<div class="frozen-row">
    <div class="frozen-label">
      <span style="font-size:0.72rem;font-weight:500;color:${scoreCol};">${correct}/${currentRoute.stop_count}</span>
    </div>
    <div class="frozen-thumbs">
      ${Array.from({length: currentRoute.stop_count}, (_, i) => {
        const card = gh.assignments[i], fb = gh.feedback[i];
        const bd = fb ? FB_BD[fb] : "rgba(255,255,255,0.1)";
        const bg = fb ? FB_BG[fb] : "rgba(255,255,255,0.03)";
        return `<div style="position:relative;width:36px;height:28px;border-radius:5px;border:1.5px solid ${bd};background:${bg};overflow:hidden;flex-shrink:0;">
          ${card ? `<img src="${card.photo}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"/>` :
            `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:10px;color:rgba(255,255,255,0.15);">${i+1}</div>`}
          ${fb ? `<div style="position:absolute;bottom:1px;right:1px;width:11px;height:11px;border-radius:50%;background:${FB_BD[fb]};display:flex;align-items:center;justify-content:center;font-size:0.45rem;font-weight:700;color:#000;line-height:1;">${FB_IC[fb]}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
    <div class="frozen-guess-label">Guess ${guessNum}</div>
  </div>`;
}


/* ═══════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════ */
function render() {
  const app      = document.getElementById("app");
  const navRight = document.getElementById("nav-right");
  const navEl    = document.querySelector('.nav');

  // ── Nav: merged into single bar during play ──
  if (screen === "play") {
    const guessNum = guessHistory.length + 1;
    const pipsHTML = Array.from({length:MAX_GUESSES},(_,i)=>{
      let cls = "pip";
      if (i < guessHistory.length) {
        const gh = guessHistory[i];
        const c  = Object.values(gh.feedback).filter(f=>f==="correct").length;
        cls += c === currentRoute.stop_count ? " correct" : " used";
      }
      return `<div class="${cls}"></div>`;
    }).join("");

    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) {
      navBrand.querySelectorAll('.nav-divider, .nav-route-name').forEach(el => el.remove());
      const divider = document.createElement('div');
      divider.className = 'nav-divider';
      const routeName = document.createElement('span');
      routeName.className = 'nav-route-name';
      routeName.textContent = currentRoute.name;
      navBrand.appendChild(divider);
      navBrand.appendChild(routeName);
    }

    navRight.innerHTML = `
      <button class="btn-ghost ob-nav-htp-btn" id="nav-htp" style="margin-right:6px;">? How to play</button>
      <button class="btn-ghost" id="nav-back">← Back</button>
    `;
    navRight.querySelector('#nav-back').addEventListener('click', goBack);
    navRight.querySelector('#nav-htp').addEventListener('click', () => {
      if (typeof window.openHowToPlay === 'function') window.openHowToPlay();
    });

    // Sub-line as its own row below the nav
    let subLine = document.getElementById('nav-sub-line');
    if (!subLine) {
      subLine = document.createElement('div');
      subLine.id = 'nav-sub-line';
      navEl.parentNode.insertBefore(subLine, navEl.nextSibling);
    }
    subLine.className = 'nav-sub-line';
    subLine.innerHTML = `${currentRoute.region} · ${currentRoute.stop_count} stops · ${currentRoute.decoy_count} decoys · Guess ${guessNum} of ${MAX_GUESSES} <span class="nav-pips">${pipsHTML}</span>`;

    if (navEl) navEl.classList.add('nav-play-mode');
  } else if (screen === "home") {
    navRight.innerHTML = `<button class="btn-ghost" id="nav-core">Grand Adventures</button>`;
    navRight.querySelector('#nav-core').addEventListener('click', () => { screen='core'; render(); });
    if (navEl) navEl.classList.remove('nav-play-mode');
    document.querySelectorAll('.nav-brand .nav-divider, .nav-brand .nav-route-name').forEach(el => el.remove());
    document.getElementById('nav-sub-line')?.remove();
  } else if (screen === "core") {
    navRight.innerHTML = `<button class="btn-ghost" id="nav-home">← Home</button>`;
    navRight.querySelector('#nav-home').addEventListener('click', () => closeOverlay());
    if (navEl) navEl.classList.remove('nav-play-mode');
  } else if (screen === "winter") {
    navRight.innerHTML = `<button class="btn-ghost" id="nav-home">← Home</button>`;
    navRight.querySelector('#nav-home').addEventListener('click', () => closeOverlay());
    if (navEl) navEl.classList.remove('nav-play-mode');
  } else {
    navRight.innerHTML = `<button class="btn-ghost" id="nav-back">← Back</button>`;
    navRight.querySelector('#nav-back').addEventListener('click', goBack);
    if (navEl) navEl.classList.remove('nav-play-mode');
  }

  // ── HOME ──
  if (screen === "home") {
    if (!routesLoaded) {
      app.innerHTML = `<div style="text-align:center;padding:80px 24px;color:var(--text-2);">Loading routes…</div>`;
      return;
    }
    const daily = dailyRoute;
    const core  = allRoutes.filter(r => r.id !== daily.id);
    let scoresHTML = "";
    if (history.length > 0) {
      scoresHTML = `<div class="scores-panel" style="margin:36px auto 0;">
        <div class="scores-title">Recent</div>
        ${history.slice(-5).reverse().map(h=>`<div class="scores-row"><span>${h.route}</span><span style="color:${h.score===h.total?"#4ade80":"#7dd3fc"};font-weight:500">${h.score}/${h.total}</span></div>`).join("")}
      </div>`;
    }
    app.innerHTML = `
      <div class="home-hero">
        <div class="home-eyebrow">Daily Route · ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
        <h1 class="home-title">Where will <em>you go</em> today?</h1>
        <p class="home-desc">Six stops. No place names. Sort the photos in order — watch out for decoys.</p>
      </div>
      <div class="daily-card">
        <div class="daily-badge"><span></span>Today's Route</div>
        <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div class="daily-route-name">${daily.name}</div>
            <div class="daily-meta">${daily.region} · ${daily.stop_count} stops · ${daily.decoy_count} decoys · 3 guesses</div>
            <div class="daily-actions">
              <button class="btn-play" id="btn-daily-play">Start Today's Route →</button>
            </div>
          </div>
          <div style="flex-shrink:0;opacity:0.7;">${routeMiniSVG(daily)}</div>
        </div>
      </div>
      <div class="section-label">Archive</div>
      <div class="route-grid">
        ${core.map(r => `<button class="route-btn" data-route="${r.id}">${routeMiniSVG(r)}<div><div class="rname">${r.name}</div><div class="rmeta">${r.region} · ${r.stop_count} stops</div></div></button>`).join("")}
      </div>
      ${scoresHTML}`;
    document.getElementById("btn-daily-play").addEventListener("click", () => startGame(daily, "home"));
    document.querySelectorAll(".route-btn").forEach(btn => {
      const r = allRoutes.find(r => r.id === btn.dataset.route);
      if (r) btn.addEventListener("click", () => startGame(r, "home"));
    });
    return;
  }

  // ── GRAND ADVENTURES ──
  if (screen === "core") {
    const grandRoutes = allRoutes.filter(r => r.pack === 'grand');
    let grandBody;
    if (grandRoutes.length === 0) {
      grandBody = '<div style="margin-top:48px;text-align:center;padding:48px 24px;border:1px solid rgba(255,255,255,0.07);border-radius:18px;background:rgba(255,255,255,0.025);">'
        + '<div style="font-size:1.6rem;margin-bottom:16px;">🌍</div>'
        + '<div style="font-family:\'Playfair Display\',serif;font-size:1.1rem;font-weight:500;margin-bottom:10px;">Routes coming soon</div>'
        + '<div style="font-size:0.82rem;color:var(--text-2);font-weight:300;max-width:32ch;margin:0 auto;line-height:1.6;">We\'re building something special. Check back soon.</div>'
        + '</div>';
    } else {
      grandBody = '<div class="section-label">Grand Adventures</div><div class="route-grid">'
        + grandRoutes.map(r =>
            `<button class="route-btn" data-route="${r.id}">${routeMiniSVG(r)}<div><div class="rname">${r.name}</div><div class="rmeta">${r.region} · ${r.stop_count} stops · ${r.decoy_count} decoys</div></div>${routeScoreBadge(r.id)}</button>`
          ).join('') + '</div>';
    }
    app.innerHTML = '<div style="margin-bottom:28px;">'
      + '<div class="home-eyebrow" style="text-align:left;margin-bottom:10px;">Pack</div>'
      + '<h2 style="font-family:\'Playfair Display\',serif;font-size:1.8rem;font-weight:500;letter-spacing:-0.01em;">Grand Adventures</h2>'
      + '<p style="font-size:0.85rem;color:var(--text-2);font-weight:300;margin-top:6px;">To get your bearings, a collection of globe-spanning adventures built around the world\'s most recognizable places.</p>'
      + '</div>' + grandBody;
    document.querySelectorAll(".route-btn").forEach(btn => {
      const r = allRoutes.find(r => r.id === btn.dataset.route);
      if (r) btn.addEventListener("click", () => startGame(r, "core"));
    });
    return;
  }

  // ── WINTER 2024 ──
  if (screen === "winter") {
    const winterRoutes = allRoutes.filter(r => r.pack === 'winter');
    app.innerHTML = `
      <div style="margin-bottom:28px;">
        <div class="home-eyebrow" style="text-align:left;margin-bottom:10px;">Archive</div>
        <h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:500;letter-spacing:-0.01em;">Archive</h2>
        <p style="font-size:0.85rem;color:var(--text-2);font-weight:300;margin-top:6px;">Past daily routes and regional classics.</p>
      </div>
      <div class="section-label">All Routes</div>
      <div class="route-grid">
        ${winterRoutes.map(r=>`<button class="route-btn" data-route="${r.id}">${routeMiniSVG(r)}<div><div class="rname">${r.name}</div><div class="rmeta">${r.region} · ${r.stop_count} stops · ${r.decoy_count} decoys</div></div>${routeScoreBadge(r.id)}</button>`).join("")}
      </div>`;
    document.querySelectorAll(".route-btn").forEach(btn => {
      const r = allRoutes.find(r => r.id === btn.dataset.route);
      if (r) btn.addEventListener("click", () => startGame(r, "winter"));
    });
    return;
  }

  // ── PLAY ──
  const confirmedDecoyIds = new Set();
  guessHistory.forEach(gh => {
    Object.entries(gh.feedback).forEach(([si, fb]) => {
      if (fb === "decoy") { const c = gh.assignments[si]; if (c) confirmedDecoyIds.add(c.id); }
    });
  });
  confirmedDecoyIdsGlobal = confirmedDecoyIds;

  const filled   = allSlotsFilled();
  const guessNum = guessHistory.length + 1;

  // ── Photo grid (v16: ordered by gridOrder, separator after placed zone) ──
  const lastGuess      = guessHistory.length > 0 ? guessHistory[guessHistory.length - 1] : null;
  const lastPlacedIds  = lastGuess
    ? new Set(Array.from({ length: currentRoute.stop_count }, (_, i) => lastGuess.assignments[i]?.id).filter(Boolean))
    : new Set();
  const lastGuessStopOf = {};
  if (lastGuess) {
    Object.entries(lastGuess.assignments).forEach(([si, card]) => {
      if (card) lastGuessStopOf[card.id] = parseInt(si);
    });
  }

  function renderPhotoCard(c, inOrderedZone) {
    const isDecoyElim = confirmedDecoyIds.has(c.id);
    const placedSlot  = Object.entries(assignments).find(([, a]) => a.id === c.id);
    const slotIdx     = placedSlot ? parseInt(placedSlot[0]) : -1;
    const isPlaced    = slotIdx !== -1;
    const locked      = isPlaced && slotIsLocked(slotIdx);
    const isSelected  = selectedCard?.id === c.id;

    let borderCol;
    if (isDecoyElim)     borderCol = 'rgba(248,113,113,0.3)';
    else if (locked)     borderCol = '#4ade80';
    else if (isSelected) borderCol = 'var(--cyan)';
    else if (isPlaced)   borderCol = 'rgba(125,211,252,0.5)';
    else                 borderCol = 'var(--border)';

    const opacity = isDecoyElim ? 0.38 : 1;
    const scale   = isSelected  ? 'transform:scale(1.04);' : isPlaced ? 'transform:scale(0.96);' : '';
    const cursor  = (locked || isDecoyElim) ? 'default' : 'pointer';

    const badgeContent = locked
      ? `<div class="photo-badge" style="background:rgba(22,101,52,0.9);border-color:#4ade80;"><span style="color:#4ade80;">✓</span></div>`
      : isPlaced
        ? `<div class="photo-badge" style="background:rgba(6,10,18,0.85);border-color:rgba(125,211,252,0.6);"><span style="color:var(--cyan);font-family:'Playfair Display',serif;">${slotIdx + 1}</span></div>`
        : isDecoyElim
          ? `<div class="photo-badge" style="background:rgba(127,29,29,0.85);border-color:#f87171;"><span style="color:#f87171;font-size:0.7rem;">✗</span></div>`
          : '';

    let histBadge = '';
    if (inOrderedZone && lastGuess && lastGuessStopOf[c.id] !== undefined) {
      const histSlot = lastGuessStopOf[c.id];
      const histFb   = lastGuess.feedback[histSlot];
      if (histFb) {
        const fb = FEEDBACK[histFb];
        const bgMap  = { correct: 'rgba(22,101,52,0.9)', wrong_slot: 'rgba(113,63,18,0.9)', decoy: 'rgba(127,29,29,0.9)' };
        const colMap = { correct: '#4ade80',             wrong_slot: '#facc15',              decoy: '#f87171'             };
        histBadge = `<div style="position:absolute;top:5px;left:5px;z-index:6;
          display:flex;align-items:center;gap:2px;padding:2px 5px 2px 4px;border-radius:5px;
          background:${bgMap[histFb]};border:1.5px solid ${colMap[histFb]};
          font-size:0.6rem;font-weight:700;color:${colMap[histFb]};line-height:1;pointer-events:none;">
          <span>${fb.icon}</span><span style="opacity:0.85;">${histSlot + 1}</span>
        </div>`;
      }
    }

    const selectedRing = isSelected
      ? `<div style="position:absolute;inset:-3px;border-radius:17px;border:2px solid var(--cyan);animation:pin-pulse 1s ease-in-out infinite;pointer-events:none;"></div>`
      : '';

    return `<div class="tap-card" data-id="${c.id}"
      style="position:relative;border-radius:14px;overflow:visible;
             opacity:${opacity};cursor:${cursor};${scale}transition:transform 0.15s,opacity 0.2s;">
      <div style="position:absolute;inset:0;border-radius:14px;overflow:hidden;z-index:1;
                  border:2px solid ${borderCol};transition:border-color 0.15s;
                  box-shadow:${isSelected ? '0 0 16px rgba(125,211,252,0.35)' : 'none'};">
        <img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"
             onerror="this.style.display='none'"/>
        ${isDecoyElim ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>` : ''}
      </div>
      ${selectedRing}
      ${histBadge}
      ${badgeContent}
      <button class="expand-btn photo-expand-btn" data-expand="${cards.indexOf(c)}" aria-label="Expand" style="z-index:5;" onclick="event.stopPropagation();openLightbox(${cards.indexOf(c)})">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="rgba(240,239,245,0.7)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  }

  let photoGridHTML = '';
  const separatorInjected = { done: false };
  gridOrder.forEach(id => {
    const c = cards.find(card => card.id === id);
    if (!c) return;
    const inOrderedZone = lastPlacedIds.has(id);
    if (!inOrderedZone && !separatorInjected.done && lastGuess && lastPlacedIds.size > 0) {
      separatorInjected.done = true;
      photoGridHTML += `<div class="grid-zone-separator" style="
        grid-column: 1 / -1;
        display: flex; align-items: center; gap: 8px;
        padding: 4px 0 2px;
        font-size: 0.62rem; font-weight: 500; letter-spacing: 0.08em;
        text-transform: uppercase; color: rgba(140,148,172,0.6);
      ">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div>
        <span>not used last guess</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div>
      </div>`;
    }
    photoGridHTML += renderPhotoCard(c, inOrderedZone);
  });

  // Instruction text
  let instruction;
  if (selectedCard) {
    instruction = `<span style="color:var(--cyan);">Photo</span> selected — tap a pin to place it`;
  } else if (filled) {
    instruction = 'All stops placed — submit when ready';
  } else {
    const placed = Object.keys(assignments).length;
    instruction = placed === 0 ? 'Tap a photo, then tap a numbered pin on the map' : `${placed} of ${currentRoute.stop_count} placed — keep going`;
  }

  // Past guesses
  const historyHTML = guessHistory.length > 0
    ? `<div class="panel panel-padded guess-history-panel">
        <div class="frozen-rows-wrap">
          ${[...guessHistory].map((gh, i) => frozenRowHTML(gh, i + 1)).join("")}
        </div>
       </div>`
    : "";

  // ── Completion screen ──
  let completionHTML = "";
  if (revealed && revealData) {
    const won = score === currentRoute.stop_count;
    const guessUsed = guessHistory.length;
    const isDaily = playSource === 'home';
    const perfLabel = won
      ? guessUsed === 1 ? 'Perfect' : guessUsed === 2 ? 'Sharp' : 'Solid'
      : score >= currentRoute.stop_count * 0.75 ? 'Close' : score >= currentRoute.stop_count * 0.5 ? 'Halfway' : 'Rough road';
    const perfColor = won ? '#4ade80' : score >= currentRoute.stop_count / 2 ? '#7dd3fc' : '#f87171';

    // Guess history rows with visual photo cells
    const FB_BG_C = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.bg.replace("0.3","0.45").replace("0.35","0.45")]));
    const FB_BD_C = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.border]));
    const FB_IC_C = Object.fromEntries(Object.entries(FEEDBACK).map(([k,v]) => [k, v.icon]));
    const guessHistoryHTML = guessHistory.map((gh, gi) => {
      const guessCorrect = Object.values(gh.feedback).filter(f => f === "correct").length;
      const guessScoreColor = guessCorrect === currentRoute.stop_count ? '#4ade80' : guessCorrect > 0 ? '#7dd3fc' : '#f87171';
      const cells = Array.from({ length: currentRoute.stop_count }, (_, i) => {
        const card = gh.assignments[i];
        const fb = gh.feedback[i];
        const bd = fb ? FB_BD_C[fb] : "rgba(255,255,255,0.1)";
        const bg = fb ? FB_BG_C[fb] : "rgba(255,255,255,0.03)";
        const icon = fb ? FB_IC_C[fb] : '';
        const iconBg = fb ? FB_BD_C[fb] : 'transparent';
        return `<div class="drc-guess-cell" style="border:1.5px solid ${bd};background:${bg};">
          ${card ? `<img src="${card.photo}" onerror="this.style.display='none'"/>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.7rem;color:rgba(255,255,255,0.15);">${i + 1}</div>`}
          ${fb ? `<div class="drc-cell-overlay"><div class="drc-cell-icon" style="background:${iconBg};">${icon}</div></div>` : ''}
        </div>`;
      }).join('');
      return `<div class="drc-guess-row">
        <div class="drc-guess-header">
          <div class="drc-guess-label">Guess ${gi + 1} of ${MAX_GUESSES}</div>
          <div class="drc-guess-score" style="color:${guessScoreColor};">${guessCorrect}/${currentRoute.stop_count}</div>
        </div>
        <div class="drc-guess-cells">${cells}</div>
      </div>`;
    }).join('');

    // Share emoji grid
    const shareEmoji = guessHistory.map(gh =>
      Array.from({ length: currentRoute.stop_count }, (_, i) => {
        const fb = gh.feedback[i];
        return FEEDBACK[fb]?.emoji ?? "⬜";
      }).join("")
    ).join("\n");

    // Streak metric — only for daily (home) plays
    const streakMetric = isDaily ? `
      <div class="drc-metric-divider"></div>
      <div class="drc-metric">
        <div class="drc-metric-val">—</div>
        <div class="drc-metric-label">day streak</div>
      </div>` : '';

    // Final feedback for stop-list correctness
    const finalFeedback = guessHistory.length > 0 ? guessHistory[guessHistory.length - 1].feedback : {};

    // Stored reaction
    const reactionStored = (loadStopFlags()['__route__' + currentRoute.id] || {}).reaction;

    completionHTML = `<div class="completion-layout">
      <!-- Map hero -->
      <div class="drc-map-wrap"><div id="leaflet-map"></div></div>

      <!-- Perf band fused to map bottom -->
      <div class="drc-perf-band">
        <div class="drc-perf" style="color:${perfColor}">${perfLabel}</div>
        <div class="drc-metrics">
          <div class="drc-metric">
            <div class="drc-metric-val">${guessUsed}<span class="drc-metric-of">/${MAX_GUESSES}</span></div>
            <div class="drc-metric-label">guesses</div>
          </div>
          <div class="drc-metric-divider"></div>
          <div class="drc-metric">
            <div class="drc-metric-val">${score}<span class="drc-metric-of">/${currentRoute.stop_count}</span></div>
            <div class="drc-metric-label">correct</div>
          </div>
          ${streakMetric}
        </div>
      </div>

      <!-- Guess history -->
      <div class="drc-guess-history">${guessHistoryHTML}</div>

      <!-- Share row -->
      <div class="drc-share-row">
        <div class="drc-share-grid">${shareEmoji}</div>
        <button class="drc-share-copy" id="btn-copy">Copy</button>
      </div>

      <!-- Stop list -->
      <div class="drc-stop-list">
        ${revealData.stops.map((s, i) => {
          const correct = finalFeedback[i] === "correct";
          return `<div class="drc-stop-item">
            <div class="drc-stop-img-wrap">
              <img src="${s.photo}" class="drc-stop-img" alt=""/>
              <div class="drc-stop-badge ${correct ? 'drc-badge-correct' : 'drc-badge-wrong'}">${correct ? '✓' : '✗'}</div>
            </div>
            <div class="drc-stop-details">
              <div class="drc-stop-num-label">Stop ${i + 1}</div>
              <div class="drc-stop-name-label">${s.name}</div>
              ${!correct && finalFeedback[i] !== undefined ? `<div class="drc-stop-your-guess">not placed correctly</div>` : ''}
              ${finalFeedback[i] === undefined ? `<div class="drc-stop-your-guess">not answered</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="drc-decoys">Decoys: ${revealData.decoy_names.join(', ')}</div>

      <!-- Route blurb -->
      ${revealData.blurb ? `<div class="drc-fact"><div class="drc-fact-text">${revealData.blurb}</div></div>` : ''}

      <!-- Reactions -->
      <div class="drc-reaction-prompt">Have you been here?</div>
      <div class="drc-reactions">
        ${[
          { type: 'bucket',       icon: '🌟', label: 'Bucket list — adding it to my list'  },
          { type: 'progress',     icon: '🗺️', label: 'In progress — still exploring'        },
          { type: 'accomplished', icon: '✈️', label: 'Mission accomplished — been there'    },
        ].map(({ type, icon, label }) => `
          <button class="drc-reaction ${reactionStored === type ? 'drc-reaction-active' : ''}" data-reaction="${type}">
            <span class="drc-reaction-icon">${icon}</span>
            <span class="drc-reaction-label">${label}</span>
            <span class="drc-reaction-check">✓</span>
          </button>`).join('')}
      </div>

      <!-- Actions -->
      <div class="drc-actions">
        <button class="btn-retry" id="btn-retry">Retry</button>
        <button class="btn-menu" id="btn-menu">← Back</button>
      </div>
    </div>`;
  }

  // Map panel — play mode only (completion has its own map inside completionHTML)
  const mapContentHTML = `<div style="padding:6px">
       <div id="map-canvas-wrapper" style="position:relative;width:100%;">
         <div id="route-canvas-slot" style="padding:0 10px 8px;position:relative;"></div>
       </div>
     </div>`;

  // Desktop photo panel (3-col grid)
  const photoPanelHTML = `
    <div class="panel panel-padded photo-panel" id="photo-panel">
      <div class="tap-grid tap-grid-desktop" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
        ${photoGridHTML}
      </div>
    </div>`;

  // ── Mobile tray ──
  const mobileFeaturedCard = resolveMobileFeatured();
  const mobileTrayHTML = (() => {
    if (!mobileFeaturedCard) return '';
    const fc = mobileFeaturedCard;
    const fcIsElim    = confirmedDecoyIds.has(fc.id);
    const fcIsUserDecoy = userFlaggedDecoys.has(fc.id);
    const fcPlacedEntry = Object.entries(assignments).find(([, a]) => a.id === fc.id);
    const fcSlotIdx   = fcPlacedEntry ? parseInt(fcPlacedEntry[0]) : -1;
    const fcIsPlaced  = fcSlotIdx !== -1;
    const fcLocked    = fcIsPlaced && slotIsLocked(fcSlotIdx);
    const fcIsSelected = selectedCard?.id === fc.id;

    // Featured border + overlay
    let featBorder, featOverlayHTML = '', featHint = '';
    if (fcLocked) {
      featBorder = '#4ade80';
      featOverlayHTML = `<div class="mt-feat-overlay mt-feat-locked">
        <div class="mt-feat-badge mt-badge-locked">✓ Locked in at stop ${fcSlotIdx + 1}</div>
      </div>`;
    } else if (fcIsElim) {
      featBorder = '#f87171';
      featOverlayHTML = `<div class="mt-feat-overlay mt-feat-elim">
        <div class="mt-feat-badge mt-badge-elim">✗ Decoy eliminated</div>
      </div>`;
    } else if (fcIsUserDecoy) {
      featBorder = '#fb923c';
      featOverlayHTML = `<div class="mt-feat-overlay mt-feat-userdecoy">
        <div class="mt-feat-badge mt-badge-userdecoy">DECOY?</div>
        <button class="mt-unflag-btn" data-unflag="${fc.id}">✕ unflag</button>
      </div>`;
    } else if (fcIsPlaced) {
      featBorder = 'rgba(125,211,252,0.5)';
      featOverlayHTML = `<div class="mt-feat-overlay mt-feat-placed">
        <div class="mt-feat-badge mt-badge-placed">placed at stop ${fcSlotIdx + 1}</div>
      </div>`;
    } else if (fcIsSelected) {
      featBorder = 'var(--cyan)';
      featHint = `<div class="mt-feat-hint">tap a pin on the map →</div>`;
      featOverlayHTML = `<div class="mt-feat-overlay mt-feat-selected"></div>`;
    } else {
      featBorder = 'var(--border)';
    }

    // Decoy flag button — shown when not locked, not already flagged, not eliminated
    const decoyBtnHTML = (!fcLocked && !fcIsElim && !fcIsUserDecoy && !fcIsPlaced)
      ? `<button class="mt-decoy-btn" data-decoy-flag="${fc.id}">decoy?</button>` : '';

    // Expand button
    const featIdx = cards.indexOf(fc);
    const expandBtn = `<button class="mt-expand-btn" onclick="event.stopPropagation();openLightbox(${featIdx})" aria-label="Expand">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="rgba(240,239,245,0.7)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;

    // Thumbnail strip — ordered by gridOrder (same sort as desktop grid after a guess)
    // Historical feedback color is derived from the last guess for each card in the placed zone.
    const lastGuessForThumb = guessHistory.length > 0 ? guessHistory[guessHistory.length - 1] : null;
    const lastFbOfThumb = {};
    const lastSlotOfThumb = {};  // card.id → stop index (1-based) in last guess
    if (lastGuessForThumb) {
      Object.entries(lastGuessForThumb.assignments).forEach(([si, card]) => {
        if (card) {
          lastFbOfThumb[card.id] = lastGuessForThumb.feedback[parseInt(si)];
          lastSlotOfThumb[card.id] = parseInt(si) + 1;  // 1-based stop number
        }
      });
    }
    const lastPlacedIdsForThumb = lastGuessForThumb
      ? new Set(Object.values(lastGuessForThumb.assignments).filter(Boolean).map(c => c.id))
      : new Set();

    const thumbsHTML = gridOrder.map(id => {
      const c = cards.find(card => card.id === id);
      if (!c) return '';
      const i = cards.indexOf(c);
      const tIsElim     = confirmedDecoyIds.has(c.id);
      const tIsUserDecoy = userFlaggedDecoys.has(c.id);
      const tPlaced     = Object.entries(assignments).find(([, a]) => a.id === c.id);
      const tSlotIdx    = tPlaced ? parseInt(tPlaced[0]) : -1;
      const tIsPlaced   = tSlotIdx !== -1;
      const tLocked     = tIsPlaced && slotIsLocked(tSlotIdx);
      const tIsSelected = selectedCard?.id === c.id;
      const tIsFeatured = c.id === fc.id;

      let cls = 'mt-thumb';
      if (tIsFeatured)  cls += ' mt-active';
      if (tIsSelected)  cls += ' mt-selected';
      if (tLocked)      cls += ' mt-locked';
      else if (tIsPlaced) cls += ' mt-picked';
      if (tIsElim)      cls += ' mt-elim';
      else if (tIsUserDecoy) cls += ' mt-user-decoy';
      // Historical feedback — compute before using in both border and dot badge
      const histFb   = lastPlacedIdsForThumb.has(c.id) ? lastFbOfThumb[c.id] : null;
      const histStop = lastSlotOfThumb[c.id] || '';
      // Historical feedback border (yellow/red) — applied when not already green or elim
      if (!tLocked && !tIsElim) {
        if (histFb === 'wrong_slot') cls += ' mt-hist-yellow';
        else if (histFb === 'decoy') cls += ' mt-hist-red';
      }

      // Dot badge: historical feedback (colored) takes priority for cards in the last placed zone;
      // current-state badges (locked ✓, placed ↑, elim ✗) used otherwise.
      // Historical badges also show the stop number from the last guess.
      let dotBadge = '';
      if (histFb === 'correct') {
        dotBadge = `<div class="mt-dot-badge mt-dot-locked">✓${histStop}</div>`;
      } else if (histFb === 'wrong_slot') {
        dotBadge = `<div class="mt-dot-badge mt-dot-wrongslot">${histStop}</div>`;
      } else if (histFb === 'decoy') {
        dotBadge = `<div class="mt-dot-badge mt-dot-elim">✗</div>`;
      } else if (tLocked) {
        dotBadge = `<div class="mt-dot-badge mt-dot-locked">✓</div>`;
      } else if (tIsPlaced) {
        dotBadge = `<div class="mt-dot-badge mt-dot-placed">↑</div>`;
      } else if (tIsElim) {
        dotBadge = `<div class="mt-dot-badge mt-dot-elim">✗</div>`;
      }

      return `<div class="${cls}" data-mt-thumb="${c.id}" data-mt-idx="${i}">
        <img src="${c.photo}" alt="" draggable="false"/>
        ${dotBadge}
      </div>`;
    }).join('');

    return `<div class="mt-tray panel" id="mt-tray">
      <div class="mt-featured-wrap" id="mt-featured-wrap">
        <div class="mt-featured tap-card" data-id="${fc.id}"
             style="border-color:${featBorder};${fcIsSelected ? 'box-shadow:0 0 20px rgba(125,211,252,0.35);' : ''}">
          <img src="${fc.photo}" alt="" draggable="false"/>
          ${featOverlayHTML}
          ${featHint}
          ${decoyBtnHTML}
          ${expandBtn}
        </div>
      </div>
      <div class="mt-strip" id="mt-strip">
        ${thumbsHTML}
      </div>
    </div>`;
  })();

  // Layout
  if (revealed) {
    app.innerHTML = completionHTML;
  } else if (isLandscape) {
    app.innerHTML = `
      <div class="play-landscape-row">
        <div class="play-col-map">
          <div class="map-panel landscape-map-panel" id="map-panel">
            ${mapContentHTML}
          </div>
        </div>
        <div class="play-col-photos">
          ${photoPanelHTML}
          <div id="ob-hint-slot"></div>
          ${historyHTML}
        </div>
      </div>`;
  } else if (isMobile()) {
    app.innerHTML = `
      <div class="map-panel" id="map-panel">
        ${mapContentHTML}
      </div>
      ${mobileTrayHTML}
      <div id="ob-hint-slot"></div>
      ${historyHTML}`;
  } else {
    app.innerHTML = `
      <div class="play-desktop-row">
        <div class="play-desktop-map">
          <div class="map-panel" id="map-panel">
            ${mapContentHTML}
          </div>
        </div>
        <div>
          ${photoPanelHTML}
          <div id="ob-hint-slot"></div>
          ${historyHTML}
        </div>
      </div>`;
  }

  // Floating submit button — inject once, update on every render
  let floatWrap = document.getElementById('floating-submit');
  if (!floatWrap) {
    floatWrap = document.createElement('div');
    floatWrap.id = 'floating-submit';
    floatWrap.className = 'floating-submit';
    floatWrap.innerHTML = `
      <button class="floating-submit-btn" id="floating-submit-btn">
        Submit Guess ${guessNum} <span class="floating-submit-arrow">→</span>
      </button>`;
    document.getElementById('game-overlay').appendChild(floatWrap);
    document.getElementById('floating-submit-btn').addEventListener('click', async () => {
      if (allSlotsFilled()) await checkAnswers();
    });
  } else {
    // Update label for subsequent guesses
    const fbtn = document.getElementById('floating-submit-btn');
    if (fbtn) fbtn.innerHTML = `Submit Guess ${guessNum} <span class="floating-submit-arrow">→</span>`;
  }
  // Show/hide based on whether all slots are filled
  if (filled && !revealed) {
    floatWrap.classList.add('visible');
  } else {
    floatWrap.classList.remove('visible');
  }

  // Events
  document.getElementById("btn-retry")?.addEventListener("click",  () => startGame(currentRoute, playSource));
  document.getElementById("btn-menu")?.addEventListener("click",   goBack);
  document.getElementById("btn-copy")?.addEventListener("click",   function() {
    const shareEmoji = guessHistory.map(gh =>
      Array.from({ length: currentRoute.stop_count }, (_, i) => {
        const fb = gh.feedback[i];
        return FEEDBACK[fb]?.emoji ?? "⬜";
      }).join("")
    ).join("\n");
    const txt = `Roamer: ${currentRoute.name}\n${shareEmoji}`;
    navigator.clipboard.writeText(txt).then(() => { this.textContent = "Copied!"; });
  });
  // Route reaction buttons
  document.querySelectorAll('.drc-reaction').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.reaction;
      const key = '__route__' + currentRoute.id;
      const flags = loadStopFlags();
      if (!flags[key]) flags[key] = {};
      flags[key].reaction = flags[key].reaction === type ? null : type;
      saveStopFlags(flags);
      document.querySelectorAll('.drc-reaction').forEach(b => {
        b.classList.toggle('drc-reaction-active', b.dataset.reaction === flags[key].reaction);
      });
    });
  });

  document.querySelectorAll(".tap-card").forEach(el => {
    const id = el.dataset.id;
    const card = cards.find(c => c.id === id);
    if (!card) return;
    el.addEventListener("click", e => {
      if (e.target.closest('.expand-btn')) return;
      if (e.target.closest('.mt-decoy-btn')) return;
      if (e.target.closest('.mt-unflag-btn')) return;
      tapPhoto(card);
    });
  });

  // ── Mobile tray events ──
  // Thumbnail taps
  document.querySelectorAll('.mt-thumb').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.mtThumb;
      const card = cards.find(c => c.id === id);
      if (!card) return;
      mobileFeaturedName = id;
      const isElim = confirmedDecoyIdsGlobal.has(id);
      const placedEntry = Object.entries(assignments).find(([, a]) => a.id === id);
      const isLocked = placedEntry && slotIsLocked(parseInt(placedEntry[0]));
      if (!isElim && !isLocked) tapPhoto(card);
      else { render(); }
    });
  });

  // Decoy flag button
  document.querySelectorAll('.mt-decoy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.decoyFlag;
      userFlaggedDecoys.add(id);
      // If it was selected, deselect it
      if (selectedCard?.id === id) { selectedCard = null; redrawGeoMap(); }
      render();
    });
  });

  // Unflag button
  document.querySelectorAll('.mt-unflag-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.unflag;
      userFlaggedDecoys.delete(id);
      render();
    });
  });

  // Swipe on featured photo
  (function() {
    const wrap = document.getElementById('mt-featured-wrap');
    if (!wrap) return;
    let sx = 0, sy = 0;
    wrap.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 36) {
        const dir = dx < 0 ? 1 : -1;
        // Walk gridOrder in the swipe direction; skip greens (locked) and reds (confirmed decoy)
        const curIdx = gridOrder.indexOf(mobileFeaturedCard?.id);
        const n = gridOrder.length;
        let nextId = null;
        for (let i = 1; i <= n; i++) {
          const id = gridOrder[(curIdx + dir * i + n) % n];
          const c = cards.find(card => card.id === id);
          if (!c) continue;
          if (confirmedDecoyIdsGlobal.has(c.id)) continue;
          const placedEntry = Object.entries(assignments).find(([, a]) => a.id === c.id);
          if (placedEntry && slotIsLocked(parseInt(placedEntry[0]))) continue;
          nextId = id; break;
        }
        if (nextId) mobileFeaturedName = nextId;
        // Swiping = browsing: deselect armed card
        selectedCard = null;
        render();
        redrawGeoMap();
      }
    }, { passive: true });
  })();

  // Scroll active thumbnail into view
  requestAnimationFrame(() => {
    const strip = document.getElementById('mt-strip');
    const activeThumb = strip?.querySelector('.mt-active');
    if (activeThumb && strip) {
      const stripRect = strip.getBoundingClientRect();
      const thumbRect = activeThumb.getBoundingClientRect();
      const thumbCenter = thumbRect.left + thumbRect.width / 2 - stripRect.left + strip.scrollLeft;
      strip.scrollTo({ left: thumbCenter - strip.offsetWidth / 2, behavior: 'smooth' });
    }
  });

  // ── Reattach persistent canvas to the slot ──
  if (!revealed) {
    const slot = document.getElementById('route-canvas-slot');
    if (slot) {
      if (!window._persistCanvas) {
        const c = document.createElement('canvas');
        c.id = 'route-canvas';
        c.style.cssText = 'width:100%;aspect-ratio:1;height:auto;display:block;border-radius:10px;';
        window._persistCanvas = c;
      }
      slot.appendChild(window._persistCanvas);
    }
  }

  if (!revealed) {
    const canvas = document.getElementById('route-canvas');
    if (canvas) {
      canvas.removeEventListener('click', handleCanvasTap);
      canvas.removeEventListener('touchend', handleCanvasTap);
      canvas.addEventListener('click', handleCanvasTap);
      canvas.addEventListener('touchend', handleCanvasTap, { passive: false });
    }
    if (geoT === 0 && !geoAnimating) {
      setTimeout(() => startGeoAnimation(), 50);
    } else if (!geoAnimating) {
      redrawGeoMap();
    }
  }
}

// ── Boot ──
render();


/* ═══════════════════════════════════════════════════════
   OVERLAY & NAV WIRING
   ═══════════════════════════════════════════════════════ */
function openOverlay() {
  const overlay = document.getElementById('game-overlay');
  overlay.classList.add('active');
  overlay.scrollTop = 0;
  overlay.style.animation = 'none';
  requestAnimationFrame(() => { overlay.style.animation = ''; });
}
function closeOverlay() {
  const overlay = document.getElementById('game-overlay');
  overlay.classList.remove('active');
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
}
function goBack() {
  selectedCard = null;
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  const floatWrap = document.getElementById('floating-submit');
  if (floatWrap) floatWrap.classList.remove('visible');
  document.getElementById('nav-sub-line')?.remove();
  document.querySelectorAll('.nav-brand .nav-divider, .nav-brand .nav-route-name').forEach(el => el.remove());
  if (playSource === 'core') { screen = 'core'; render(); }
  else if (playSource === 'winter') { screen = 'winter'; render(); }
  else { updateLandingPageState(); closeOverlay(); }
}

document.getElementById('play-btn').addEventListener('click', function(e) {
  e.preventDefault();
  this.style.transform = 'scale(0.97)';
  setTimeout(() => { this.style.transform = ''; }, 150);
  openOverlay();
  if (routesLoaded && dailyRoute) {
    setTimeout(() => { startGame(dailyRoute, 'home'); }, 120);
  }
  // If routes aren't loaded yet, the overlay shows "Loading routes…" until fetchRoutes completes
});

document.querySelector('.cta-secondary a').addEventListener('click', function(e) {
  e.preventDefault();
  screen = 'core'; render(); openOverlay();
});

const packCards = document.querySelectorAll('.pack-card');
if (packCards[0]) packCards[0].addEventListener('click', function() { screen = 'core'; render(); openOverlay(); });
if (packCards[1]) packCards[1].addEventListener('click', function() { screen = 'winter'; render(); openOverlay(); });

render();


/* ═══════════════════════════════════════════════════════
   API FETCH
   ═══════════════════════════════════════════════════════ */
async function fetchRoutes() {
  try {
    const [dailyResp, allResp] = await Promise.all([
      fetch(`${API_BASE}/api/v1/routes/daily`),
      fetch(`${API_BASE}/api/v1/routes`),
    ]);
    if (!dailyResp.ok || !allResp.ok) throw new Error('API error');
    dailyRoute   = await dailyResp.json();
    allRoutes    = await allResp.json();
    routesLoaded = true;
    // Update landing page card counts dynamically
    const grandCount  = allRoutes.filter(r => r.pack === 'grand').length;
    const recentCount = allRoutes.filter(r => r.pack === 'winter').length;
    const grandEl  = document.getElementById('grand-count');
    const recentEl = document.getElementById('recent-count');
    if (grandEl)  grandEl.textContent  = grandCount  === 1 ? '1 route'  : `${grandCount} routes`;
    if (recentEl) recentEl.textContent = recentCount === 1 ? '1 route'  : `${recentCount} routes`;
    updateLandingPageState();
    // If the overlay is open and showing loading state, refresh it
    if (screen === 'home') render();
  } catch (err) {
    console.error('Failed to load routes:', err);
  }
}

function updateLandingPageState() {
  if (!dailyRoute) return;
  const dotEl    = document.querySelector('.eyebrow-dot');
  const textEl   = document.querySelector('.eyebrow-text');
  const labelEl  = document.querySelector('.cta-label');
  if (!dotEl || !textEl || !labelEl) return;

  const entry = [...history].reverse().find(h => h.id === dailyRoute.id);
  if (!entry) {
    // Not yet played — defaults
    dotEl.style.background   = '';
    dotEl.style.boxShadow    = '';
    textEl.textContent       = "Today's route is live";
    textEl.style.color       = '';
    labelEl.textContent      = "Start Today's Route";
  } else {
    const perfect = entry.score === entry.total;
    const col     = perfect ? '#4ade80' : '#f87171';
    dotEl.style.background   = col;
    dotEl.style.boxShadow    = `0 0 6px ${col}`;
    textEl.textContent       = perfect
      ? `Today's route complete — ${entry.score}/${entry.total} ✓`
      : `Today's route played — ${entry.score}/${entry.total}`;
    textEl.style.color       = col;
    labelEl.textContent      = "Play again";
  }
}

fetchRoutes();


/* ═══════════════════════════════════════════════════════
   CANVAS PIN HIT-TESTING
   ═══════════════════════════════════════════════════════ */
function handleCanvasTap(e) {
  if (e.type === 'touchend') e.preventDefault(); // suppress ghost click after touch
  const canvas = document.getElementById('route-canvas');
  if (!canvas || !currentRoute || revealed) return;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX !== undefined ? e.clientX : (e.changedTouches && e.changedTouches[0].clientX);
  const clientY = e.clientY !== undefined ? e.clientY : (e.changedTouches && e.changedTouches[0].clientY);
  if (clientX === undefined) return;
  // Pin positions are stored in CSS-pixel space (drawGeoMap uses offsetWidth/offsetHeight),
  // so compare click coords in CSS space — no DPR scaling needed here.
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (!lastDrawnPinPts.length) return;

  let hit = null, hitDist = Infinity;
  const emptyHitR = (lastEmptyR || 12) + 8;
  const filledHitR = (lastPinR || 30) + 6;

  // Empty pins first
  lastDrawnPinPts.forEach((p, i) => {
    if (assignments[i]) return;
    const d = Math.sqrt((x-p.x)**2 + (y-p.y)**2);
    if (d < emptyHitR && d < hitDist) { hit = i; hitDist = d; }
  });
  // Placed pins (can override empty hits if closer)
  lastDrawnPinPts.forEach((p, i) => {
    if (!assignments[i]) return;
    const d = Math.sqrt((x-p.x)**2 + (y-p.y)**2);
    if (d < filledHitR && d < hitDist) { hit = i; hitDist = d; }
  });

  if (hit !== null) tapPin(hit);
}

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (screen === 'play' && !revealed) {
      cachedPinLayout = null;
      cachedLayoutSize = null;
      redrawGeoMap();
    }
  }, 150);
});

