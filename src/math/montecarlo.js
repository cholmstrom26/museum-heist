// ============================================================
//  montecarlo.js  —  Monte Carlo heist simulator
//
//  Runs N simulated heists along a planned route and returns
//  a distribution of outcomes. This demonstrates:
//    - Monte Carlo estimation
//    - The Central Limit Theorem (success rate converges as N grows)
//    - How Beta posteriors from Phase 1 feed into Phase 2 planning
// ============================================================

import { ROOM, ADJ } from '../data/museum.js';
import { betaMean, normalSample }  from './distributions.js';
import { securityNet } from './bayesnet.js';

// ── Main simulator ───────────────────────────────────────────
// route      : array of room IDs in order (planned path)
// obs        : observations object from game state { roomId: {seen, total} }
// camDisabled: whether server room has been accessed
// N          : number of trials (default 1000)
//
// Returns:
//   { success, fail, rate, N, suspBuckets, cltData }
export function runMonteCarlo(route, obs, camDisabled = false, N = 1000) {
  let success = 0;
  let fail    = 0;

  // Histogram of peak suspicion levels across all trials (10 buckets 0→1)
  const suspBuckets = new Array(10).fill(0);

  // For CLT demo: track running success rate at each 100-trial checkpoint
  const cltData = [];

  for (let trial = 0; trial < N; trial++) {
    const result = simulateTrial(route, obs, camDisabled);

    if (result.caught) {
      fail++;
    } else {
      success++;
    }

    // Record peak suspicion bucket
    const bucket = Math.min(9, Math.floor(result.peakSuspicion * 10));
    suspBuckets[bucket]++;

    // CLT checkpoint every 100 trials
    if ((trial + 1) % 100 === 0) {
      cltData.push({
        n:    trial + 1,
        rate: success / (trial + 1),
      });
    }
  }

  return {
    success,
    fail,
    rate:        success / N,
    N,
    suspBuckets,
    cltData,     // shows rate stabilizing — Central Limit Theorem in action
  };
}

// ── Single trial ─────────────────────────────────────────────
// Simulates one complete heist attempt along the route.
// Each step samples from the probability distributions
// built up during Phase 1 reconnaissance.
function simulateTrial(route, obs, camDisabled) {
  let suspicion     = 0;
  let alarmOn       = false;
  let peakSuspicion = 0;
  let caught        = false;

  for (let step = 0; step < route.length; step++) {
    const roomId = route[step];
    const room   = ROOM[roomId];
    const ob     = obs[roomId];

    // ── Sample guard presence from Beta posterior ──────────────
    // If we observed this room in Phase 1, use our posterior.
    // Otherwise fall back to a weak prior Beta(1,1) = Uniform.
    const alpha = ob ? ob.seen  + 1 : 1;
    const beta  = ob ? (ob.total - ob.seen) + 1 : 1;
    const pGuard = betaMean(alpha, beta);
    const guardHere = Math.random() < pGuard;

    // ── Sample player noise from Normal distribution ───────────
    // Moving generates noise ~ N(0.3, 0.15²), clamped to [0,1]
    const rawNoise = normalSample(0.3, 0.15);
    const noise    = Math.max(0, Math.min(1, rawNoise));

    // ── Query Bayesian Network for P(Alarm) ────────────────────
    const pCam    = (room.cam && !camDisabled) ? 0.85 : 0.02;
    const pGuardE = guardHere ? 0.90 : 0.08;
    const pMotion = Math.min(0.95, noise + 0.15);
    const pAlarm  = securityNet.queryAlarm(pCam, pGuardE, pMotion);

    // ── Alarm fires probabilistically ─────────────────────────
    if (Math.random() < pAlarm) alarmOn = true;

    // ── Suspicion accumulates along the route ──────────────────
    suspicion = Math.min(1, suspicion + pAlarm * 0.28);
    if (alarmOn) suspicion = Math.min(1, suspicion + 0.15);

    // ── Detection check ────────────────────────────────────────
    // P(caught this step) = suspicion × 0.55
    if (Math.random() < suspicion * 0.55) {
      caught = true;
      break;
    }

    if (suspicion > peakSuspicion) peakSuspicion = suspicion;
  }

  return { caught, peakSuspicion };
}

// ── Route validator ──────────────────────────────────────────
// Checks that each step in a route is adjacent to the previous.
// Returns { valid: bool, error: string | null }
export function validateRoute(route) {
  if (route.length < 2) {
    return { valid: false, error: 'Route must have at least 2 rooms.' };
  }
  for (let i = 1; i < route.length; i++) {
    if (!ADJ[route[i - 1]].includes(route[i])) {
      return {
        valid: false,
        error: `No direct path from ${route[i - 1]} to ${route[i]}.`,
      };
    }
  }
  const last = route[route.length - 1];
  if (last !== 'vault') {
    return { valid: false, error: 'Route must end at THE VAULT.' };
  }
  return { valid: true, error: null };
}

// ── Confidence interval (CLT) ─────────────────────────────────
// Returns the 95% confidence interval for the success rate
// using the normal approximation to the binomial:
//   p̂ ± 1.96 · sqrt(p̂(1-p̂)/N)
export function successCI(rate, N) {
  const margin = 1.96 * Math.sqrt((rate * (1 - rate)) / N);
  return {
    lower: Math.max(0, rate - margin),
    upper: Math.min(1, rate + margin),
    margin,
  };
}