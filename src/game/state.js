// ============================================================
//  state.js  —  Central game state
//  Single source of truth. Every other module reads from here.
//  Nothing mutates state directly — use mechanics.js for that.
// ============================================================

export const state = {

  // ── Phase ────────────────────────────────────────────────────
  // 1 = Reconnaissance, 2 = Planning, 3 = Execution
  phase: 1,

  // ── Player ───────────────────────────────────────────────────
  playerRoom:   'entrance',
  actionPoints: 15,
  turn:         0,
  detections:   0,

  // ── Phase 1: Reconnaissance ──────────────────────────────────
  // obs[roomId] = { seen: k, total: n }
  // Each observation is a Bernoulli trial: did we see a guard?
  // Posterior becomes Beta(seen+1, (total-seen)+1)
  obs: {},

  // ── Phase 2: Planning ─────────────────────────────────────────
  // route = ordered list of room IDs the player plans to take
  // simResult = last Monte Carlo simulation output
  route:        [],
  simResult:    null,

  // ── Phase 3: Execution ────────────────────────────────────────
  suspicion:        0,      // current suspicion level (0–1)
  alarmTriggered:   false,  // has the alarm gone off?
  camDisabled:      false,  // did player disable cameras at server room?
  currentStep:      0,      // which step in committed route are we on
  noiseLevel:       0,      // last noise generated (for display)
  turnsInRoom:      0,      // how many turns spent in current room
  lockPickAttempts: 0,      // attempts made at vault lock
  vaultUnlocked:    false,  // has the vault been opened?
  heistComplete:    false,  // player reached vault and grabbed the Monet
  heistFailed:      false,  // player was caught

  // ── Animation ────────────────────────────────────────────────
  hoveredRoom: null,        // room ID the mouse is over
  animTime:    0,           // timestamp from requestAnimationFrame

  // ── Log ───────────────────────────────────────────────────────
  // Array of { msg, type, turn } — newest first
  log: [],
};

// ── Computed helpers (read-only views of state) ──────────────

// Total observations made across all rooms
export function totalObservations() {
  return Object.values(state.obs).reduce((sum, o) => sum + o.total, 0);
}

// Observations for one room (safe — returns zeroed object if none)
export function roomObs(roomId) {
  return state.obs[roomId] ?? { seen: 0, total: 0 };
}

// Beta posterior params for a room: [alpha, beta]
export function posteriorParams(roomId) {
  const o = roomObs(roomId);
  return [o.seen + 1, (o.total - o.seen) + 1];
}

// Is there enough recon data to advance to Phase 2?
// Require at least 8 observations spread across 3+ rooms
export function canAdvanceToPlanning() {
  const rooms = Object.keys(state.obs).filter(id => state.obs[id].total > 0);
  return totalObservations() >= 8 && rooms.length >= 3;
}

// Is the planned route valid enough to commit to Phase 3?
export function canCommitRoute() {
  return (
    state.route.length >= 2 &&
    state.route[state.route.length - 1] === 'vault' &&
    state.simResult !== null
  );
}

// Phase 3: what room is the player currently executing towards?
export function currentTargetRoom() {
  return state.route[state.currentStep] ?? null;
}

// Phase 1 progress: what fraction of the required observations done?
export function reconProgress() {
  return Math.min(1, totalObservations() / 8);
}