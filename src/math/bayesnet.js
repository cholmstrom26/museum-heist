// ============================================================
//  bayesnet.js  —  Bayesian Network for museum security system
//
//  Models the conditional dependencies between security nodes:
//
//    CameraActive ──┐
//    GuardNearby  ──┼──► AlarmTriggered
//    MotionSensor ──┘
//
//  We do exact inference by enumerating all parent combinations
//  (variable elimination over 3 binary parents = 8 rows).
// ============================================================

export class BayesNet {
  constructor() {
    // Conditional Probability Table: P(Alarm = 1 | Camera, Guard, Motion)
    // Key = binary string 'CGM' where C=camera, G=guard, M=motion
    this.cpt = {
      '000': 0.02,   // nothing active — baseline noise
      '001': 0.35,   // motion only — suspicious but unconfirmed
      '010': 0.50,   // guard only — guard hears something
      '011': 0.80,   // guard + motion — guard investigates
      '100': 0.60,   // camera only — camera detects movement
      '101': 0.85,   // camera + motion — camera confirms movement
      '110': 0.88,   // camera + guard — both see something
      '111': 0.99,   // all three — certain detection
    };
  }

  // ── Core inference ──────────────────────────────────────────
  // P(Alarm = 1) given soft evidence (prior probabilities for parents)
  // Uses the law of total probability, marginalizing over all 8 parent combos:
  //   P(A) = Σ_{c,g,m} P(A|c,g,m) · P(C=c) · P(G=g) · P(M=m)
  queryAlarm(pCam, pGuard, pMotion) {
    let p = 0;
    for (let c = 0; c <= 1; c++)
    for (let g = 0; g <= 1; g++)
    for (let m = 0; m <= 1; m++) {
      const pParents = (c ? pCam   : 1 - pCam)
                     * (g ? pGuard : 1 - pGuard)
                     * (m ? pMotion: 1 - pMotion);
      p += pParents * this.cpt[`${c}${g}${m}`];
    }
    return p;
  }

  // ── Interventional query ─────────────────────────────────────
  // What happens to P(Alarm) if we *disable* the cameras?
  // (do-calculus: do(Camera = 0), i.e. set pCam = 0)
  queryAlarmCamDisabled(pGuard, pMotion) {
    return this.queryAlarm(0, pGuard, pMotion);
  }

  // ── Sensitivity analysis ─────────────────────────────────────
  // How much does P(Alarm) change as one variable varies 0→1?
  // Returns array of { x, y } points for rendering
  alarmVsGuard(pCam, pMotion, steps = 50) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const pG = i / steps;
      return { x: pG, y: this.queryAlarm(pCam, pG, pMotion) };
    });
  }

  alarmVsCam(pGuard, pMotion, steps = 50) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const pC = i / steps;
      return { x: pC, y: this.queryAlarm(pC, pGuard, pMotion) };
    });
  }

  // ── Full CPT as array (for rendering the table) ──────────────
  getCPTRows() {
    return Object.entries(this.cpt).map(([key, pAlarm]) => ({
      cam:    parseInt(key[0]),
      guard:  parseInt(key[1]),
      motion: parseInt(key[2]),
      pAlarm,
    }));
  }

  // ── Room-level query ─────────────────────────────────────────
  // Given a room object and current game state, compute P(Alarm)
  // pGuard comes from the Beta posterior from Phase 1 observations
  queryRoom(room, pGuardEstimate, camDisabled = false, playerMoving = true) {
    const pCam    = (room.cam && !camDisabled) ? 0.85 : 0.02;
    const pGuard  = pGuardEstimate;
    const pMotion = playerMoving ? 0.70 : 0.20;
    return this.queryAlarm(pCam, pGuard, pMotion);
  }
}

// Single shared instance used throughout the game
export const securityNet = new BayesNet();