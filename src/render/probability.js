// ============================================================
//  probability.js  —  Live probability panel rendering
//  Each phase shows different CS109 concepts visualized.
//  Phase 1: Beta posterior (Bayesian updating)
//  Phase 2: Bayesian Network + Monte Carlo histogram + CLT
//  Phase 3: Logistic suspicion meter + Poisson guard timer
// ============================================================

import { state, posteriorParams, roomObs } from '../game/state.js';
import { betaUnnorm, betaMean, betaMode, betaVar,
         poissonPMF, normalPDF, expPDF,
         binomPMF, sigmoid, calcSuspicion } from '../math/distributions.js';
import { securityNet } from '../math/bayesnet.js';
import { successCI }   from '../math/montecarlo.js';
import { ROOM, ADJ }   from '../data/museum.js';

const K = {
  bg:      '#040710',
  cyan:    '#00d4ff',
  gold:    '#f0a500',
  red:     '#ff3355',
  green:   '#00ff88',
  target:  '#ffd700',
  dim:     '#3a5a7a',
  text:    '#b0c8e0',
};

// ── Entry point ──────────────────────────────────────────────
export function drawProbPanel(ctx, W, H) {
  ctx.fillStyle = K.bg;
  ctx.fillRect(0, 0, W, H);

  if      (state.phase === 1) drawPhase1(ctx, W, H);
  else if (state.phase === 2) drawPhase2(ctx, W, H);
  else if (state.phase === 3) drawPhase3(ctx, W, H);
}

// ════════════════════════════════════════════════════════════
//  PHASE 1 — Beta Posterior (Bayesian Updating)
// ════════════════════════════════════════════════════════════
function drawPhase1(ctx, W, H) {
  const ob      = roomObs(state.playerRoom);
  const [a, b]  = posteriorParams(state.playerRoom);
  const hasData = ob.total > 0;

  const PAD = { l: 38, r: 14, t: 30, b: 32 };
  const pw  = W - PAD.l - PAD.r;
  const ph  = H - PAD.t - PAD.b;

  // Title
  label(ctx, `Beta(α=${a}, β=${b})  ·  P(guard in ${ROOM[state.playerRoom].name})`,
        4, 5, K.cyan, "9px");

  // Compute curve
  const N = 300;
  const pts = [];
  let maxY = 1e-9;
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    const y = betaUnnorm(x, a, b);
    pts.push({ x, y });
    if (y > maxY) maxY = y;
  }

  // Fill
  ctx.beginPath();
  pts.forEach(({ x, y }, i) => {
    const cx = PAD.l + x * pw;
    const cy = PAD.t + ph - (y / maxY) * ph;
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  });
  ctx.lineTo(PAD.l + pw, PAD.t + ph);
  ctx.lineTo(PAD.l,      PAD.t + ph);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,212,255,0.10)';
  ctx.fill();

  // Curve line
  ctx.beginPath();
  pts.forEach(({ x, y }, i) => {
    const cx = PAD.l + x * pw;
    const cy = PAD.t + ph - (y / maxY) * ph;
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  });
  ctx.strokeStyle = K.cyan; ctx.lineWidth = 1.8;
  ctx.shadowColor = K.cyan; ctx.shadowBlur = 5;
  ctx.stroke(); ctx.shadowBlur = 0;

  // MAP line (dashed gold)
  const mode = betaMode(a, b);
  drawVLine(ctx, PAD.l + mode * pw, PAD.t, PAD.t + ph, K.gold, [3, 3]);
  label(ctx, `MAP=${mode.toFixed(2)}`, PAD.l + mode * pw, PAD.t + ph + 3, K.gold, "8px", 'center');

  // MLE line (dashed green)
  if (hasData) {
    const mle  = ob.seen / ob.total;
    const mleX = PAD.l + mle * pw;
    drawVLine(ctx, mleX, PAD.t, PAD.t + ph, K.green, [2, 4]);
    label(ctx, `MLE=${mle.toFixed(2)}`, mleX, PAD.t + ph + 14, K.green, "8px", 'center');
  }

  drawAxes(ctx, PAD, pw, ph, ['0', '0.25', '0.5', '0.75', '1'], 'density');

  // Stats below chart
  const std = Math.sqrt(betaVar(a, b)).toFixed(3);
  const y0  = PAD.t + ph + 28;
  if (!hasData) {
    label(ctx, 'Observe rooms to build guard probability estimates.', 6, y0, K.dim, "9px");
    label(ctx, 'Each obs is a Bernoulli trial → Beta(k+1, n-k+1) posterior.', 6, y0 + 12, K.dim, "9px");
  } else {
    label(ctx, `n=${ob.total} obs · seen=${ob.seen} · σ=${std}`, 6, y0, K.text, "9px");
    label(ctx, 'More observations → narrower posterior → more confidence.', 6, y0 + 12, K.dim, "9px");
  }
}

// ════════════════════════════════════════════════════════════
//  PHASE 2 — Bayesian Network + Monte Carlo
// ════════════════════════════════════════════════════════════
function drawPhase2(ctx, W, H) {
  const split = Math.floor(H * 0.48);
  drawBayesNet(ctx, W, split);
  drawMCHistogram(ctx, W, H, split);
}

function drawBayesNet(ctx, W, H) {
  label(ctx, 'SECURITY BAYES NET  ·  P(Alarm | Camera, Guard, Motion)',
        4, 5, K.cyan, "9px");

  // Get current room estimates
  const room    = ROOM[state.playerRoom];
  const [a, b]  = posteriorParams(state.playerRoom);
  const pGuard  = betaMean(a, b);
  const pCam    = (room.cam && !state.camDisabled) ? 0.85 : 0.02;
  const pMotion = 0.65; // player is moving
  const pAlarm  = securityNet.queryAlarm(pCam, pGuard, pMotion);

  // Node positions
  const ny = 38, ay = H - 36;
  const nodes = [
    { id: 'cam',    label: 'Camera',  x: W * 0.20, y: ny, p: pCam    },
    { id: 'guard',  label: 'Guard',   x: W * 0.50, y: ny, p: pGuard  },
    { id: 'motion', label: 'Motion',  x: W * 0.80, y: ny, p: pMotion },
    { id: 'alarm',  label: 'ALARM',   x: W * 0.50, y: ay, p: pAlarm  },
  ];

  const alarmNode = nodes[3];

  // Edges (parent → alarm)
  nodes.slice(0, 3).forEach(n => {
    ctx.strokeStyle = `rgba(${pAlarm > 0.5 ? '255,51,85' : '0,212,255'},0.35)`;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y + 16);
    ctx.lineTo(alarmNode.x, alarmNode.y - 16);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(alarmNode.y - 16 - (n.y + 16), alarmNode.x - n.x);
    ctx.fillStyle = `rgba(${pAlarm > 0.5 ? '255,51,85' : '0,212,255'},0.5)`;
    ctx.beginPath();
    ctx.moveTo(alarmNode.x - 8 * Math.cos(angle - 0.4), alarmNode.y - 16 - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(alarmNode.x, alarmNode.y - 16);
    ctx.lineTo(alarmNode.x - 8 * Math.cos(angle + 0.4), alarmNode.y - 16 - 8 * Math.sin(angle + 0.4));
    ctx.fill();
  });

  // Draw nodes
  nodes.forEach(n => {
    const col = probColor(n.p);
    ctx.beginPath();
    ctx.arc(n.x, n.y, 15, 0, Math.PI * 2);
    ctx.fillStyle   = `rgba(${hexToRgb(col)},0.15)`;
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.stroke(); ctx.shadowBlur = 0;

    ctx.fillStyle    = col;
    ctx.font         = "8px 'Share Tech Mono', monospace";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(n.label, n.x, n.y - 18);
    ctx.textBaseline = 'middle';
    ctx.fillText(n.p.toFixed(2), n.x, n.y);
  });

  // Summary
  label(ctx,
    `P(Alarm) = ${pAlarm.toFixed(3)}  ·  marginalizing over 8 parent combos`,
    4, H - 14, K.dim, "8px");
}

function drawMCHistogram(ctx, W, H, offsetY) {
  const res = state.simResult;
  const y0  = offsetY + 4;
  const ph  = H - y0;

  label(ctx, 'MONTE CARLO SIMULATION  ·  Peak Suspicion Distribution',
        4, y0 + 2, K.gold, "9px");

  if (!res) {
    label(ctx, 'Plan a route on the map to run simulation.', W / 2, y0 + ph / 2, K.dim, "10px", 'center');
    return;
  }

  // CLT convergence line (top right)
  const pct = (res.rate * 100).toFixed(1);
  const ci  = successCI(res.rate, res.N);
  ctx.fillStyle = res.rate > 0.5 ? K.green : res.rate > 0.25 ? K.gold : K.red;
  ctx.font      = "bold 20px 'Orbitron', sans-serif";
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`${pct}%`, W - 6, y0 + 14);
  label(ctx, 'success', W - 6, y0 + 37, K.dim, "8px", 'right');
  label(ctx, `95% CI: [${(ci.lower*100).toFixed(1)}, ${(ci.upper*100).toFixed(1)}]`,
        W - 6, y0 + 48, K.dim, "8px", 'right');

  // Histogram bars
  const PAD  = { l: 28, r: 80, t: y0 + 20, b: 22 };
  const bw   = (W - PAD.l - PAD.r) / 10;
  const maxB = Math.max(...res.suspBuckets, 1);
  const barH = H - PAD.t - PAD.b;

  res.suspBuckets.forEach((count, i) => {
    const x  = PAD.l + i * bw;
    const bh = (count / maxB) * barH;
    const by = PAD.t + barH - bh;
    // Color: green→red across suspicion axis
    const t   = i / 9;
    const r   = Math.round(255 * t);
    const g   = Math.round(255 * (1 - t));
    ctx.fillStyle = `rgba(${r},${g},50,0.75)`;
    ctx.fillRect(x + 1, by, bw - 2, bh);
    ctx.strokeStyle = `rgba(${r},${g},50,0.4)`;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 1, by, bw - 2, bh);
  });

  // X axis labels
  ctx.fillStyle = K.dim; ctx.font = "8px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ['0', '0.5', '1'].forEach((v, i) => {
    ctx.fillText(v, PAD.l + (i / 2) * (W - PAD.l - PAD.r), H - PAD.b + 3);
  });
  label(ctx, '← suspicion level →', PAD.l + (W - PAD.l - PAD.r) / 2, H - 10, K.dim, "8px", 'center');

  // CLT note
  label(ctx, `N=${res.N} trials · CLT: rate stabilizes as N→∞`,
        4, H - 10, K.dim, "8px");
}

// ════════════════════════════════════════════════════════════
//  PHASE 3 — Live Execution Meters
// ════════════════════════════════════════════════════════════
function drawPhase3(ctx, W, H) {
  const third = Math.floor(H / 3);
  drawSuspicionMeter(ctx, W, third, 0);
  drawNoiseMeter(ctx, W, third, third);
  drawPoissonGuard(ctx, W, third, third * 2);
}

function drawSuspicionMeter(ctx, W, H, offsetY) {
  label(ctx, 'SUSPICION SCORE  ·  P(caught | features)  [Logistic Regression]',
        4, offsetY + 4, K.red, "9px");

  const s   = state.suspicion;
  const PAD = { l: 8, r: 8, t: offsetY + 20, b: offsetY + H - 10 };
  const bw  = W - PAD.l - PAD.r;
  const bh  = 18;
  const by  = PAD.t;

  // Background bar
  ctx.fillStyle = 'rgba(255,51,85,0.1)';
  ctx.fillRect(PAD.l, by, bw, bh);
  ctx.strokeStyle = 'rgba(255,51,85,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(PAD.l, by, bw, bh);

  // Fill
  const fillW = bw * s;
  const col   = s > 0.7 ? K.red : s > 0.4 ? K.gold : K.green;
  ctx.fillStyle   = col;
  ctx.shadowColor = col; ctx.shadowBlur = s > 0.5 ? 12 : 4;
  ctx.fillRect(PAD.l, by, fillW, bh);
  ctx.shadowBlur  = 0;

  label(ctx, `${(s * 100).toFixed(1)}%`, W / 2, by + 9, '#040710', "10px", 'center', 'bold');

  // Logistic curve mini-viz
  const cy = by + bh + 8;
  const ch = H - (cy - offsetY) - 8;
  if (ch > 20) {
    label(ctx, 'σ(w·x) logistic curve:', 8, cy, K.dim, "8px");
    const curveY = cy + 12;
    const curveH = ch - 14;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const z  = (i / 100) * 10 - 5;
      const sy = sigmoid(z);
      const cx2 = PAD.l + (i / 100) * bw;
      const yy  = curveY + curveH - sy * curveH;
      i === 0 ? ctx.moveTo(cx2, yy) : ctx.lineTo(cx2, yy);
    }
    ctx.strokeStyle = K.red; ctx.lineWidth = 1.2;
    ctx.shadowColor = K.red; ctx.shadowBlur = 4;
    ctx.stroke(); ctx.shadowBlur = 0;

    // Current suspicion dot on curve
    const z   = logit_approx(s);
    const dotX = PAD.l + ((z + 5) / 10) * bw;
    const dotY = curveY + curveH - s * curveH;
    ctx.beginPath();
    ctx.arc(Math.min(W - 8, Math.max(8, dotX)), dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle   = K.red;
    ctx.shadowColor = K.red; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }
}

function logit_approx(p) {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}

function drawNoiseMeter(ctx, W, H, offsetY) {
  label(ctx, 'NOISE LEVEL  ·  N(μ=0.3, σ=0.15)  [Normal Distribution]',
        4, offsetY + 4, K.gold, "9px");

  const n    = state.noiseLevel;
  const PAD  = { l: 8, r: 8 };
  const bw   = W - PAD.l - PAD.r;
  const by   = offsetY + 20;
  const bh   = 14;

  ctx.fillStyle = 'rgba(240,165,0,0.1)';
  ctx.fillRect(PAD.l, by, bw, bh);
  ctx.strokeStyle = 'rgba(240,165,0,0.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(PAD.l, by, bw, bh);

  ctx.fillStyle   = K.gold;
  ctx.shadowColor = K.gold; ctx.shadowBlur = 6;
  ctx.fillRect(PAD.l, by, bw * n, bh);
  ctx.shadowBlur  = 0;
  label(ctx, `${(n * 100).toFixed(0)}%`, W / 2, by + 7, '#040710', "9px", 'center', 'bold');

  // Normal PDF mini-curve
  const cy  = by + bh + 8;
  const ch  = H - (cy - offsetY) - 8;
  if (ch > 18) {
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x  = i / 100;
      const y  = normalPDF(x, 0.3, 0.15);
      const cx2 = PAD.l + x * bw;
      const yy  = cy + ch - Math.min(1, y / 3.0) * ch;
      i === 0 ? ctx.moveTo(cx2, yy) : ctx.lineTo(cx2, yy);
    }
    ctx.strokeStyle = K.gold; ctx.lineWidth = 1.2;
    ctx.shadowColor = K.gold; ctx.shadowBlur = 4;
    ctx.stroke(); ctx.shadowBlur = 0;
  }
}

function drawPoissonGuard(ctx, W, H, offsetY) {
  const roomId = state.playerRoom;
  const ob     = roomObs(roomId);
  const lam    = ob.total > 0 ? (ob.seen + 0.5) / (ob.total + 1) : 0.3;

  label(ctx, `GUARD ARRIVALS  ·  Poisson(λ=${lam.toFixed(2)})  [from recon]`,
        4, offsetY + 4, K.cyan, "9px");

  const PAD = { l: 28, r: 10, t: offsetY + 20, b: offsetY + H - 8 };
  const pw  = W - PAD.l - PAD.r;
  const ph  = PAD.b - PAD.t;

  // Draw PMF bars for k = 0..6
  const ks   = [0, 1, 2, 3, 4, 5, 6];
  const vals = ks.map(k => poissonPMF(k, lam));
  const maxV = Math.max(...vals, 0.01);
  const bw   = pw / ks.length;

  ks.forEach((k, i) => {
    const bh  = (vals[i] / maxV) * ph;
    const bx  = PAD.l + i * bw;
    const by  = PAD.b - bh;
    ctx.fillStyle   = K.cyan;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(bx + 1, by, bw - 2, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = K.cyan; ctx.lineWidth = 0.8;
    ctx.strokeRect(bx + 1, by, bw - 2, bh);
    label(ctx, `${k}`, bx + bw / 2, PAD.b + 3, K.dim, "8px", 'center');
  });

  label(ctx, 'guards/turn', W / 2, PAD.b + 13, K.dim, "8px", 'center');
  label(ctx, `E[X]=${lam.toFixed(2)} · mean wait=${(1/lam).toFixed(1)} turns [Exp(λ)]`,
        4, PAD.b + 13, K.dim, "8px");
}

// ════════════════════════════════════════════════════════════
//  SHARED DRAWING UTILITIES
// ════════════════════════════════════════════════════════════
function label(ctx, text, x, y, color, size, align = 'left', weight = 'normal') {
  ctx.fillStyle    = color;
  ctx.font         = `${weight} ${size} 'Share Tech Mono', monospace`;
  ctx.textAlign    = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

function drawVLine(ctx, x, y1, y2, color, dash = []) {
  ctx.beginPath();
  ctx.moveTo(x, y1); ctx.lineTo(x, y2);
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
}

function drawAxes(ctx, PAD, pw, ph, xLabels, yLabel) {
  ctx.strokeStyle = 'rgba(80,120,160,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + ph);
  ctx.lineTo(PAD.l + pw, PAD.t + ph);
  ctx.stroke();

  ctx.fillStyle = K.dim; ctx.font = "8px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  xLabels.forEach((v, i) => {
    const x = PAD.l + (i / (xLabels.length - 1)) * pw;
    ctx.fillText(v, x, PAD.t + ph + 3);
  });

  ctx.save();
  ctx.translate(10, PAD.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

// Interpolate color: green (p=0) → gold (p=0.5) → red (p=1)
function probColor(p) {
  if (p < 0.4) return K.green;
  if (p < 0.65) return K.gold;
  return K.red;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}