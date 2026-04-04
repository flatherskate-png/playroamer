/* ═══════════════════════════════════════════════════════
   ROAMER — Onboarding System
   Components:
     1. Welcome Card  — first visit only
     2. Contextual Hints — first game only
     3. How to Play modal — always accessible from nav

   Depends on: roamer-engine.js globals (startGame, openOverlay, dailyRoute, routesLoaded)
   ═══════════════════════════════════════════════════════ */

/* ─── localStorage keys ─── */
const OB_KEYS = {
  welcomed:    'roamer_ob_welcomed',
  hint1:       'roamer_ob_hint1',
  hint2:       'roamer_ob_hint2',
  hint3:       'roamer_ob_hint3',
};

function obGet(key)      { try { return localStorage.getItem(key); } catch { return null; } }
function obSet(key)      { try { localStorage.setItem(key, '1'); } catch {} }
function isFirstVisit()  { return !obGet(OB_KEYS.welcomed); }
function isFirstGame()   { return !obGet(OB_KEYS.hint1) && !obGet(OB_KEYS.hint2); }

// ?reset clears all onboarding state — useful for testing on any device
if (new URLSearchParams(window.location.search).has('reset')) {
  Object.values(OB_KEYS).forEach(k => { try { localStorage.removeItem(k); } catch {} });
  // Remove the param from the URL without reloading
  const url = new URL(window.location);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url);
}


/* ══════════════════════════════════════════════════════
   STYLES — injected into <head>
   ══════════════════════════════════════════════════════ */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `

/* ─── Tutorial Cards ─── */
#ob-welcome {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(6, 10, 18, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  opacity: 0;
  transition: opacity 0.4s ease;
}
#ob-welcome.ob-visible { opacity: 1; }
#ob-welcome.ob-hiding  { opacity: 0; pointer-events: none; }

.ob-tut-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: rgba(10, 15, 30, 0.97);
  border: 1px solid rgba(125, 211, 252, 0.14);
  border-radius: 20px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 32px 80px rgba(0,0,0,0.65),
    0 0 60px rgba(125,211,252,0.05);
}

.ob-tut-scene-wrap {
  width: 100%;
  background: rgba(6,12,28,0.6);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.ob-tut-scene {
  display: block;
  width: 100%;
  height: auto;
}

.ob-tut-text {
  padding: 20px 24px 12px;
}
.ob-tut-headline {
  font-family: 'Playfair Display', serif;
  font-size: 1.35rem;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 8px;
  letter-spacing: -0.01em;
  padding-right: 32px;
}
.ob-tut-sub {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.84rem;
  font-weight: 300;
  line-height: 1.6;
  color: var(--text-2);
  margin: 0;
}

.ob-tut-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.ob-tut-dots {
  display: flex;
  gap: 6px;
  align-items: center;
}
.ob-tut-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  transition: background 0.2s, transform 0.2s;
}
.ob-tut-dot.ob-tut-dot-active {
  background: var(--cyan);
  transform: scale(1.3);
}
.ob-tut-next {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 20px;
  border-radius: 100px;
  background: rgba(125,211,252,0.1);
  border: 1px solid rgba(125,211,252,0.3);
  color: var(--cyan);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.ob-tut-next:hover {
  background: rgba(125,211,252,0.18);
  border-color: rgba(125,211,252,0.5);
  transform: translateY(-1px);
}
.ob-tut-next:active { transform: scale(0.97); }

@media (max-width: 480px) {
  .ob-tut-headline { font-size: 1.2rem; }
  .ob-tut-sub { font-size: 0.8rem; }
  .ob-tut-text { padding: 16px 18px 10px; }
  .ob-tut-footer { padding: 12px 16px 16px; }
}

/* ─── Welcome splash (before tutorial) ─── */
.ob-welcome-splash {
  text-align: center;
  padding: 48px 32px 32px;
}
.ob-welcome-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  opacity: 0.9;
}
.ob-welcome-title {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  font-weight: 500;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
.ob-welcome-tagline {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.92rem;
  font-weight: 300;
  color: var(--text-2);
  margin: 0 0 36px;
  line-height: 1.5;
}
.ob-welcome-btns {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ob-welcome-how {
  background: none;
  border: none;
  color: var(--text-3);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 6px;
  transition: color 0.15s;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(139,144,168,0.3);
}
.ob-welcome-how:hover { color: var(--text-2); }


/* ─── Contextual Hints — rendered into #ob-hint-slot ─── */
#ob-hint-slot {
  width: 100%;
}
.ob-hint-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  margin: 6px 0;
  background: rgba(125, 211, 252, 0.06);
  border: 1px solid rgba(125, 211, 252, 0.25);
  border-radius: 10px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.ob-hint-bar.ob-hint-visible {
  opacity: 1;
  transform: translateY(0);
}
.ob-hint-bar.ob-hint-hiding {
  opacity: 0;
  transform: translateY(-4px);
}
.ob-hint-bar-icon {
  font-size: 1rem;
  flex-shrink: 0;
}
.ob-hint-bar-text {
  color: var(--text);
}
.ob-hint-bar-text em {
  color: var(--cyan);
  font-style: normal;
}

/* ─── Mobile fixed hint slot ─── */
.ob-hint-slot-mobile-fixed {
  position: fixed;
  bottom: 190px; /* sits above the mobile tray */
  left: 50%;
  transform: translateX(-50%);
  z-index: 8000;
  width: calc(100% - 32px);
  max-width: 420px;
  pointer-events: none;
}
.ob-hint-slot-mobile-fixed .ob-hint-bar {
  pointer-events: auto;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

/* ─── Submit button boost ─── */
.floating-submit-btn {
  background: rgba(125, 211, 252, 0.12) !important;
  border-color: rgba(125, 211, 252, 0.7) !important;
  box-shadow:
    0 0 0 1px rgba(125,211,252,0.2),
    0 0 40px rgba(125,211,252,0.25),
    0 8px 24px rgba(0,0,0,0.55) !important;
}
.floating-submit-btn:hover {
  background: rgba(125, 211, 252, 0.22) !important;
  border-color: var(--cyan) !important;
  box-shadow:
    0 0 0 1px rgba(125,211,252,0.35),
    0 0 56px rgba(125,211,252,0.35),
    0 8px 28px rgba(0,0,0,0.6) !important;
}


/* ─── Expand pulse animation (Hint 3) ─── */
@keyframes obExpandPulse {
  0%   { box-shadow: 0 0 0 0 rgba(125,211,252,0.8), 0 0 0 0 rgba(125,211,252,0.4); transform: scale(1); opacity: 1; }
  50%  { box-shadow: 0 0 0 5px rgba(125,211,252,0.2), 0 0 0 10px rgba(125,211,252,0); transform: scale(1.25); opacity: 1; }
  100% { box-shadow: 0 0 0 0 rgba(125,211,252,0), 0 0 0 0 rgba(125,211,252,0); transform: scale(1); opacity: 1; }
}
.ob-pulse-target {
  animation: obExpandPulse 1.2s ease-out infinite !important;
  border-color: rgba(125,211,252,0.9) !important;
  background: rgba(125,211,252,0.25) !important;
  opacity: 1 !important;
}


/* ─── How to Play Modal ─── */
#ob-htp {
  position: fixed;
  inset: 0;
  z-index: 9100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(6, 10, 18, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
}
#ob-htp.ob-visible {
  opacity: 1;
  pointer-events: auto;
}

.ob-htp-modal {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 88vh;
  overflow-y: auto;
  background: rgba(10, 15, 30, 0.98);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 32px 28px 28px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03) inset,
    0 40px 100px rgba(0,0,0,0.7);
  scrollbar-width: thin;
  scrollbar-color: rgba(125,211,252,0.15) transparent;
  transform: translateY(12px);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
#ob-htp.ob-visible .ob-htp-modal { transform: translateY(0); }

.ob-htp-modal::-webkit-scrollbar { width: 4px; }
.ob-htp-modal::-webkit-scrollbar-thumb {
  background: rgba(125,211,252,0.15);
  border-radius: 4px;
}

.ob-htp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.ob-htp-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.35rem;
  font-weight: 500;
  color: var(--text);
}
.ob-htp-close {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: var(--text-2);
  font-size: 0.85rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s, color 0.2s;
  flex-shrink: 0;
}
.ob-htp-close:hover { background: rgba(255,255,255,0.08); color: var(--text); }

.ob-htp-section-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 14px;
  font-weight: 500;
}

/* Screenshot frames */
.ob-screenshot {
  position: relative;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 28px;
}
.ob-screenshot-inner {
  position: relative;
  padding: 20px;
  min-height: 180px;
}
.ob-scene {
  display: flex;
  gap: 10px;
  height: 160px;
}
.ob-scene-map {
  flex: 1;
  background: rgba(125,211,252,0.04);
  border: 1px solid rgba(125,211,252,0.12);
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}
.ob-scene-photos {
  width: 90px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Illustrated map elements */
.ob-map-route {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.ob-pin {
  position: absolute;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.6rem;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
}
.ob-pin-empty  { border-color: rgba(125,211,252,0.5); color: var(--cyan); background: rgba(125,211,252,0.1); }
.ob-pin-filled { border-color: rgba(125,211,252,0.7); color: var(--cyan); background: rgba(125,211,252,0.15); }
.ob-pin-green  { border-color: var(--green); background: var(--green-bg); color: var(--green); }
.ob-pin-yellow { border-color: var(--yellow); background: var(--yellow-bg); color: var(--yellow); }
.ob-pin-red    { border-color: var(--red); background: var(--red-bg); color: var(--red); }

.ob-photo-card {
  height: 44px;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.04);
  position: relative;
  overflow: hidden;
  display: flex; align-items: flex-end; padding: 4px;
}
.ob-photo-card-selected {
  border-color: var(--cyan);
  background: rgba(125,211,252,0.08);
}
.ob-photo-card-placed {
  border-color: rgba(125,211,252,0.4);
}
.ob-photo-thumb {
  width: 100%; height: 100%;
  position: absolute; inset: 0;
  border-radius: 6px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}

/* Expand icon pulse illus */
.ob-expand-icon {
  position: absolute;
  top: 4px; right: 4px;
  width: 14px; height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(125,211,252,0.5);
  background: rgba(125,211,252,0.1);
  display: flex; align-items: center; justify-content: center;
}

/* Callout annotations */
.ob-callout {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.ob-callout-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--cyan);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--cyan);
}
.ob-callout-line {
  height: 1px;
  background: linear-gradient(to right, rgba(125,211,252,0.5), rgba(125,211,252,0.15));
  width: 24px;
  flex-shrink: 0;
}
.ob-callout-text {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.68rem;
  color: var(--text-2);
  white-space: nowrap;
  line-height: 1.3;
}
.ob-callout-text strong {
  color: var(--text);
  font-weight: 500;
}

/* Count badge */
.ob-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 100px;
  font-size: 0.65rem;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid rgba(125,211,252,0.25);
  color: var(--cyan);
  background: rgba(125,211,252,0.08);
}

/* Guess counter illustration */
.ob-guess-dots {
  display: flex; gap: 4px;
}
.ob-guess-dot {
  width: 8px; height: 8px; border-radius: 50%;
}
.ob-guess-dot-used {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.12);
}
.ob-guess-dot-live {
  background: var(--cyan);
  border: 1px solid var(--cyan);
  box-shadow: 0 0 5px var(--cyan);
}

/* Divider between screenshots */
.ob-htp-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent);
  margin: 4px 0 24px;
}

/* Footer insight line */
.ob-htp-footer {
  margin-top: 8px;
  padding: 14px 16px;
  background: rgba(125,211,252,0.05);
  border: 1px solid rgba(125,211,252,0.12);
  border-radius: 10px;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 300;
  color: var(--text-2);
  line-height: 1.55;
  font-style: italic;
}
.ob-htp-footer strong {
  color: var(--cyan);
  font-weight: 500;
  font-style: normal;
}

/* Nav button */
.ob-nav-htp-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: var(--text-2);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.75rem;
  font-weight: 400;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
  white-space: nowrap;
}
.ob-nav-htp-btn:hover {
  background: rgba(125,211,252,0.07);
  border-color: rgba(125,211,252,0.2);
  color: var(--text);
}

/* Illustrated route line in map */
.ob-route-svg {
  width: 100%; height: 100%;
  position: absolute; inset: 0;
}

/* Phase 2 feedback scene */
.ob-fb-scene {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 28px 16px 16px;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 140px;
}
.ob-fb-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ob-fb-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.68rem;
  color: var(--text-2);
  text-align: center;
  max-width: 80px;
  line-height: 1.3;
}
.ob-fb-pin-large {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 2px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem;
}

/* Mobile tweaks */
@media (max-width: 480px) {
  .ob-card { padding: 28px 22px 22px; }
  .ob-card-hook { font-size: 1.35rem; }
  .ob-htp-modal { padding: 24px 18px 22px; }
  .ob-callout-text { font-size: 0.63rem; }
  .ob-fb-scene { padding: 20px 8px 12px; gap: 8px; }
  .ob-fb-label { font-size: 0.63rem; max-width: 68px; }
}
  `;
  document.head.appendChild(style);
})();


/* ══════════════════════════════════════════════════════
   1. TUTORIAL CARDS  (replaces old welcome card)
   4 swipeable illustrated cards, tap to advance
   ══════════════════════════════════════════════════════ */

const TUTORIAL_CARDS = [
  {
    id: 'tut-journey',
    headline: 'Build the journey',
    sub: 'Reconstruct a real route — city by city, stop by stop — from start to finish.',
    scene: () => `
      <style>
        .c1{background:#0a1628;border-radius:10px;display:flex;align-items:stretch;height:220px;overflow:hidden;}
        .c1-land{width:80px;flex-shrink:0;background:rgba(20,45,90,0.55);border-radius:10px 0 0 10px;}
        .c1-route{width:160px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .c1-pins{display:flex;flex-direction:column;align-items:flex-start;gap:0;}
        .c1-pin-row{display:flex;align-items:center;gap:8px;}
        .c1-pin{width:36px;height:36px;border-radius:50%;border:1.5px solid rgba(125,211,252,0.4);background:rgba(125,211,252,0.08);display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-size:13px;color:#7dd3fc;flex-shrink:0;}
        .c1-pin.ep{border-color:rgba(125,211,252,0.65);background:rgba(125,211,252,0.12);font-weight:600;}
        .c1-pin-label{font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:0.12em;color:rgba(125,211,252,0.55);white-space:nowrap;}
        .c1-seg-wrap{padding-left:17px;}
        .c1-seg{width:2px;height:24px;background:repeating-linear-gradient(to bottom,rgba(125,211,252,0.55) 0px,rgba(125,211,252,0.55) 5px,transparent 5px,transparent 11px);}
        .c1-callouts{flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding-left:16px;}
        .c1-callout{display:flex;align-items:center;gap:10px;}
        .c1-dot{width:7px;height:7px;border-radius:50%;background:rgba(125,211,252,0.65);flex-shrink:0;}
        .c1-ct strong{display:block;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:rgba(240,239,245,0.92);}
        .c1-ct span{font-family:'DM Sans',sans-serif;font-size:11px;color:rgba(240,239,245,0.42);}
      </style>
      <div class="c1">
        <div class="c1-land"></div>
        <div class="c1-route">
          <div class="c1-pins">
            <div class="c1-pin-row"><div class="c1-pin ep">1</div><span class="c1-pin-label">START</span></div>
            <div class="c1-seg-wrap"><div class="c1-seg"></div></div>
            <div class="c1-pin-row"><div class="c1-pin">2</div></div>
            <div class="c1-seg-wrap"><div class="c1-seg"></div></div>
            <div class="c1-pin-row"><div class="c1-pin">3</div></div>
            <div class="c1-seg-wrap"><div class="c1-seg"></div></div>
            <div class="c1-pin-row"><div class="c1-pin ep">4</div><span class="c1-pin-label">END</span></div>
          </div>
        </div>
        <div class="c1-callouts">
          <div class="c1-callout"><div class="c1-dot"></div><div class="c1-ct"><strong>Dashed route</strong><span>to reconstruct</span></div></div>
          <div class="c1-callout"><div class="c1-dot"></div><div class="c1-ct"><strong>Numbered pins</strong><span>= stops on the route</span></div></div>
        </div>
      </div>`,
  },
  {
    id: 'tut-place',
    headline: 'Pick, place & remove',
    sub: 'Tap a photo to select it, then tap a pin on the map to place it.',
    scene: () => `
      <svg class="ob-tut-scene" viewBox="0 0 300 170" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="p-sky1" x1="0" y1="0" x2="0" y2="110" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1a3a6e"/>
            <stop offset="55%" stop-color="#c06030"/>
            <stop offset="100%" stop-color="#4a1808"/>
          </linearGradient>
          <linearGradient id="p-mtn1" x1="0" y1="72" x2="0" y2="116" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1e1e2e"/>
            <stop offset="100%" stop-color="#0e0e1a"/>
          </linearGradient>
          <linearGradient id="p-sky2" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3a28"/><stop offset="100%" stop-color="#0d2218"/>
          </linearGradient>
          <linearGradient id="p-sky3" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3050"/><stop offset="100%" stop-color="#0d1e38"/>
          </linearGradient>
          <linearGradient id="p-sea3" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a4a6e"/><stop offset="100%" stop-color="#0d2a44"/>
          </linearGradient>
          <clipPath id="p-t1"><rect x="205" y="9" width="88" height="45" rx="4"/></clipPath>
          <clipPath id="p-t2"><rect x="205" y="62" width="88" height="45" rx="4"/></clipPath>
          <clipPath id="p-t3"><rect x="205" y="116" width="88" height="45" rx="4"/></clipPath>
        </defs>
        <rect width="300" height="170" rx="10" fill="#060e1c"/>

        <!-- Map panel -->
        <rect x="9" y="9" width="188" height="152" rx="8" fill="#060e1c" stroke="rgba(125,211,252,0.08)" stroke-width="0.5"/>
        <path d="M 94 22 C 96 49 92 74 94 98 C 95 113 97 124 100 143" stroke="rgba(125,211,252,0.45)" stroke-width="1.5" stroke-dasharray="4 5" fill="none" stroke-linecap="round"/>
        <circle cx="94" cy="22" r="8" fill="rgba(125,211,252,0.08)" stroke="rgba(125,211,252,0.4)" stroke-width="1"/>
        <text x="94" y="26" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="6" fill="#7dd3fc">1</text>
        <!-- Pin 2 glowing -->
        <circle cx="93" cy="66" r="12" fill="rgba(125,211,252,0.05)" stroke="rgba(125,211,252,0.15)" stroke-width="0.8"/>
        <circle cx="93" cy="66" r="8" fill="rgba(125,211,252,0.16)" stroke="#7dd3fc" stroke-width="1.5"/>
        <text x="93" y="70" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="6" font-weight="700" fill="#7dd3fc">2</text>
        <circle cx="95" cy="108" r="8" fill="rgba(125,211,252,0.08)" stroke="rgba(125,211,252,0.4)" stroke-width="1"/>
        <text x="95" y="112" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="6" fill="#7dd3fc">3</text>
        <circle cx="100" cy="143" r="8" fill="rgba(125,211,252,0.08)" stroke="rgba(125,211,252,0.4)" stroke-width="1"/>
        <text x="100" y="147" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="6" fill="#7dd3fc">4</text>

        <!-- Callout 1: tap photo to select -->
        <circle cx="172" cy="30" r="1.5" fill="rgba(125,211,252,0.6)"/>
        <line x1="174" y1="30" x2="203" y2="30" stroke="rgba(125,211,252,0.4)" stroke-width="0.6" stroke-dasharray="2 2" fill="none"/>
        <text x="118" y="27" font-family="DM Sans,sans-serif" font-size="8.5" font-weight="600" fill="rgba(240,239,245,0.9)">tap photo to select</text>

        <!-- Callout 2: tap pin to place -->
        <circle cx="22" cy="70" r="1.5" fill="rgba(125,211,252,0.6)"/>
        <line x1="24" y1="70" x2="83" y2="68" stroke="rgba(125,211,252,0.35)" stroke-width="0.6" stroke-dasharray="2 2" fill="none"/>
        <text x="26" y="67" font-family="DM Sans,sans-serif" font-size="8.5" font-weight="600" fill="rgba(240,239,245,0.9)">tap pin</text>
        <text x="26" y="78" font-family="DM Sans,sans-serif" font-size="8.5" font-weight="600" fill="rgba(240,239,245,0.9)">to place</text>

        <!-- Callout 3: tap pin or photo to unselect -->
        <circle cx="22" cy="126" r="1.5" fill="rgba(125,211,252,0.6)"/>
        <text x="26" y="123" font-family="DM Sans,sans-serif" font-size="8.5" font-weight="600" fill="rgba(240,239,245,0.9)">tap pin or photo</text>
        <text x="26" y="134" font-family="DM Sans,sans-serif" font-size="8.5" font-weight="600" fill="rgba(240,239,245,0.9)">to unselect</text>

        <!-- Thumb 1: mountain sunset — selected (cyan border) -->
        <rect x="205" y="9" width="88" height="45" rx="4" fill="url(#p-sky1)"/>
        <circle cx="262" cy="27" r="11" fill="rgba(220,120,40,0.2)"/>
        <circle cx="262" cy="27" r="6" fill="rgba(255,175,55,0.32)"/>
        <polygon points="205,54 216,35 225,41 238,28 251,37 264,24 277,32 290,25 293,30 293,54" fill="url(#p-mtn1)" clip-path="url(#p-t1)"/>
        <polygon points="238,28 244,37 232,37" fill="rgba(235,240,255,0.8)" clip-path="url(#p-t1)"/>
        <rect x="205" y="9" width="88" height="45" rx="4" fill="none" stroke="#7dd3fc" stroke-width="1.5"/>
        <!-- Expand icon -->
        <rect x="286" y="12" width="6" height="6" rx="1.5" fill="rgba(4,8,18,0.88)" stroke="rgba(255,255,255,0.28)" stroke-width="0.5"/>
        <g transform="translate(287,13) scale(0.55)">
          <path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="rgba(240,239,245,0.85)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </g>
        <!-- expand label at icon height -->
        <text x="216" y="17" font-family="DM Sans,sans-serif" font-size="5" fill="rgba(240,239,245,0.55)">expand to photo slideshow</text>
        <line x1="282" y1="15" x2="285" y2="15" stroke="rgba(125,211,252,0.4)" stroke-width="0.5" fill="none"/>

        <!-- Thumb 2: forest -->
        <rect x="205" y="62" width="88" height="45" rx="4" fill="url(#p-sky2)"/>
        <polygon points="205,107 212,93 218,99 225,89 233,96 241,87 249,94 258,86 266,93 274,88 283,95 293,107" fill="rgba(12,38,18,0.95)" clip-path="url(#p-t2)"/>
        <rect x="205" y="62" width="88" height="45" rx="4" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>

        <!-- Thumb 3: ocean -->
        <rect x="205" y="116" width="88" height="45" rx="4" fill="url(#p-sky3)"/>
        <rect x="205" y="141" width="88" height="20" fill="url(#p-sea3)" clip-path="url(#p-t3)"/>
        <line x1="205" y1="141" x2="293" y2="141" stroke="rgba(125,211,252,0.2)" stroke-width="0.5"/>
        <polygon points="205,141 218,135 232,138 248,133 262,137 278,134 293,136 293,141" fill="rgba(15,30,55,0.65)" clip-path="url(#p-t3)"/>
        <rect x="205" y="116" width="88" height="45" rx="4" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
      </svg>`,
  },
  {
    id: 'tut-decoy',
    headline: 'Watch out for decoys',
    sub: 'There are more photos than pins — some don\'t belong. You can flag suspects to keep track.',
    scene: () => `
      <svg class="ob-tut-scene" viewBox="0 0 300 170" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Card skies -->
          <linearGradient id="d-sky1" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3a6e"/><stop offset="100%" stop-color="#c06030"/>
          </linearGradient>
          <linearGradient id="d-sky2" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3a28"/><stop offset="100%" stop-color="#0d2218"/>
          </linearGradient>
          <linearGradient id="d-sky3" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1e2a50"/><stop offset="100%" stop-color="#0d1a3a"/>
          </linearGradient>
          <linearGradient id="d-sky4" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3050"/><stop offset="100%" stop-color="#0d2040"/>
          </linearGradient>
          <linearGradient id="d-sky5" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#2a2010"/><stop offset="100%" stop-color="#6a3010"/>
          </linearGradient>
          <linearGradient id="d-sky6" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a2a1a"/><stop offset="100%" stop-color="#0a180a"/>
          </linearGradient>
          <!-- Clip paths for each card -->
          <clipPath id="d-c1"><rect x="14" y="14" width="80" height="60" rx="7"/></clipPath>
          <clipPath id="d-c2"><rect x="110" y="14" width="80" height="60" rx="7"/></clipPath>
          <clipPath id="d-c3"><rect x="206" y="14" width="80" height="60" rx="7"/></clipPath>
          <clipPath id="d-c4"><rect x="14" y="90" width="80" height="60" rx="7"/></clipPath>
          <clipPath id="d-c5"><rect x="110" y="90" width="80" height="60" rx="7"/></clipPath>
          <clipPath id="d-c6"><rect x="206" y="90" width="80" height="60" rx="7"/></clipPath>
        </defs>
        <rect width="300" height="170" rx="10" fill="#060e1c"/>

        <!-- Card 1: mountain sunset -->
        <rect x="14" y="14" width="80" height="60" rx="7" fill="url(#d-sky1)"/>
        <polygon points="14,74 28,50 40,62 54,40 68,56 80,38 94,52 94,74"
          fill="rgba(20,20,32,0.9)" clip-path="url(#d-c1)"/>
        <polygon points="54,40 64,55 44,55" fill="rgba(230,235,245,0.7)" clip-path="url(#d-c1)"/>
        <rect x="14" y="14" width="80" height="60" rx="7" fill="none" stroke="rgba(125,211,252,0.4)" stroke-width="1.2"/>

        <!-- Card 2: forest -->
        <rect x="110" y="14" width="80" height="60" rx="7" fill="url(#d-sky2)"/>
        <polygon points="110,74 118,52 124,62 130,46 138,58 146,42 154,56 162,44 170,58 176,48 190,74"
          fill="rgba(15,40,20,0.95)" clip-path="url(#d-c2)"/>
        <rect x="110" y="14" width="80" height="60" rx="7" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

        <!-- Card 3: city skyline at dusk -->
        <rect x="206" y="14" width="80" height="60" rx="7" fill="url(#d-sky3)"/>
        <!-- Sky glow -->
        <circle cx="246" cy="48" r="20" fill="rgba(255,140,60,0.12)" clip-path="url(#d-c3)"/>
        <!-- Building silhouettes — darker than sky so they read clearly -->
        <rect x="210" y="42" width="9" height="32" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="221" y="34" width="11" height="40" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="234" y="40" width="8" height="34" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="244" y="30" width="13" height="44" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="259" y="36" width="7" height="38" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="268" y="38" width="10" height="36" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <rect x="280" y="44" width="8" height="30" fill="rgba(8,18,40,0.95)" clip-path="url(#d-c3)"/>
        <!-- Window lights -->
        <rect x="223" y="38" width="2" height="2" fill="rgba(255,220,100,0.8)" clip-path="url(#d-c3)"/>
        <rect x="227" y="42" width="2" height="2" fill="rgba(255,220,100,0.6)" clip-path="url(#d-c3)"/>
        <rect x="246" y="34" width="2" height="2" fill="rgba(255,220,100,0.75)" clip-path="url(#d-c3)"/>
        <rect x="250" y="40" width="2" height="2" fill="rgba(255,220,100,0.6)" clip-path="url(#d-c3)"/>
        <rect x="261" y="40" width="2" height="2" fill="rgba(255,220,100,0.7)" clip-path="url(#d-c3)"/>
        <rect x="270" y="44" width="2" height="2" fill="rgba(255,220,100,0.55)" clip-path="url(#d-c3)"/>
        <rect x="206" y="14" width="80" height="60" rx="7" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

        <!-- Card 4: lake/reflection -->
        <rect x="14" y="90" width="80" height="60" rx="7" fill="url(#d-sky4)"/>
        <polygon points="14,130 30,108 44,120 58,102 72,116 94,104 94,130"
          fill="rgba(18,25,45,0.85)" clip-path="url(#d-c4)"/>
        <rect x="14" y="130" width="80" height="20" rx="0" fill="rgba(15,40,80,0.6)" clip-path="url(#d-c4)"/>
        <line x1="14" y1="130" x2="94" y2="130" stroke="rgba(125,211,252,0.15)" stroke-width="0.5"/>
        <rect x="14" y="90" width="80" height="60" rx="7" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

        <!-- Card 5: DECOY — desert scene -->
        <rect x="110" y="90" width="80" height="60" rx="7" fill="url(#d-sky5)"/>
        <circle cx="175" cy="104" r="9" fill="rgba(255,180,40,0.55)" clip-path="url(#d-c5)"/>
        <path d="M110,150 C122,138 134,146 144,136 C154,126 162,140 172,133 C180,128 187,140 190,150Z"
          fill="rgba(110,60,15,0.85)" clip-path="url(#d-c5)"/>
        <rect x="110" y="90" width="80" height="60" rx="7" fill="rgba(154,52,18,0.18)" stroke="#fb923c" stroke-width="2"/>
        <!-- DECOY pill -->
        <rect x="126" y="122" width="48" height="16" rx="8" fill="rgba(120,40,10,0.95)" stroke="#fb923c" stroke-width="1"/>
        <text x="150" y="133" text-anchor="middle" fill="#fb923c" font-size="7.5" font-family="DM Sans" font-weight="600" letter-spacing="0.05em">DECOY</text>

        <!-- Card 6: snowy peak — lighter sky so mountain reads -->
        <rect x="206" y="90" width="80" height="60" rx="7" fill="url(#d-sky6)"/>
        <polygon points="206,150 218,118 230,132 246,102 262,126 278,112 286,120 286,150"
          fill="rgba(30,50,40,0.9)" clip-path="url(#d-c6)"/>
        <!-- Snow — brighter white -->
        <polygon points="246,102 258,120 234,120" fill="rgba(240,245,255,0.92)" clip-path="url(#d-c6)"/>
        <polygon points="218,118 226,130 210,130" fill="rgba(230,238,250,0.75)" clip-path="url(#d-c6)"/>
        <rect x="206" y="90" width="80" height="60" rx="7" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
      </svg>`,
  },
  {
    id: 'tut-guesses',
    headline: '3 guesses at the route',
    sub: 'Submit when all pins are filled. Greens lock in between guesses — use them to narrow down the rest.',
    scene: () => `
      <svg class="ob-tut-scene" viewBox="0 0 300 175" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g-bg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#0d1e3a"/><stop offset="100%" stop-color="#060e1c"/>
          </linearGradient>
          <!-- Three mini photo backgrounds -->
          <linearGradient id="g-p1" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3a6e"/><stop offset="60%" stop-color="#c06030"/><stop offset="100%" stop-color="#4a1808"/>
          </linearGradient>
          <linearGradient id="g-p2" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a3050"/><stop offset="100%" stop-color="#0d2040"/>
          </linearGradient>
          <linearGradient id="g-p3" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#1a2a18"/><stop offset="100%" stop-color="#0a180a"/>
          </linearGradient>
          <clipPath id="g-c1"><rect x="14" y="14" width="82" height="62" rx="8"/></clipPath>
          <clipPath id="g-c2"><rect x="109" y="14" width="82" height="62" rx="8"/></clipPath>
          <clipPath id="g-c3"><rect x="204" y="14" width="82" height="62" rx="8"/></clipPath>
        </defs>
        <rect width="300" height="170" rx="10" fill="url(#g-bg)"/>

        <!-- Photo 1: mountain sunset — GREEN correct -->
        <rect x="14" y="14" width="82" height="62" rx="8" fill="url(#g-p1)"/>
        <polygon points="14,76 28,52 40,64 55,42 70,58 88,38 96,50 96,76" fill="rgba(20,20,32,0.9)" clip-path="url(#g-c1)"/>
        <polygon points="55,42 65,57 45,57" fill="rgba(230,235,245,0.7)" clip-path="url(#g-c1)"/>
        <rect x="14" y="14" width="82" height="62" rx="8" fill="rgba(22,101,52,0.25)" stroke="#4ade80" stroke-width="2.5"/>
        <!-- Green badge -->
        <circle cx="55" cy="45" r="14" fill="rgba(22,101,52,0.85)" stroke="#4ade80" stroke-width="2"/>
        <text x="55" y="50" text-anchor="middle" fill="#4ade80" font-size="14" font-family="DM Sans" font-weight="700">✓</text>
        <!-- Label -->
        <text x="55" y="98" text-anchor="middle" fill="#4ade80" font-size="8.5" font-family="DM Sans" font-weight="600">Correct</text>
        <text x="55" y="108" text-anchor="middle" fill="rgba(240,239,245,0.45)" font-size="7.5" font-family="DM Sans">locks in</text>

        <!-- Photo 2: ocean — YELLOW wrong slot -->
        <rect x="109" y="14" width="82" height="62" rx="8" fill="url(#g-p2)"/>
        <!-- Water -->
        <rect x="109" y="48" width="82" height="28" rx="0" fill="rgba(12,35,70,0.8)" clip-path="url(#g-c2)"/>
        <line x1="109" y1="48" x2="191" y2="48" stroke="rgba(125,211,252,0.2)" stroke-width="0.5"/>
        <!-- Distant headland -->
        <polygon points="109,48 125,38 140,44 155,36 170,42 191,38 191,48" fill="rgba(15,30,55,0.7)" clip-path="url(#g-c2)"/>
        <rect x="109" y="14" width="82" height="62" rx="8" fill="rgba(113,63,18,0.3)" stroke="#facc15" stroke-width="2.5"/>
        <!-- Yellow badge -->
        <circle cx="150" cy="45" r="14" fill="rgba(113,63,18,0.85)" stroke="#facc15" stroke-width="2"/>
        <text x="150" y="51" text-anchor="middle" fill="#facc15" font-size="14" font-family="DM Sans">↕</text>
        <!-- Label -->
        <text x="150" y="98" text-anchor="middle" fill="#facc15" font-size="8.5" font-family="DM Sans" font-weight="600">Wrong pin</text>
        <text x="150" y="108" text-anchor="middle" fill="rgba(240,239,245,0.45)" font-size="7.5" font-family="DM Sans">move it</text>

        <!-- Photo 3: forest — RED decoy -->
        <rect x="204" y="14" width="82" height="62" rx="8" fill="url(#g-p3)"/>
        <polygon points="204,76 212,54 218,64 224,48 232,60 240,44 248,58 256,46 264,60 272,50 286,76" fill="rgba(15,40,20,0.95)" clip-path="url(#g-c3)"/>
        <rect x="204" y="14" width="82" height="62" rx="8" fill="rgba(127,29,29,0.3)" stroke="#f87171" stroke-width="2.5"/>
        <!-- Red badge -->
        <circle cx="245" cy="45" r="14" fill="rgba(127,29,29,0.85)" stroke="#f87171" stroke-width="2"/>
        <text x="245" y="50" text-anchor="middle" fill="#f87171" font-size="14" font-family="DM Sans">✗</text>
        <!-- Label -->
        <text x="245" y="98" text-anchor="middle" fill="#f87171" font-size="8.5" font-family="DM Sans" font-weight="600">Decoy</text>
        <text x="245" y="108" text-anchor="middle" fill="rgba(240,239,245,0.45)" font-size="7.5" font-family="DM Sans">eliminated</text>

        <!-- Guess line: matches app style -->
        <text x="92" y="133" text-anchor="start" fill="rgba(240,239,245,0.35)" font-size="6.5" font-family="DM Sans">Guess 1 of 3</text>
        <circle cx="148" cy="129" r="4" fill="rgba(255,255,255,0.2)"/>
        <circle cx="160" cy="129" r="4" fill="#7dd3fc"/>
        <circle cx="172" cy="129" r="4" fill="#7dd3fc"/>

        <!-- Submit pill -->
        <rect x="60" y="142" width="180" height="22" rx="11"
          fill="rgba(10,18,36,0.9)" stroke="rgba(125,211,252,0.4)" stroke-width="1"/>
        <text x="150" y="151" text-anchor="middle" fill="rgba(240,239,245,0.75)" font-size="7" font-family="DM Sans">Submit Guess 1 →</text>
        <text x="150" y="160" text-anchor="middle" fill="rgba(240,239,245,0.35)" font-size="6" font-family="DM Sans">once all pins are filled</text>
      </svg>`,
  },
];

function buildWelcomeCard() {
  let mode = 'welcome'; // 'welcome' | 'tutorial'
  let currentSlide = 0;
  const total = TUTORIAL_CARDS.length;

  const el = document.createElement('div');
  el.id = 'ob-welcome';

  function renderWelcome() {
    el.innerHTML = `
      <div class="ob-tut-card ob-welcome-splash">
        <div class="ob-welcome-logo">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
            <path d="M12 52 Q13 62 26 63 Q44 64 56 52 Q65 41 61 26 Q58 14 52 12"
              stroke="url(#arc-w)" stroke-width="1.8" stroke-linecap="round" fill="none" stroke-dasharray="3 4.5"/>
            <line x1="14" y1="11" x2="14" y2="44" stroke="#f0eff5" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M14 11 Q30 11 30 23 Q30 35 14 35" stroke="#f0eff5" stroke-width="4.5" stroke-linecap="round" fill="none"/>
            <line x1="14" y1="35" x2="32" y2="48" stroke="#f0eff5" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M32 48 Q30 52 37 52" stroke="#f0eff5" stroke-width="3.8" stroke-linecap="round" fill="none"/>
            <circle cx="12" cy="52" r="5" fill="none" stroke="#7dd3fc" stroke-width="2"/>
            <circle cx="12" cy="52" r="2" fill="#7dd3fc"/>
            <circle cx="52" cy="12" r="5" fill="none" stroke="#7dd3fc" stroke-width="2"/>
            <circle cx="52" cy="12" r="2" fill="#7dd3fc"/>
            <defs>
              <linearGradient id="arc-w" x1="12" y1="63" x2="52" y2="12" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#7dd3fc"/>
                <stop offset="48%" stop-color="rgba(125,211,252,.28)"/>
                <stop offset="100%" stop-color="#7dd3fc"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h2 class="ob-welcome-title">Roamer</h2>
        <p class="ob-welcome-tagline">A daily geography puzzle.</p>
        <div class="ob-welcome-btns">
          <button class="ob-tut-next" id="ob-welcome-how" style="width:100%;justify-content:center;">
            How it works
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="ob-welcome-how" id="ob-welcome-play">Skip</button>
        </div>
      </div>`;

    document.getElementById('ob-welcome-play').addEventListener('click', () => {
      dismissWelcomeCard();
    });
    document.getElementById('ob-welcome-how').addEventListener('click', () => {
      mode = 'tutorial';
      currentSlide = 0;
      renderSlide();
      animateSlide();
    });
  }

  function renderSlide() {
    const card = TUTORIAL_CARDS[currentSlide];
    const isLast = currentSlide === total - 1;
    const dots = TUTORIAL_CARDS.map((_, i) =>
      `<div class="ob-tut-dot${i === currentSlide ? ' ob-tut-dot-active' : ''}"></div>`
    ).join('');

    el.innerHTML = `
      <div class="ob-tut-card">
        <div class="ob-tut-scene-wrap">
          ${card.scene()}
        </div>
        <div class="ob-tut-text">
          <h2 class="ob-tut-headline">${card.headline}</h2>
          <p class="ob-tut-sub">${card.sub}</p>
        </div>
        <div class="ob-tut-footer">
          <div class="ob-tut-dots">${dots}</div>
          <button class="ob-tut-next" id="ob-tut-next">
            ${isLast
              ? `Let's go <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
              : `Next <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            }
          </button>
        </div>
      </div>`;

    document.getElementById('ob-tut-next').addEventListener('click', () => {
      if (currentSlide < total - 1) {
        currentSlide++;
        renderSlide();
        animateSlide();
      } else {
        dismissWelcomeCard();
      }
    });

  }

  function animateSlide() {
    const card = el.querySelector('.ob-tut-card');
    if (!card) return;
    card.style.transform = 'translateX(24px)';
    card.style.opacity = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease';
        card.style.transform = 'translateX(0)';
        card.style.opacity = '1';
      });
    });
  }

  document.body.appendChild(el);
  renderWelcome();

  // Initial fade-in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('ob-visible'));
  });
}

function dismissWelcomeCard(callback) {
  obSet(OB_KEYS.welcomed);
  const el = document.getElementById('ob-welcome');
  if (!el) { callback && callback(); return; }
  el.classList.add('ob-hiding');
  setTimeout(() => {
    el.remove();
    callback && callback();
  }, 380);
}

/* ══════════════════════════════════════════════════════
   2. CONTEXTUAL HINTS
   ══════════════════════════════════════════════════════ */
let _hintQueue    = [];
let _hintVisible  = false;
let _hintTimer    = null;

function _getHintSlot() {
  return document.getElementById('ob-hint-slot');
}

function _showHint(message, icon, durationMs) {
  const slot = _getHintSlot();
  if (!slot) { _hintVisible = false; return; }

  const old = slot.querySelector('.ob-hint-bar');
  if (old) old.remove();

  const bar = document.createElement('div');
  bar.className = 'ob-hint-bar';
  bar.innerHTML = `<span class="ob-hint-bar-icon">${icon}</span><span class="ob-hint-bar-text">${message}</span>`;
  slot.appendChild(bar);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => bar.classList.add('ob-hint-visible'));
  });

  _hintVisible = true;
  clearTimeout(_hintTimer);
  _hintTimer = setTimeout(() => _dismissHint(bar), durationMs);
  return bar;
}

function _dismissHint(barEl) {
  if (!barEl || !barEl.parentNode) { _hintVisible = false; _drainQueue(); return; }
  barEl.classList.add('ob-hint-hiding');
  setTimeout(() => {
    barEl.remove();
    _hintVisible = false;
    _drainQueue();
  }, 300);
}

function _drainQueue() {
  if (!_hintQueue.length || _hintVisible) return;
  const next = _hintQueue.shift();
  setTimeout(() => _showHint(next.message, next.icon, next.duration), 300);
}

function _queueHint(message, icon, duration) {
  // Re-find the slot — if render() just ran and replaced the DOM, we need the fresh element
  if (_hintVisible) {
    _hintQueue.push({ message, icon, duration });
  } else {
    _showHint(message, icon, duration);
  }
}

/* Public hint triggers — called from the game engine hooks below */

// Hint 1: first photo tap → "Now tap a pin on the map to place it"
window.obHint_photoSelected = function() {
  if (obGet(OB_KEYS.hint1)) return;
  obSet(OB_KEYS.hint1);
  _queueHint('Now tap a pin on the map to place it', '📍', 5500);
};

// Hint 2: first successful placement → "Tap a placed photo or pin to remove it"
window.obHint_photoPlaced = function() {
  if (obGet(OB_KEYS.hint2)) return;
  obSet(OB_KEYS.hint2);
  _queueHint('Tap a placed photo or pin to remove it', '↩', 5500);
};

// Hint 3: pulse animation on first photo's expand icon (game-load, first game only)
window.obHint_pulseExpand = function() {
  if (obGet(OB_KEYS.hint3)) return;
  obSet(OB_KEYS.hint3);
  // Wait briefly for render to fully paint, then find the expand button (mobile or desktop)
  setTimeout(() => {
    const expandBtn = document.querySelector('.mt-expand-btn') || document.querySelector('.photo-expand-btn');
    if (!expandBtn) return;
    expandBtn.classList.add('ob-pulse-target');
    // Stop pulsing as soon as user interacts with any photo or the expand button itself
    const stopPulse = () => {
      document.querySelectorAll('.ob-pulse-target').forEach(el => el.classList.remove('ob-pulse-target'));
      document.removeEventListener('click', stopOnAnyTap);
      document.removeEventListener('touchend', stopOnAnyTap);
    };
    const stopOnAnyTap = (e) => {
      if (e.target.closest('.tap-card') || e.target.closest('.mt-thumb') ||
          e.target.closest('.mt-expand-btn') || e.target.closest('.photo-expand-btn')) {
        stopPulse();
      }
    };
    document.addEventListener('click', stopOnAnyTap);
    document.addEventListener('touchend', stopOnAnyTap);
  }, 900);
};


/* ══════════════════════════════════════════════════════
   3. HOW TO PLAY MODAL
   ══════════════════════════════════════════════════════ */
function buildHowToPlay() {
  const el = document.createElement('div');
  el.id = 'ob-htp';
  el.innerHTML = `
    <div class="ob-htp-modal">
      <div class="ob-htp-header">
        <h2 class="ob-htp-title">How to play</h2>
        <button class="ob-htp-close" id="ob-htp-close" aria-label="Close">✕</button>
      </div>

      <!-- Screenshot 1: Making your guess -->
      <p class="ob-htp-section-label">Phase 1 — Making your guess</p>
      <div class="ob-screenshot">
        <div class="ob-screenshot-inner">
          <div class="ob-scene">
            <!-- Map panel -->
            <div class="ob-scene-map">
              <svg class="ob-route-svg" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Grid lines -->
                <line x1="0" y1="70" x2="160" y2="70" stroke="rgba(125,211,252,0.06)" stroke-width="0.5"/>
                <line x1="80" y1="0" x2="80" y2="140" stroke="rgba(125,211,252,0.06)" stroke-width="0.5"/>
                <!-- Route dashes -->
                <path d="M 28 105 C 48 88 72 72 95 60 C 118 48 132 38 140 30"
                  stroke="rgba(125,211,252,0.5)" stroke-width="1.5" stroke-dasharray="4 5" fill="none" stroke-linecap="round"/>
                <!-- Pin 1 (start) -->
                <circle cx="28" cy="105" r="9" fill="rgba(125,211,252,0.12)" stroke="rgba(125,211,252,0.5)" stroke-width="1.5"/>
                <text x="28" y="109" text-anchor="middle" fill="#7dd3fc" font-size="7" font-family="DM Sans">1</text>
                <!-- Pin 2 (filled with photo) -->
                <circle cx="68" cy="76" r="11" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.7)" stroke-width="1.5"/>
                <rect x="61" y="69" width="14" height="14" rx="2" fill="rgba(125,211,252,0.2)"/>
                <!-- tiny photo icon -->
                <rect x="62" y="70" width="12" height="12" rx="1.5" fill="rgba(125,211,252,0.15)" stroke="rgba(125,211,252,0.4)" stroke-width="0.6"/>
                <!-- Pin 3 -->
                <circle cx="110" cy="52" r="9" fill="rgba(125,211,252,0.08)" stroke="rgba(125,211,252,0.4)" stroke-width="1.5"/>
                <text x="110" y="56" text-anchor="middle" fill="#7dd3fc" font-size="7" font-family="DM Sans">3</text>
                <!-- Pin 4 (end) -->
                <circle cx="140" cy="30" r="9" fill="rgba(125,211,252,0.08)" stroke="rgba(125,211,252,0.4)" stroke-width="1.5"/>
                <text x="140" y="34" text-anchor="middle" fill="#7dd3fc" font-size="7" font-family="DM Sans">4</text>
                <!-- Start dot -->
                <circle cx="28" cy="105" r="3" fill="#7dd3fc"/>
              </svg>

              <!-- Callout: route line -->
              <div class="ob-callout" style="top:12px;left:8px;">
                <div class="ob-callout-dot"></div>
                <div class="ob-callout-line" style="width:18px;"></div>
                <div class="ob-callout-text"><strong>Follow the route</strong><br>start to finish</div>
              </div>
            </div>

            <!-- Photo grid panel -->
            <div class="ob-scene-photos">
              <!-- Photo card selected -->
              <div class="ob-photo-card ob-photo-card-selected" style="height:50px;">
                <div class="ob-photo-thumb" style="background: linear-gradient(135deg, rgba(125,211,252,0.15), rgba(125,211,252,0.05));"></div>
                <div class="ob-expand-icon">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 3V1h2M5 1h2v2M7 5v2H5M3 7H1V5" stroke="rgba(125,211,252,0.8)" stroke-width="0.8" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
              <!-- Photo card neutral -->
              <div class="ob-photo-card" style="height:44px;">
                <div class="ob-photo-thumb" style="background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));"></div>
              </div>
              <!-- Photo card neutral (decoy) -->
              <div class="ob-photo-card" style="height:44px;">
                <div class="ob-photo-thumb" style="background: linear-gradient(135deg, rgba(192,132,252,0.08), rgba(192,132,252,0.02));"></div>
              </div>

              <!-- Count badge -->
              <div style="margin-top:2px;">
                <div class="ob-count-badge">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><rect x="0.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="0.7"/><path d="M2 3h4M2 5h2.5" stroke="currentColor" stroke-width="0.7" stroke-linecap="round"/></svg>
                  5 photos · 4 pins
                </div>
              </div>
            </div>
          </div>

          <!-- Callouts for photo panel -->
          <div class="ob-callout" style="bottom:52px;right:8px;flex-direction:row-reverse;">
            <div class="ob-callout-dot" style="background:var(--cyan);"></div>
            <div class="ob-callout-line" style="width:14px; background: linear-gradient(to left, rgba(125,211,252,0.5), rgba(125,211,252,0.15));"></div>
            <div class="ob-callout-text" style="text-align:right;"><strong>Tap to select</strong><br>then tap a pin</div>
          </div>
          <div class="ob-callout" style="bottom:10px;right:8px;flex-direction:row-reverse;">
            <div class="ob-callout-dot" style="background:rgba(125,211,252,0.5);"></div>
            <div class="ob-callout-line" style="width:14px; background: linear-gradient(to left, rgba(125,211,252,0.3), rgba(125,211,252,0.08));"></div>
            <div class="ob-callout-text" style="text-align:right; color:var(--text-3);">More photos than pins —<br>not all belong</div>
          </div>
        </div>

        <!-- Expand callout  -->
        <div style="padding:0 20px 16px; display:flex; align-items:center; gap:8px; border-top: 1px solid rgba(255,255,255,0.04);">
          <div style="width:5px;height:5px;border-radius:50%;background:var(--cyan);box-shadow:0 0 5px var(--cyan);flex-shrink:0;"></div>
          <span style="font-family:'DM Sans',sans-serif;font-size:0.68rem;color:var(--text-2);">
            <strong style="color:var(--text);">Tap the expand icon</strong> (top-right of any photo) to study it closely
          </span>
        </div>
      </div>

      <div class="ob-htp-divider"></div>

      <!-- Screenshot 2: Reading feedback -->
      <p class="ob-htp-section-label">Phase 2 — Reading the feedback</p>
      <div class="ob-screenshot">
        <div class="ob-screenshot-inner" style="padding-bottom:16px;">
          <div class="ob-fb-scene">
            <div class="ob-fb-item">
              <div class="ob-fb-pin-large ob-pin-green">✓</div>
              <div class="ob-fb-label"><strong style="color:var(--green);">Green</strong> — correct &amp; locked</div>
            </div>
            <div class="ob-fb-item">
              <div class="ob-fb-pin-large ob-pin-yellow">↕</div>
              <div class="ob-fb-label"><strong style="color:var(--yellow);">Yellow</strong> — right photo, wrong pin</div>
            </div>
            <div class="ob-fb-item">
              <div class="ob-fb-pin-large ob-pin-red">✗</div>
              <div class="ob-fb-label"><strong style="color:var(--red);">Red</strong> — decoy, doesn't belong</div>
            </div>
            <div class="ob-fb-item">
              <div class="ob-guess-dots">
                <div class="ob-guess-dot ob-guess-dot-used"></div>
                <div class="ob-guess-dot ob-guess-dot-live"></div>
                <div class="ob-guess-dot ob-guess-dot-live"></div>
              </div>
              <div class="ob-fb-label"><strong style="color:var(--text);">3 guesses</strong> total</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer insight -->
      <div class="ob-htp-footer">
        <strong>Greens stay locked between guesses.</strong> Use them to narrow down the rest.
      </div>
    </div>
  `;
  document.body.appendChild(el);

  // Close handlers
  document.getElementById('ob-htp-close').addEventListener('click', closeHowToPlay);
  el.addEventListener('click', (e) => { if (e.target === el) closeHowToPlay(); });
  document.addEventListener('keydown', _htpKeyHandler);
}

function _htpKeyHandler(e) {
  if (e.key === 'Escape' && document.getElementById('ob-htp')?.classList.contains('ob-visible')) {
    closeHowToPlay();
  }
}

function openHowToPlay() {
  const el = document.getElementById('ob-htp');
  if (!el) return;
  // Scroll modal to top
  const modal = el.querySelector('.ob-htp-modal');
  if (modal) modal.scrollTop = 0;
  el.classList.add('ob-visible');
}

function closeHowToPlay() {
  const el = document.getElementById('ob-htp');
  if (!el) return;
  el.classList.remove('ob-visible');
}

window.openHowToPlay  = openHowToPlay;
window.closeHowToPlay = closeHowToPlay;


/* ══════════════════════════════════════════════════════
   NAV INJECTION
   Injects "How to play" button into #nav-right when
   the game overlay is active.
   ══════════════════════════════════════════════════════ */
(function() {
  const observer = new MutationObserver(() => {
    const navRight = document.getElementById('nav-right');
    if (!navRight) return;
    if (navRight.querySelector('.ob-nav-htp-btn')) return; // already injected

    const btn = document.createElement('button');
    btn.className = 'ob-nav-htp-btn';
    btn.setAttribute('aria-label', 'How to play');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1"/>
        <path d="M5.5 5C5.5 4.17 6.17 3.5 7 3.5 7.83 3.5 8.5 4.17 8.5 5 8.5 5.83 7 6.5 7 7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        <circle cx="7" cy="9" r="0.6" fill="currentColor"/>
      </svg>
      How to play
    `;
    btn.addEventListener('click', openHowToPlay);
    navRight.insertBefore(btn, navRight.firstChild);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();


/* ══════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Always build How to Play (hidden by default, shown on demand)
  buildHowToPlay();

  // Show Welcome Card only on first visit
  if (isFirstVisit()) {
    // Small delay so the page has settled
    setTimeout(buildWelcomeCard, 600);
  }
  // Note: obHint_pulseExpand is now triggered directly from render() in roamer-engine.js
  // after the game DOM is fully built, so no MutationObserver needed here.
});
