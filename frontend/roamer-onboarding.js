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

/* ─── Welcome Card ─── */
#ob-welcome {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(6, 10, 18, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  opacity: 0;
  transition: opacity 0.4s ease;
}
#ob-welcome.ob-visible { opacity: 1; }
#ob-welcome.ob-hiding  { opacity: 0; pointer-events: none; }

.ob-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: rgba(10, 15, 30, 0.96);
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 20px;
  padding: 36px 32px 28px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 32px 80px rgba(0,0,0,0.6),
    0 0 60px rgba(125,211,252,0.06);
  transform: translateY(16px) scale(0.97);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
#ob-welcome.ob-visible .ob-card {
  transform: translateY(0) scale(1);
}

.ob-card-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
}
.ob-card-eyebrow-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  animation: obPulse 2.5s ease-in-out infinite;
}
@keyframes obPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.85); }
}
.ob-card-eyebrow-text {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cyan);
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
}

.ob-card-hook {
  font-family: 'Playfair Display', serif;
  font-size: 1.55rem;
  font-weight: 500;
  line-height: 1.25;
  color: var(--text);
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}
.ob-card-hook em {
  color: var(--cyan);
  font-style: italic;
}

.ob-card-body {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.875rem;
  font-weight: 300;
  line-height: 1.6;
  color: var(--text-2);
  margin-bottom: 28px;
}

.ob-rule {
  height: 1px;
  background: linear-gradient(to right, rgba(125,211,252,0.15), transparent);
  margin-bottom: 20px;
}

.ob-cta-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 20px;
  background: rgba(125,211,252,0.1);
  border: 1px solid rgba(125,211,252,0.3);
  border-radius: 10px;
  color: var(--cyan);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  text-decoration: none;
  margin-bottom: 14px;
}
.ob-cta-primary:hover {
  background: rgba(125,211,252,0.16);
  border-color: rgba(125,211,252,0.5);
  transform: translateY(-1px);
}
.ob-cta-primary:active { transform: scale(0.98); }
.ob-cta-arrow {
  transition: transform 0.2s;
}
.ob-cta-primary:hover .ob-cta-arrow { transform: translateX(3px); }

.ob-cta-secondary {
  text-align: center;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.78rem;
  color: var(--text-3);
}
.ob-cta-secondary a {
  color: var(--text-2);
  text-decoration: none;
  border-bottom: 1px solid rgba(139,144,168,0.3);
  padding-bottom: 1px;
  transition: color 0.15s, border-color 0.15s;
  cursor: pointer;
}
.ob-cta-secondary a:hover {
  color: var(--text);
  border-color: rgba(139,144,168,0.6);
}

/* Globe decoration in top-right corner of card */
.ob-card-globe {
  position: absolute;
  top: -1px;
  right: 24px;
  width: 72px;
  height: 64px;
  opacity: 0.55;
  pointer-events: none;
}


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
   1. WELCOME CARD
   ══════════════════════════════════════════════════════ */
function buildWelcomeCard() {
  const el = document.createElement('div');
  el.id = 'ob-welcome';
  el.innerHTML = `
    <div class="ob-card">
      <div class="ob-card-eyebrow">
        <div class="ob-card-eyebrow-dot"></div>
        <span class="ob-card-eyebrow-text">Welcome to Roamer</span>
      </div>
      <h2 class="ob-card-hook">Place the photos.<br><em>Build the route.</em></h2>
      <p class="ob-card-body">
        Match each photo to its pin on the map to piece together today's journey.
        Not every photo belongs — spot the decoys. You have 3 guesses to get it right.
      </p>
      <div class="ob-rule"></div>
      <button class="ob-cta-primary" id="ob-welcome-start">
        <span>Start playing</span>
        <svg class="ob-cta-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <p class="ob-cta-secondary">Want the full picture first? <a id="ob-welcome-htp">How to play</a></p>
    </div>
  `;
  document.body.appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('ob-visible'));
  });

  // CTA: Start playing — just dismiss, let user choose their route
  document.getElementById('ob-welcome-start').addEventListener('click', () => {
    dismissWelcomeCard();
  });

  // Link: How to play
  document.getElementById('ob-welcome-htp').addEventListener('click', () => {
    dismissWelcomeCard(() => openHowToPlay());
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
  _queueHint('Now tap a pin on the map to place it', '📍', 4200);
};

// Hint 2: first successful placement → "Tap a placed photo or pin to remove it"
window.obHint_photoPlaced = function() {
  if (obGet(OB_KEYS.hint2)) return;
  obSet(OB_KEYS.hint2);
  _queueHint('Tap a placed photo or pin to remove it', '↩', 3200);
};

// Hint 3: pulse animation on first photo's expand icon (game-load, first game only)
window.obHint_pulseExpand = function() {
  if (obGet(OB_KEYS.hint3)) return;
  obSet(OB_KEYS.hint3);
  // Wait for render to complete, then find the first expand button
  setTimeout(() => {
    const expandBtn = document.querySelector('.photo-expand-btn');
    if (expandBtn) {
      expandBtn.classList.add('ob-pulse-target');
    }
  }, 800);
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

  // Hint 3 (expand pulse) — fires on game start, first game only
  // We hook into the overlay becoming active
  const gameOverlay = document.getElementById('game-overlay');
  if (gameOverlay) {
    const htpObs = new MutationObserver(() => {
      if (gameOverlay.classList.contains('active') && isFirstGame()) {
        window.obHint_pulseExpand();
      }
    });
    htpObs.observe(gameOverlay, { attributes: true, attributeFilter: ['class'] });
  }
});
