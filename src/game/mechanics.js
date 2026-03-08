// ============================================================
//  mechanics.js  —  All game actions
//  These are the only functions that mutate state.
//  Each action maps to a CS109 concept being demonstrated.
// ============================================================

import { state, roomObs, posteriorParams, canAdvanceToPlanning } from './state.js';
import { ADJ, ROOM }        from '../data/museum.js';
import { betaMean, betaMode, betaVar, normalSample,
         calcSuspicion, expSample, binomPMF,
         guardLambda }       from '../math/distributions.js';
import { securityNet }       from '../math/bayesnet.js';
import { runMonteCarlo, validateRoute } from '../math/montecarlo.js';

// ── Logging helper ───────────────────────────────────────────
function log(msg, type = 'info') {
  state.log.unshift({ msg, type, turn: state.turn });
  if (state.log.length > 60) state.log.pop();
}

// ════════════════════════════════════════════════════════════
//  PHASE 1 — RECONNAISSANCE
// ════════════════════════════════════════════════════════════

// Move player to an adjacent room
export function movePlayer(roomId) {
  if (!ADJ[state.playerRoom].includes(roomId)) {
    log(`No direct path to ${ROOM[roomId].name}.`, 'warn');
    return false;
  }

  state.playerRoom   = roomId;
  state.turnsInRoom  = 0;
  state.turn++;

  const room = ROOM[roomId];
  log(`Moved to <b>${room.name}</b>.`);

  if (room.guard) {
    state.detections++;
    log(`⚠ Guard present in ${room.name}. Detection risk HIGH.`, 'danger');
  }
  if (room.cam && !state.camDisabled) {
    log(`📷 Active camera in ${room.name}. Tread carefully.`, 'warn');
  }
  if (room.isTarget) {
    log(`★ You reached THE VAULT. The Monet is here.`, 'success');
  }
  return true;
}

// Observe current room — Bernoulli trial for guard presence
// Updates the Beta posterior: Beta(seen+1, unseen+1)
export function observeRoom() {
  if (state.actionPoints <= 0) {
    log('No Action Points remaining!', 'danger');
    return false;
  }

  const roomId = state.playerRoom;
  const room   = ROOM[roomId];

  if (!state.obs[roomId]) state.obs[roomId] = { seen: 0, total: 0 };
  const ob = state.obs[roomId];

  // True guard probability (hidden from player — drives the Bernoulli trial)
  // Guard rooms: 0.78 base | adjacent to guard: 0.22 | otherwise: 0.06
  const trueP = room.guard
    ? 0.78
    : ADJ[roomId].some(id => ROOM[id].guard) ? 0.22 : 0.06;

  const spotted = Math.random() < trueP;
  if (spotted) ob.seen++;
  ob.total++;

  state.actionPoints--;
  state.turn++;

  // Compute updated Beta posterior
  const [a, b] = posteriorParams(roomId);
  const map    = betaMode(a, b).toFixed(3);
  const mle    = (ob.seen / ob.total).toFixed(3);

  if (spotted) {
    log(`[OBS] <b>${room.name}</b>: guard spotted (${ob.seen}/${ob.total})`, 'warn');
  } else {
    log(`[OBS] <b>${room.name}</b>: clear (${ob.seen}/${ob.total})`, 'info');
  }
  log(`→ Posterior Beta(α=${a}, β=${b}) · MLE=${mle} · MAP=${map}`, 'dim');
  return true;
}

// Advance from Phase 1 → Phase 2
export function advanceToPlanning() {
  if (!canAdvanceToPlanning()) {
    log('Not enough reconnaissance data. Observe more rooms first.', 'warn');
    return false;
  }
  state.phase = 2;
  state.route = ['entrance'];   // route starts from entrance
  log('══ PHASE 2: PLANNING ══', 'system');
  log('Select your route by clicking rooms on the map.', 'system');
  log('Run a Monte Carlo simulation to estimate your success probability.', 'dim');
  return true;
}

// ════════════════════════════════════════════════════════════
//  PHASE 2 — PLANNING
// ════════════════════════════════════════════════════════════

// Add a room to the planned route (must be adjacent to last room)
export function addToRoute(roomId) {
  if (state.phase !== 2) return false;
  const last = state.route[state.route.length - 1];
  if (!ADJ[last].includes(roomId)) {
    log(`${ROOM[roomId].name} is not adjacent to ${ROOM[last].name}.`, 'warn');
    return false;
  }
  if (state.route.includes(roomId)) {
    log(`${ROOM[roomId].name} is already in your route.`, 'warn');
    return false;
  }
  state.route.push(roomId);
  log(`Added <b>${ROOM[roomId].name}</b> to route (step ${state.route.length}).`);

  // Auto-run simulation whenever route changes
  if (state.route.length >= 2) runSimulation();
  return true;
}

// Remove the last room from the planned route
export function removeLastFromRoute() {
  if (state.route.length <= 1) return false;
  const removed = state.route.pop();
  log(`Removed <b>${ROOM[removed].name}</b> from route.`);
  if (state.route.length >= 2) runSimulation();
  else state.simResult = null;
  return true;
}

// Clear route back to just the starting room
export function clearRoute() {
  state.route     = ['entrance'];
  state.simResult = null;
  log('Route cleared.', 'warn');
}

// Run Monte Carlo simulation on current route
export function runSimulation(N = 1000) {
  const { valid, error } = validateRoute(state.route);
  if (!valid) {
    // Partial route — simulate anyway for feedback, just note it
    log(`Partial route simulation (${state.route.length} rooms so far)...`, 'dim');
  }

  state.simResult = runMonteCarlo(state.route, state.obs, state.camDisabled, N);
  const r = state.simResult;
  const pct = (r.rate * 100).toFixed(1);
  log(`Monte Carlo (N=${N}): <b>${pct}% success rate</b> · ${r.success}/${N} trials succeeded`, 'system');
  return state.simResult;
}

// Commit route and advance to Phase 3
export function commitRoute() {
  const { valid, error } = validateRoute(state.route);
  if (!valid) {
    log(`Cannot commit: ${error}`, 'danger');
    return false;
  }
  state.phase       = 3;
  state.currentStep = 0;
  state.suspicion   = 0;
  state.playerRoom  = state.route[0];
  log('══ PHASE 3: EXECUTION ══', 'system');
  log('Follow your planned route. Each step updates your suspicion score.', 'system');
  log(`Route locked: ${state.route.map(id => ROOM[id].name).join(' → ')}`, 'dim');
  return true;
}

// ════════════════════════════════════════════════════════════
//  PHASE 3 — EXECUTION
// ════════════════════════════════════════════════════════════

// Execute one step along the committed route
export function executeStep() {
  if (state.phase !== 3) return false;
  if (state.heistComplete || state.heistFailed) return false;

  const nextRoom = state.route[state.currentStep + 1];
  if (!nextRoom) {
    log('Already at the end of the route.', 'warn');
    return false;
  }

  state.currentStep++;
  state.playerRoom  = nextRoom;
  state.turnsInRoom = 0;
  state.turn++;

  const room = ROOM[nextRoom];

  // ── Sample noise from Normal distribution ──────────────────
  const noise = Math.max(0, Math.min(1, normalSample(0.3, 0.15)));
  state.noiseLevel = noise;

  // ── Get guard probability from Beta posterior ──────────────
  const ob     = roomObs(nextRoom);
  const [a, b] = posteriorParams(nextRoom);
  const pGuard = betaMean(a, b);

  // ── Query Bayesian Network for P(alarm) ────────────────────
  const pCam    = (room.cam && !state.camDisabled) ? 0.85 : 0.02;
  const pMotion = Math.min(0.95, noise + 0.15);
  const pAlarm  = securityNet.queryAlarm(pCam, pGuard, pMotion);

  if (Math.random() < pAlarm * 0.6) {
    state.alarmTriggered = true;
    log(`🚨 ALARM triggered in ${room.name}!`, 'danger');
  }

  // ── Logistic regression suspicion update ───────────────────
  const guardProx = pGuard;
  const turnsNorm = Math.min(state.turnsInRoom / 10, 1);
  const newSusp   = calcSuspicion({
    noise,
    guardProx,
    cameraOn:  room.cam && !state.camDisabled,
    alarmOn:   state.alarmTriggered,
    turnsNorm,
  });

  // Suspicion is sticky — it only goes up (or fades very slowly)
  state.suspicion = Math.min(1, Math.max(state.suspicion * 0.85, newSusp));

  log(`Entered <b>${room.name}</b> · noise=${noise.toFixed(2)} · P(alarm)=${pAlarm.toFixed(3)} · suspicion=${state.suspicion.toFixed(3)}`);

  // ── Detection check ────────────────────────────────────────
  if (Math.random() < state.suspicion * 0.6) {
    state.heistFailed = true;
    state.detections++;
    log(`💀 CAUGHT in ${room.name}! Game over.`, 'danger');
    return false;
  }

  // ── Vault reached ──────────────────────────────────────────
  if (nextRoom === 'vault') {
    log(`★ You reached THE VAULT. Attempt to pick the lock...`, 'success');
    // Lock-picking handled separately via pickLock()
  }

  return true;
}

// Pick the vault lock — Binomial(n, p) demo
// n = attempts used, p = skill (from Beta posterior of player ability)
export function pickLock() {
  if (state.playerRoom !== 'vault') {
    log('You need to be in the vault to pick the lock.', 'warn');
    return false;
  }
  if (state.vaultUnlocked) {
    log('Vault is already open!', 'info');
    return false;
  }

  state.lockPickAttempts++;
  const n = state.lockPickAttempts;

  // Skill level: starts at 0.45, improves each attempt (Beta updating)
  const skillAlpha = 2 + Math.floor(n / 2);
  const skillBeta  = 3;
  const p          = betaMean(skillAlpha, skillBeta);

  // P(at least 1 success in n attempts) = 1 - (1-p)^n
  const pSuccess = 1 - Math.pow(1 - p, n);
  const success  = Math.random() < pSuccess;

  log(`Lock pick attempt ${n}: skill p=${p.toFixed(3)} · P(open by now)=${pSuccess.toFixed(3)}`, 'dim');

  if (success) {
    state.vaultUnlocked  = true;
    state.heistComplete  = true;
    log(`✅ VAULT OPENED after ${n} attempt(s)! The Monet is yours.`, 'success');
    log(`🎉 HEIST COMPLETE — You win!`, 'success');
  } else {
    state.suspicion = Math.min(1, state.suspicion + 0.08);
    log(`Lock holds. Suspicion rising (${state.suspicion.toFixed(3)}).`, 'warn');

    if (Math.random() < state.suspicion * 0.5) {
      state.heistFailed = true;
      log(`💀 Guard heard you picking the lock. CAUGHT!`, 'danger');
    }
  }
  return success;
}

// Disable cameras at the server room
export function disableCameras() {
  if (state.playerRoom !== 'server_room') {
    log('You need to be in the Server Room to disable cameras.', 'warn');
    return false;
  }
  if (state.camDisabled) {
    log('Cameras are already disabled.', 'info');
    return false;
  }
  state.camDisabled = true;
  state.actionPoints = Math.max(0, state.actionPoints - 2);
  log('📡 Cameras disabled! P(alarm) drops significantly in all rooms.', 'success');
  log('→ P(Camera=active) set to 0.02 across the museum.', 'dim');
  return true;
}