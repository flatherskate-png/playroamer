/* ═══════════════════════════════════════════════════════
   ROAMER — Game engine
   Interaction model: tap photo → tap pin to place
   Routes are fetched from the backend API at startup.
   ═══════════════════════════════════════════════════════ */

// ── API ──
const API_BASE = 'http://localhost:8000';

// ── Remote state ──
let dailyRoute   = null;   // RoutePublic from /routes/daily
let allRoutes    = [];     // RoutePublic[] from /routes
let routesLoaded = false;
let revealData   = null;   // RouteReveal from /routes/{id}/reveal (post-game)

// ── State ──
let screen       = "home";
let currentRoute = null;
let cards        = [];
let assignments  = {};   // slotIndex -> card
let revealed     = false;
let score        = null;
let history      = [];
let leafletMap   = null;
let playSource   = "home";
let lightboxIndex = null;
let confirmedDecoyNamesGlobal = new Set();

// selected photo card (held in hand)
let selectedCard = null;

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
    const nowLandscape = checkLandscape();
    if (nowLandscape !== isLandscape && screen === 'play') {
      isLandscape = nowLandscape;
      render();
    }
  });
  resizeObserver.observe(overlay);
}

const MAX_GUESSES = 3;
let guessesRemaining = MAX_GUESSES;
let guessHistory     = [];
let lastFeedback     = {};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame(r, source) {
  currentRoute     = r;
  playSource       = source || "home";
  // r.photos is already shuffled by the server (stops + decoys mixed, no lat/lng).
  // Reshuffle client-side so retries get a fresh order.
  cards            = shuffle([...r.photos]);
  assignments      = {};
  selectedCard     = null;
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
  screen = "play";
  isLandscape = checkLandscape();
  attachResizeObserver();
  render();
}

function slotIsLocked(i) {
  if (guessHistory.length === 0) return false;
  return guessHistory[guessHistory.length - 1].feedback[i] === "green";
}

// ── Interaction: tap a photo ──
function tapPhoto(card) {
  if (revealed) return;
  const isDecoyElim = confirmedDecoyNamesGlobal.has(card.name);
  if (isDecoyElim) return;

  const placedSlot = Object.entries(assignments).find(([, c]) => c.name === card.name);

  if (selectedCard?.name === card.name) {
    selectedCard = null;
  } else if (placedSlot) {
    const slotIdx = parseInt(placedSlot[0]);
    if (slotIsLocked(slotIdx)) return;
    delete assignments[slotIdx];
    selectedCard = card;
  } else {
    selectedCard = card;
  }
  render();
  redrawGeoMap();
}

// ── Interaction: tap a pin ──
function tapPin(slotIndex) {
  if (revealed) return;
  if (slotIsLocked(slotIndex)) return;

  if (selectedCard) {
    assignments[slotIndex] = selectedCard;
    selectedCard = null;
  } else {
    if (assignments[slotIndex]) {
      if (slotIsLocked(slotIndex)) return;
      delete assignments[slotIndex];
    }
  }
  render();
  redrawGeoMap();
}

function allSlotsFilled() {
  return Array.from({length: currentRoute.stop_count}, (_, i) => i).every(i => assignments[i]);
}

async function checkAnswers() {
  const guessNumber = guessHistory.length + 1;
  const assignmentsList = Object.entries(assignments).map(([slot, card]) => ({
    slot_index: parseInt(slot),
    photo_name: card.name,
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

    if (result.solved || result.guesses_remaining === 0) {
      const revealResp = await fetch(`${API_BASE}/api/v1/routes/${currentRoute.id}/reveal`);
      revealData = await revealResp.json();
      score = result.correct_count;
      revealed = true;
      history.push({ route: currentRoute.name, score: result.correct_count, total: result.total_stops });
      render();
      setTimeout(initLeafletMap, 50);
    } else {
      const newAssignments = {};
      Array.from({length: currentRoute.stop_count}, (_, i) => i).forEach(i => {
        if (feedback[i] === "green") newAssignments[i] = assignments[i];
      });
      assignments  = newAssignments;
      selectedCard = null;
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

  if (wrapping) {
    // For wrapping routes, use display longitudes so the polyline wraps correctly
    const displayLngs = getDisplayLngs(currentRoute);
    const latlngs = currentRoute.slots.map((s, i) => [s.lat, displayLngs[i]]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds.pad(0.15));
    L.polyline(latlngs, { color: "rgba(125,211,252,0.7)", weight: 3, dashArray: "8 5" }).addTo(map);
    stops.forEach((stop, i) => {
      const correct = assignments[i]?.name === stop.name;
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
      const correct = assignments[i]?.name === stop.name;
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
let lastDrawnPinPts  = []; // nudged pin positions for hit-testing
let lastPinR         = 30; // current filled pin radius
let lastEmptyR       = 12; // current empty pin radius
let cachedPinLayout  = null;    // { pts, pinR, emptyR, nudged }
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
  const N = route.slots.length;
  const displayLngs = vp.displayLngs || route.slots.map(s => s.lng);

  const minDim = Math.min(W, H);
  const MIN_PIN_R = minDim < 350 ? 14 : 20;
  const MAX_PIN_R = Math.min(55, Math.round(minDim / (N + 2)));
  const EMPTY_RATIO = 0.42;
  const MARGIN = 12;

  // True geo positions (fixed)
  // For wrapping routes, use display longitudes so pins spread across the full map
  const truePts = route.slots.map((s, i) => {
    const p = flatProject(s.lat, displayLngs[i], vp, W, H);
    return {
      x: Math.max(MARGIN, Math.min(W - MARGIN, p.x)),
      y: Math.max(MARGIN, Math.min(H - MARGIN, p.y))
    };
  });

  // Starting pin radius from canvas size
  const canvasR = Math.min(W, H) / Math.max(5.5, N * 0.7);
  let pinR = Math.max(MIN_PIN_R, Math.min(MAX_PIN_R, Math.round(canvasR)));

  // Nudge function: given a radius, push overlapping pins apart
  function nudgeAtRadius(r) {
    const pts = truePts.map(p => ({ x: p.x, y: p.y }));
    const spacing = r * 2 + 6;
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[j].x - pts[i].x;
          const dy = pts[j].y - pts[i].y;
          const dist = Math.hypot(dx, dy);
          if (dist < spacing) {
            moved = true;
            const overlap = spacing - dist + 2;
            let pushX, pushY;
            if (dist < 3) {
              // Near-coincident: push perpendicular to route tangent
              let rdx = 0, rdy = 0;
              if (i > 0) { rdx += truePts[i].x - truePts[i-1].x; rdy += truePts[i].y - truePts[i-1].y; }
              if (j < N - 1) { rdx += truePts[j+1].x - truePts[j].x; rdy += truePts[j+1].y - truePts[j].y; }
              if (Math.hypot(rdx, rdy) < 1) { rdx = 1; rdy = 0; }
              const rl = Math.hypot(rdx, rdy);
              pushX = -rdy / rl; pushY = rdx / rl;
            } else {
              // 60% perpendicular-to-segment + 40% separation vector
              const segDx = truePts[j].x - truePts[i].x;
              const segDy = truePts[j].y - truePts[i].y;
              const segLen = Math.hypot(segDx, segDy) || 1;
              const perpX = -segDy / segLen;
              const perpY = segDx / segLen;
              const nx = dx / dist, ny = dy / dist;
              pushX = perpX * 0.6 + nx * 0.4;
              pushY = perpY * 0.6 + ny * 0.4;
            }
            const pLen = Math.hypot(pushX, pushY) || 1;
            pushX /= pLen; pushY /= pLen;
            // Split 35/65: earlier pin moves less
            pts[i].x -= pushX * overlap * 0.35;
            pts[i].y -= pushY * overlap * 0.35;
            pts[j].x += pushX * overlap * 0.65;
            pts[j].y += pushY * overlap * 0.65;
          }
        }
      }
      pts.forEach(p => {
        p.x = Math.max(r + 2, Math.min(W - r - 2, p.x));
        p.y = Math.max(r + 2, Math.min(H - r - 2, p.y));
      });
      if (!moved) break;
    }
    return pts;
  }

  // Check if a layout is clean: no overlaps, all on-canvas
  function layoutFits(pts, r) {
    const spacing = r * 2 + 4;
    const pad = r + 1;
    for (let i = 0; i < N; i++) {
      if (pts[i].x < pad || pts[i].x > W - pad || pts[i].y < pad || pts[i].y > H - pad) return false;
      for (let j = i + 1; j < N; j++) {
        if (Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) < spacing) return false;
      }
    }
    return true;
  }

  // Nudge-shrink loop: try current radius, shrink if it doesn't fit
  let nudged = nudgeAtRadius(pinR);
  while (!layoutFits(nudged, pinR) && pinR > MIN_PIN_R) {
    pinR = Math.max(MIN_PIN_R, pinR - 2);
    nudged = nudgeAtRadius(pinR);
  }

  // Post-nudge: fix pins that landed on the route line
  function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
    return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
  }

  for (let i = 0; i < N; i++) {
    const np = nudged[i], tp = truePts[i];
    const offsetDist = Math.hypot(np.x - tp.x, np.y - tp.y);
    if (offsetDist < 3) continue;

    let tooClose = false;
    for (let s = 0; s < N - 1; s++) {
      if (s === i || s === i - 1) continue;
      const d = ptSegDist(np.x, np.y, truePts[s].x, truePts[s].y, truePts[s+1].x, truePts[s+1].y);
      if (d < pinR + 4) { tooClose = true; break; }
    }

    if (tooClose) {
      const mx = tp.x - (np.x - tp.x);
      const my = tp.y - (np.y - tp.y);
      nudged[i].x = Math.max(pinR + 2, Math.min(W - pinR - 2, mx));
      nudged[i].y = Math.max(pinR + 2, Math.min(H - pinR - 2, my));
    }
  }

  const emptyR = Math.max(10, Math.round(pinR * EMPTY_RATIO));
  return { pts: truePts, pinR, emptyR, nudged };
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
  const cx = W * 0.5, cy = H * 0.48;
  const R  = Math.min(W, H) * (0.42 - t * 0.15);

  ctx.fillStyle = t < 0.5 ? 'rgba(7,16,31,1)' : 'rgba(8,18,36,1)';
  ctx.fillRect(0, 0, W, H);

  if (t < 0.95) {
    const gA = Math.max(0, 1 - t * 1.6);
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

  // For wrapping routes, draw land rings shifted by +360 as well
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
      ctx.fillStyle   = `rgba(18,32,56,${lA})`; ctx.fill();
      ctx.strokeStyle = `rgba(125,211,252,${0.08 + t * 0.08})`; ctx.lineWidth = t < 0.5 ? 0.5 : 0.7; ctx.stroke();
    });
  });

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
    const truePts = layout.pts;
    const nudgedPts = layout.nudged;
    const pinR = layout.pinR;
    const emptyR = layout.emptyR;

    // Update hit-test caches
    lastDrawnPinPts = nudgedPts.map(p => ({ ...p }));
    lastPinR = pinR;
    lastEmptyR = emptyR;

    // Route line
    ctx.beginPath();
    truePts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = `rgba(125,211,252,${0.07 * routeAlpha})`;
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    truePts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = `rgba(125,211,252,${0.5 * routeAlpha})`;
    ctx.lineWidth = 1.8; ctx.setLineDash([6, 5]); ctx.stroke();
    ctx.setLineDash([]);

    // Stems for nudged pins
    slots.forEach((_, i) => {
      const np = nudgedPts[i], tp = truePts[i];
      const dx = tp.x - np.x, dy = tp.y - np.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) return;
      const isLocked = assignments[i] && slotIsLocked(i);
      const isFilled = !!assignments[i];
      const r = isFilled ? pinR : emptyR;
      ctx.beginPath();
      const nx = dx / dist, ny = dy / dist;
      ctx.moveTo(np.x + nx * (r + 2), np.y + ny * (r + 2));
      ctx.lineTo(tp.x, tp.y);
      ctx.strokeStyle = isLocked
        ? `rgba(74,222,128,${0.55 * routeAlpha})`
        : `rgba(125,211,252,${0.35 * routeAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Small dot at true position
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = isLocked
        ? `rgba(74,222,128,${0.6 * routeAlpha})`
        : `rgba(125,211,252,${0.5 * routeAlpha})`;
      ctx.fill();
    });

    // Pass 1: Filled pins in REVERSE order (earlier stops on top)
    for (let i = N - 1; i >= 0; i--) {
      if (!assignments[i]) continue;
      const assigned = assignments[i];
      const locked = assigned && slotIsLocked(i);
      const isStart = i === 0;
      const isEnd = i === N - 1;
      const p = nudgedPts[i];
      const r = pinR;

      // Outer ring
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = locked
        ? `rgba(74,222,128,${0.8 * routeAlpha})`
        : `rgba(125,211,252,${0.7 * routeAlpha})`;
      ctx.lineWidth = 2.5; ctx.stroke();

      // Dark fill
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(10,16,30,${0.95 * routeAlpha})`; ctx.fill();

      // Photo image
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
      const p = nudgedPts[i];
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

function startGeoAnimation() {
  if (geoAnimHandle) cancelAnimationFrame(geoAnimHandle);
  geoAnimating = true;
  geoT = 0;
  const vp = getRouteViewport(currentRoute);
  geoRot = -vp.centerLng;
  const SPIN_DURATION = 800, ZOOM_DURATION = 1400, TOTAL = SPIN_DURATION + ZOOM_DURATION;
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
  const FB_BG = {green:"rgba(22,101,52,0.3)",yellow:"rgba(113,63,18,0.35)",red:"rgba(127,29,29,0.3)"};
  const FB_BD = {green:"#4ade80",yellow:"#facc15",red:"#f87171"};
  const FB_IC = {green:"✓",yellow:"↕",red:"✗"};
  const correct = Object.values(gh.feedback).filter(f => f === "green").length;
  const scoreCol = correct === currentRoute.stop_count ? "#4ade80" : "#7dd3fc";
  return `<div class="frozen-row">
    <div class="frozen-label">
      <span style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-3);">G${guessNum}</span>
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
    const pipsHTML = `<div class="guesses-pip">${Array.from({length:MAX_GUESSES},(_,i)=>{
      let cls = "pip";
      if (i < guessHistory.length) {
        const gh = guessHistory[i];
        const c  = Object.values(gh.feedback).filter(f=>f==="green").length;
        cls += c === currentRoute.stop_count ? " correct" : " used";
      }
      return `<div class="${cls}"></div>`;
    }).join("")}</div>`;
    navRight.innerHTML = `
      <div class="nav-play-meta">
        <span class="nav-play-title">${currentRoute.name}</span>
        <span class="nav-play-sub">${currentRoute.region} · ${currentRoute.stop_count} stops · ${currentRoute.decoy_count} decoys</span>
      </div>
      ${pipsHTML}
      <button class="btn-ghost" id="nav-back">← Back</button>
    `;
    navRight.querySelector('#nav-back').addEventListener('click', goBack);
    if (navEl) navEl.classList.add('nav-play-mode');
  } else if (screen === "home") {
    navRight.innerHTML = `<button class="btn-ghost" id="nav-core">Grand Adventures</button>`;
    navRight.querySelector('#nav-core').addEventListener('click', () => { screen='core'; render(); });
    if (navEl) navEl.classList.remove('nav-play-mode');
  } else if (screen === "core") {
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
      <div class="section-label">Recent Travels</div>
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
            `<button class="route-btn" data-route="${r.id}">${routeMiniSVG(r)}<div><div class="rname">${r.name}</div><div class="rmeta">${r.region} · ${r.stop_count} stops · ${r.decoy_count} decoys</div></div></button>`
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
        <h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:500;letter-spacing:-0.01em;">Recent Travels</h2>
        <p style="font-size:0.85rem;color:var(--text-2);font-weight:300;margin-top:6px;">Recent trips you may have missed. Get on board.</p>
      </div>
      <div class="section-label">All Routes</div>
      <div class="route-grid">
        ${winterRoutes.map(r=>`<button class="route-btn" data-route="${r.id}">${routeMiniSVG(r)}<div><div class="rname">${r.name}</div><div class="rmeta">${r.region} · ${r.stop_count} stops · ${r.decoy_count} decoys</div></div></button>`).join("")}
      </div>`;
    document.querySelectorAll(".route-btn").forEach(btn => {
      const r = allRoutes.find(r => r.id === btn.dataset.route);
      if (r) btn.addEventListener("click", () => startGame(r, "winter"));
    });
    return;
  }

  // ── PLAY ──
  const confirmedDecoyNames = new Set();
  guessHistory.forEach(gh => {
    Object.entries(gh.feedback).forEach(([si, fb]) => {
      if (fb === "red") { const c = gh.assignments[si]; if (c) confirmedDecoyNames.add(c.name); }
    });
  });
  confirmedDecoyNamesGlobal = confirmedDecoyNames;

  const filled   = allSlotsFilled();
  const guessNum = guessHistory.length + 1;

  // ── Photo grid ──
  const photoGridHTML = cards.map(c => {
    const isDecoyElim = confirmedDecoyNames.has(c.name);
    const placedSlot  = Object.entries(assignments).find(([, a]) => a.name === c.name);
    const slotIdx     = placedSlot ? parseInt(placedSlot[0]) : -1;
    const isPlaced    = slotIdx !== -1;
    const locked      = isPlaced && slotIsLocked(slotIdx);
    const isSelected  = selectedCard?.name === c.name;

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

    const selectedRing = isSelected
      ? `<div style="position:absolute;inset:-3px;border-radius:17px;border:2px solid var(--cyan);animation:pin-pulse 1s ease-in-out infinite;pointer-events:none;"></div>`
      : '';

    return `<div class="tap-card" data-name="${c.name}"
      style="position:relative;aspect-ratio:1/1;border-radius:14px;overflow:visible;
             opacity:${opacity};cursor:${cursor};${scale}transition:transform 0.15s,opacity 0.2s;">
      <div style="position:absolute;inset:0;border-radius:14px;overflow:hidden;z-index:1;
                  border:2px solid ${borderCol};transition:border-color 0.15s;
                  box-shadow:${isSelected ? '0 0 16px rgba(125,211,252,0.35)' : 'none'};">
        <img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"
             onerror="this.style.display='none'"/>
        ${isDecoyElim ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>` : ''}
      </div>
      ${selectedRing}
      ${badgeContent}
      <button class="expand-btn" data-expand="${cards.indexOf(c)}" aria-label="Expand" style="z-index:5;" onclick="event.stopPropagation();openLightbox(${cards.indexOf(c)})">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="rgba(240,239,245,0.7)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  }).join('');

  // Instruction text
  let instruction;
  if (selectedCard) {
    instruction = `<span style="color:var(--cyan);">${selectedCard.name?.split(',')[0] ?? 'Photo'}</span> selected — tap a pin to place it`;
  } else if (filled) {
    instruction = 'All stops placed — submit when ready';
  } else {
    const placed = Object.keys(assignments).length;
    instruction = placed === 0 ? 'Tap a photo, then tap a numbered pin on the map' : `${placed} of ${currentRoute.stop_count} placed — keep going`;
  }

  // Past guesses
  const historyHTML = guessHistory.length > 0
    ? `<div class="panel panel-padded guess-history-panel">
        <div class="panel-label" style="margin-bottom:8px;">Past Guesses</div>
        <div class="frozen-rows-wrap">
          ${[...guessHistory].map((gh, i) => frozenRowHTML(gh, i + 1)).join("")}
        </div>
       </div>`
    : "";

  // Results
  let resultsHTML = "";
  if (revealed && revealData) {
    const won = score === currentRoute.stop_count;
    const guessUsed = guessHistory.length;
    const resultMsg = won
      ? guessUsed===1?"Perfect — first try!":guessUsed===2?"Got it in 2!":"Solved it!"
      : score >= currentRoute.stop_count/2?"So close.":"Rough road.";
    resultsHTML = `
      <div class="results-inner">
        <div class="results-score" style="color:${won?"#4ade80":"#7dd3fc"}">${won?`Solved in ${guessUsed}/${MAX_GUESSES}`:`${score}/${currentRoute.stop_count} Correct`}</div>
        <div class="results-msg">${resultMsg}</div>
        <div class="share-grid">${guessHistory.map(gh=>Array.from({length:currentRoute.stop_count},(_,i)=>{const fb=gh.feedback[i];return fb==="green"?"🟩":fb==="yellow"?"🟨":fb==="red"?"🟥":"⬜";}).join("")).join("\n")}</div>
        <button class="btn-copy" id="btn-copy">Copy results</button>
        <div class="results-actions">
          <button class="btn-retry" id="btn-retry">Retry</button>
          <button class="btn-menu"  id="btn-menu">← Back</button>
        </div>
      </div>
      <div class="panel panel-padded">
        <div class="panel-label">Correct Order</div>
        <div class="reveal-grid">
          ${revealData.stops.map((s,i)=>{
            const correct=assignments[i]?.name===s.name, guessed=assignments[i];
            return `<div class="reveal-card ${correct?"correct":"wrong"}">
              <img src="${s.photo}" alt=""/>
              <div class="reveal-overlay">
                <div class="reveal-top"><div class="reveal-num">${i+1}</div><div class="reveal-check">${correct?"✓":"✗"}</div></div>
                <div>
                  <div class="reveal-name">${s.name}</div>
                  ${!correct&&guessed?`<div class="reveal-guess">you: ${guessed.name}</div>`:""}
                  ${!correct&&!guessed?`<div class="reveal-guess">no answer</div>`:""}
                </div>
              </div>
            </div>`;
          }).join("")}
        </div>
        <div class="reveal-decoys">Decoys: ${revealData.decoy_names.join(", ")}</div>
      </div>`;
  }

  // Map panel — no toggle header, always shown
  const mapContentHTML = revealed
    ? `<div style="padding:6px"><div id="leaflet-map"></div></div>`
    : `<div style="padding:6px">
         <div id="map-canvas-wrapper" style="position:relative;width:100%;">
           <canvas id="route-canvas" style="width:100%;height:auto;display:block;border-radius:10px;"></canvas>
         </div>
       </div>`;

  // Photo panel
  const photoPanelHTML = !revealed ? `
    <div class="panel panel-padded photo-panel" id="photo-panel">
      <div class="tap-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
        ${photoGridHTML}
      </div>
      <div class="submit-wrap">
        <button id="btn-submit" class="submit-btn ${filled?"active":"inactive"}" ${filled?"":"disabled"}>
          ${filled ? `Submit Guess ${guessNum} →` : `Place all ${currentRoute.stop_count} stops to continue`}
        </button>
      </div>
    </div>` : '';

  // Layout — no separate play-header; it's merged into nav above
  app.innerHTML = isLandscape && !revealed ? `
    ${historyHTML}
    <div class="play-landscape-row">
      <div class="play-col-map">
        <div class="map-panel landscape-map-panel" id="map-panel">
          ${mapContentHTML}
        </div>
      </div>
      <div class="play-col-photos">
        ${photoPanelHTML}
      </div>
    </div>
  ` : `
    ${!revealed ? historyHTML : ''}
    <div class="map-panel" id="map-panel">
      ${mapContentHTML}
    </div>
    ${photoPanelHTML}
    ${resultsHTML}
  `;

  // Events
  document.getElementById("btn-submit")?.addEventListener("click", async () => { if (allSlotsFilled()) await checkAnswers(); });
  document.getElementById("btn-retry")?.addEventListener("click",  () => startGame(currentRoute, playSource));
  document.getElementById("btn-menu")?.addEventListener("click",   goBack);
  document.getElementById("btn-copy")?.addEventListener("click",   function() {
    const txt = `Roamer: ${currentRoute.name}\n` + guessHistory.map(gh =>
      Array.from({length:currentRoute.stop_count},(_,i) => { const fb=gh.feedback[i]; return fb==="green"?"🟩":fb==="yellow"?"🟨":fb==="red"?"🟥":"⬜"; }).join("")
    ).join("\n");
    navigator.clipboard.writeText(txt).then(() => { this.textContent = "Copied!"; });
  });

  document.querySelectorAll(".tap-card").forEach(el => {
    const name = el.dataset.name;
    const card = cards.find(c => c.name === name);
    if (!card) return;
    el.addEventListener("click", e => {
      if (e.target.closest('.expand-btn')) return;
      tapPhoto(card);
    });
  });

  if (!revealed) {
    const canvas = document.getElementById('route-canvas');
    if (canvas) {
      canvas.removeEventListener('click', handleCanvasTap);
      canvas.removeEventListener('touchend', handleCanvasTap);
      canvas.addEventListener('click', handleCanvasTap);
      canvas.addEventListener('touchend', handleCanvasTap, { passive: false });
    }
    if (geoT === 0 && !geoAnimating) {
      startGeoAnimation();
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
  if (playSource === 'core') { screen = 'core'; render(); }
  else closeOverlay();
}

document.getElementById('play-btn').addEventListener('click', function(e) {
  e.preventDefault();
  this.style.transform = 'scale(0.97)';
  setTimeout(() => { this.style.transform = ''; }, 150);
  openOverlay();
  if (routesLoaded) {
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
    // If the overlay is open and showing loading state, refresh it
    if (screen === 'home') render();
  } catch (err) {
    console.error('Failed to load routes:', err);
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

