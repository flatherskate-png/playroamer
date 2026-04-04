/* ═══════════════════════════════════════════════════════
   ROAMER — Lightbox
   Depends on: roamer-engine.js (cards, assignments, slotIsLocked,
               confirmedDecoyIdsGlobal, revealed, revealData)
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════ LIGHTBOX ═══════════════════ */
function openLightbox(cardIndex) {
  lightboxIndex = cardIndex;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  lightboxIndex = null;
}

function lbStep(delta) {
  if (lightboxIndex === null || !cards.length) return;
  lightboxIndex = (lightboxIndex + delta + cards.length) % cards.length;
  renderLightbox();
}

function renderLightbox() {
  if (lightboxIndex === null || !cards.length) return;
  const card = cards[lightboxIndex];
  const img = document.getElementById('lb-img');
  const badge = document.getElementById('lb-badge');
  const nameEl = document.getElementById('lb-name');
  const counter = document.getElementById('lb-counter');
  const dotsEl = document.getElementById('lb-dots');

  img.src = card.photo;
  img.style.opacity = '0';
  img.onload = () => { img.style.opacity = '1'; };
  if (img.complete && img.naturalWidth) img.style.opacity = '1';

  // Badge and elim banner
  // assignments maps slotIndex -> card; find the slot this card is placed in
  const placedEntry = Object.entries(assignments).find(([, c]) => c.id === card.id);
  const pickIdx = placedEntry ? parseInt(placedEntry[0]) : -1;
  const isElim = confirmedDecoyIdsGlobal.has(card.id);
  const locked = pickIdx !== -1 && slotIsLocked(pickIdx);
  const elimBanner = document.getElementById('lb-elim-banner');

  // Order badge — anchored to top-left of the photo
  if (pickIdx !== -1) {
    badge.style.display = 'flex';
    badge.style.background = locked ? 'rgba(22,101,52,0.92)' : 'rgba(6,10,18,0.88)';
    badge.style.border = `2px solid ${locked ? '#4ade80' : 'var(--cyan)'}`;
    badge.innerHTML = locked
      ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10.5L11.5 3.5" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<span style="color:var(--cyan);font-family:'Playfair Display',serif;font-size:1rem;">${pickIdx+1}</span>`;
  } else {
    badge.style.display = 'none';
  }

  // Eliminated banner — bottom of photo
  if (isElim && elimBanner) {
    elimBanner.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#f87171" stroke-width="1.2"/><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/></svg> DECOY — eliminated`;
    elimBanner.classList.add('visible');
  } else if (elimBanner) {
    elimBanner.classList.remove('visible');
  }

  // Name: only show if revealed and revealData is available
  if (revealed && revealData) {
    // card.id is "stop_N" or "decoy_N" — look up the name from revealData
    const stopMatch = card.id.match(/^stop_(\d+)$/);
    const decoyMatch = card.id.match(/^decoy_(\d+)$/);
    let displayName = '';
    if (stopMatch) {
      const idx = parseInt(stopMatch[1]);
      displayName = revealData.stops[idx]?.name || '';
    } else if (decoyMatch) {
      const idx = parseInt(decoyMatch[1]);
      displayName = revealData.decoy_names[idx] ? revealData.decoy_names[idx] + ' (decoy)' : '(decoy)';
    }
    nameEl.textContent = displayName;
    nameEl.className = 'lb-name revealed-name';
  } else {
    nameEl.textContent = '';
  }

  // Decoy toggle button — not shown if confirmed eliminated or game revealed
  const lbDecoyEl = document.getElementById('lb-decoy-btn');
  if (lbDecoyEl) {
    const isConfirmedElim = confirmedDecoyIdsGlobal.has(card.id);
    const isFlagged = typeof userFlaggedDecoys !== 'undefined' && userFlaggedDecoys.has(card.id);

    if (revealed || isConfirmedElim) {
      lbDecoyEl.style.display = 'none';
    } else if (isFlagged) {
      lbDecoyEl.style.display = 'flex';
      lbDecoyEl.textContent = '✕ Not a decoy';
      lbDecoyEl.className = 'lb-decoy-btn lb-decoy-flagged';
      lbDecoyEl.dataset.cardId = card.id;
    } else {
      lbDecoyEl.style.display = 'flex';
      lbDecoyEl.textContent = 'Mark as Decoy';
      lbDecoyEl.className = 'lb-decoy-btn';
      lbDecoyEl.dataset.cardId = card.id;
    }
  }

  counter.textContent = `${lightboxIndex + 1} / ${cards.length}`;

  // Dots
  dotsEl.innerHTML = cards.map((c, i) => {
    const placed = Object.values(assignments).some(a => a.id === c.id);
    const eli = confirmedDecoyIdsGlobal.has(c.id);
    let cls = 'lb-dot';
    if (i === lightboxIndex) cls += ' active';
    else if (eli) cls += ' elim';
    else if (placed) cls += ' picked';
    return `<div class="${cls}" data-idx="${i}"></div>`;
  }).join('');

  dotsEl.querySelectorAll('.lb-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      lightboxIndex = parseInt(dot.dataset.idx);
      renderLightbox();
    });
  });
}

// Touch swipe for lightbox
(function() {
  let startX = 0, startY = 0;
  const lb = document.getElementById('lightbox');
  lb.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      lbStep(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
})();

// Keyboard nav
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'ArrowRight') lbStep(1);
  if (e.key === 'ArrowLeft') lbStep(-1);
  if (e.key === 'Escape') closeLightbox();
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click', () => lbStep(-1));
  document.getElementById('lb-next').addEventListener('click', () => lbStep(1));

  // Decoy toggle
  document.getElementById('lb-decoy-btn')?.addEventListener('click', () => {
    if (lightboxIndex === null || !cards.length) return;
    const card = cards[lightboxIndex];
    if (typeof userFlaggedDecoys === 'undefined') return;
    if (userFlaggedDecoys.has(card.id)) {
      userFlaggedDecoys.delete(card.id);
    } else {
      userFlaggedDecoys.add(card.id);
      // Deselect if it was armed
      if (typeof selectedCard !== 'undefined' && selectedCard?.id === card.id) {
        selectedCard = null;
        if (typeof redrawGeoMap === 'function') redrawGeoMap();
      }
    }
    renderLightbox();
    if (typeof render === 'function') render();
  });
});
