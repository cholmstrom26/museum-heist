// ============================================================
//  ui.js  —  DOM updates for the right panel
// ============================================================

import { state, posteriorParams, canAdvanceToPlanning,
         totalObservations, roomObs } from '../game/state.js';
import { ROOMS, ROOM, ADJ }           from '../data/museum.js';
import * as mechanics                 from '../game/mechanics.js';
import { successCI }                  from '../math/montecarlo.js';

// ── Helpers ────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ── Phase Display ──────────────────────────────────────────────────────────
export function updatePhaseDisplay() {
  const labels = ['', 'PHASE 1 — RECONNAISSANCE', 'PHASE 2 — PLANNING', 'PHASE 3 — EXECUTION'];
  const e = el('phase-display');
  if (e) e.textContent = labels[state.phase] || '';
}

// ── Room Info ──────────────────────────────────────────────────────────────
export function updateRoomInfo() {
  const room = ROOM[state.playerRoom];
  if (!room) return;
  const nameEl = el('room-name');
  const descEl = el('room-desc');
  const obsEl  = el('room-obs');
  if (nameEl) nameEl.textContent = room.name.toUpperCase();
  if (descEl) descEl.textContent = room.desc || '';
  if (obsEl) {
    const o = state.obs[state.playerRoom];
    if (o && o.total > 0) {
      const [a, b] = posteriorParams(state.playerRoom);
      const mean = (a / (a + b)).toFixed(2);
      obsEl.textContent = `P̂(guard) ≈ ${mean}  [${o.seen}/${o.total} obs]`;
    } else {
      obsEl.textContent = 'No observations yet';
    }
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────
export function updateStats() {
  const ap  = el('stat-ap');
  const trn = el('stat-turn');
  const det = el('stat-det');
  if (ap)  ap.textContent  = state.actionPoints;
  if (trn) trn.textContent = state.turn;
  if (det) det.textContent = state.detections;

  if (ap) {
    ap.style.color = state.actionPoints <= 3 ? 'var(--red)'
                   : state.actionPoints <= 6 ? 'var(--orange)'
                   : 'var(--accent)';
  }
  if (det) det.style.color = state.detections > 0 ? 'var(--red)' : 'var(--accent)';
}

// ── Move Buttons ───────────────────────────────────────────────────────────
export function updateMoves() {
  const container = el('move-buttons');
  if (!container) return;
  container.innerHTML = '';

  const adj = ADJ[state.playerRoom] || [];
  adj.forEach(targetId => {
    const target = ROOM[targetId];
    if (!target) return;
    const btn = document.createElement('button');
    btn.className = 'move-btn';
    btn.textContent = target.name.toUpperCase();
    btn.addEventListener('click', () => {
      mechanics.movePlayer(targetId);
      refreshUI();
    });
    container.appendChild(btn);
  });
}

// ── Phase 1 Actions ────────────────────────────────────────────────────────
export function updatePhase1Actions() {
  const observeBtn = el('observe-btn');
  const advanceBtn = el('advance-btn');
  const reconProg  = el('recon-progress');

  if (observeBtn) observeBtn.disabled = state.actionPoints < 1;

  if (advanceBtn) advanceBtn.disabled = !canAdvanceToPlanning();

  if (reconProg) {
    const rooms = Object.keys(state.obs).filter(id => state.obs[id] && state.obs[id].total > 0);
    const total = totalObservations();
    reconProg.textContent = `Rooms: ${rooms.length}/3 req  ·  Obs: ${total}/8 req`;
  }
}

// ── Phase 2 Actions ────────────────────────────────────────────────────────
export function updateRouteDisplay() {
  const routeList = el('route-list');
  const simResult = el('sim-result');
  const commitBtn = el('commit-btn');
  if (!routeList) return;

  if (state.route.length === 0) {
    routeList.innerHTML = '<span style="color:var(--muted)">No route planned</span>';
  } else {
    routeList.innerHTML = state.route.map((id, i) => {
      const r = ROOM[id];
      const color = r && r.isTarget ? 'var(--gold)' : 'var(--text)';
      return `<span style="color:${color}">${i + 1}. ${r ? r.name.toUpperCase() : id}</span>`;
    }).join('<br>');
  }

  if (simResult && state.simResult) {
    const sr  = state.simResult;
    const pct = (sr.rate * 100).toFixed(1);
    const col = sr.rate > 0.6 ? 'var(--green)' : sr.rate > 0.3 ? 'var(--orange)' : 'var(--red)';
    const ci  = successCI(sr.rate, sr.N);
    simResult.innerHTML =
      `<span style="color:${col}">Success: ${pct}% (${sr.success}/${sr.N})</span><br>` +
      `<span style="color:var(--muted)">95% CI: [${(ci.lower*100).toFixed(1)}%, ${(ci.upper*100).toFixed(1)}%]</span>`;
  } else if (simResult) {
    simResult.textContent = '';
  }

  if (commitBtn) {
    const endsAtVault = state.route.length > 0 && state.route[state.route.length - 1] === 'vault';
    commitBtn.disabled = !endsAtVault || !state.simResult;
  }
}

export function updateIntelSummary() {
  const list = el('intel-list');
  if (!list) return;
  list.innerHTML = '';

  const observedRooms = ROOMS.filter(r => {
    const o = state.obs[r.id];
    return o && o.total > 0;
  });

  if (observedRooms.length === 0) {
    list.innerHTML = '<span class="muted small">No rooms scouted yet</span>';
    return;
  }

  observedRooms.forEach(room => {
    const [a, b] = posteriorParams(room.id);
    const mean   = a / (a + b);
    const pct    = (mean * 100).toFixed(0);
    const color  = mean > 0.6 ? 'var(--red)' : mean > 0.35 ? 'var(--orange)' : 'var(--green)';

    const wrap = document.createElement('div');
    wrap.className = 'intel-bar-wrap';
    wrap.innerHTML = `
      <div class="intel-bar-label">
        <span>${room.name.toUpperCase()}</span>
        <span style="color:${color}">${pct}%</span>
      </div>
      <div class="intel-bar-track">
        <div class="intel-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>`;
    list.appendChild(wrap);
  });
}

// ── Phase 3 Actions ────────────────────────────────────────────────────────
export function updatePhase3Actions() {
  const execBtn    = el('execute-btn');
  const lockBtn    = el('pick-lock-btn');
  const camBtn     = el('disable-cameras-btn');
  const execStatus = el('exec-status');
  const suspText   = el('suspicion-text');

  const atVault   = state.playerRoom === 'vault';
  const atSrvRoom = state.playerRoom === 'server_room';

  if (execBtn) execBtn.disabled = state.actionPoints < 1 || state.heistComplete || state.heistFailed;
  if (lockBtn) lockBtn.disabled = !atVault || state.vaultUnlocked || state.actionPoints < 2;
  if (camBtn)  camBtn.disabled  = !atSrvRoom || state.camDisabled || state.actionPoints < 3;

  if (execStatus) {
    const step  = state.currentStep;
    const total = state.route ? state.route.length : 0;
    if (state.heistComplete) {
      execStatus.textContent = '✓ VAULT SECURED — HEIST COMPLETE';
      execStatus.style.color = 'var(--gold)';
    } else if (state.heistFailed) {
      execStatus.textContent = '✗ OPERATION BLOWN — HEIST FAILED';
      execStatus.style.color = 'var(--red)';
    } else {
      const nextRoom = state.route && state.route[step] ? ROOM[state.route[step]] : null;
      execStatus.textContent = nextRoom
        ? `Next: ${nextRoom.name.toUpperCase()} (step ${step + 1}/${total})`
        : 'Follow your route';
      execStatus.style.color = '';
    }
  }

  if (suspText) {
    const susp = (state.suspicion * 100).toFixed(1);
    const col  = state.suspicion > 0.7 ? 'var(--red)' : state.suspicion > 0.4 ? 'var(--orange)' : 'var(--green)';
    suspText.innerHTML =
      `Suspicion: <span style="color:${col}">${susp}%</span>  |  ` +
      `Noise: <span style="color:var(--muted)">${state.noiseLevel.toFixed(2)}</span>` +
      (state.alarmTriggered ? '  |  <span style="color:var(--red)">⚠ ALARM</span>' : '');
  }
}

// ── Log ────────────────────────────────────────────────────────────────────
export function updateLog() {
  const logEl = el('log');
  if (!logEl) return;
  // state.log is newest-first (unshift), show newest at top
  logEl.innerHTML = state.log.map(entry => {
    const cls = entry.type ? `log-entry ${entry.type}` : 'log-entry';
    return `<div class="${cls}">${entry.msg || entry.text || ''}</div>`;
  }).join('');
}

// ── Master Refresh ─────────────────────────────────────────────────────────
export function refreshUI() {
  updatePhaseDisplay();
  updateRoomInfo();
  updateStats();
  updateMoves();

  const p = state.phase;

  const p1 = document.querySelector('.phase1-only');
  const p2 = document.querySelector('.phase2-only');
  const p3 = document.querySelector('.phase3-only');
  if (p1) p1.classList.toggle('hidden', p !== 1);
  if (p2) p2.classList.toggle('hidden', p !== 2);
  if (p3) p3.classList.toggle('hidden', p !== 3);

  if (p === 1) updatePhase1Actions();
  if (p === 2) { updateRouteDisplay(); updateIntelSummary(); }
  if (p === 3) updatePhase3Actions();

  updateLog();
}
