// ============================================================
//  map.js  —  Museum canvas rendering
//  Draws the floor plan, rooms, corridors, player, and
//  phase-specific overlays (route in Phase 2, suspicion in Phase 3)
// ============================================================

import { ROOMS, ROOM, ADJ, CONNECTIONS, roomRect } from '../data/museum.js';
import { state } from '../game/state.js';
import { posteriorParams } from '../game/state.js';
import { betaMean } from '../math/distributions.js';

// ── Palette ──────────────────────────────────────────────────
const K = {
  bg:          '#040710',
  grid:        'rgba(18,36,60,0.25)',
  corridor:    '#06090f',
  corrBorder:  '#0f1e2e',
  room:        '#090e1c',
  roomBorder:  '#192840',
  roomAdj:     '#0b1422',
  roomAdjBord: '#263d58',
  roomHov:     '#0c1830',
  roomHovBord: '#3a6a9a',
  roomActive:  '#0f1e36',
  roomActBord: '#00d4ff',
  roomTarget:  '#0d1008',
  roomTgtBord: '#ffd700',
  cyan:        '#00d4ff',
  gold:        '#f0a500',
  red:         '#ff3355',
  green:       '#00ff88',
  target:      '#ffd700',
  textDim:     '#3a5a7a',
  text:        '#b0c8e0',
};

// ── Rounded rectangle helper ─────────────────────────────────
function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 1, glow = null) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);         ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x+w, y,   x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h,   x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y,     x+r, y);
  ctx.closePath();
  if (glow)   { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
  if (fill)   { ctx.fillStyle = fill;   ctx.fill(); }
  ctx.shadowBlur = 0;
  if (glow)   { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  ctx.shadowBlur = 0;
}

// ── Main draw call (called every animation frame) ────────────
export function drawMap(ctx, W, H, ts) {
  drawBackground(ctx, W, H);
  drawCorridors(ctx, W, H);
  drawRooms(ctx, W, H, ts);
  drawPlayer(ctx, W, H, ts);
  drawLegend(ctx, W, H);

  // Phase-specific overlays
  if (state.phase === 2) drawRouteOverlay(ctx, W, H);
  if (state.phase === 3) drawExecutionOverlay(ctx, W, H, ts);
}

// ── Background ───────────────────────────────────────────────
function drawBackground(ctx, W, H) {
  ctx.fillStyle = K.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = K.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Watermark
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.fillStyle   = K.cyan;
  ctx.font        = "bold 68px 'Orbitron', sans-serif";
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FLOOR PLAN', W / 2, H / 2);
  ctx.restore();
}

// ── Corridors ────────────────────────────────────────────────
const CORR = 9; // corridor half-width in pixels

function drawCorridors(ctx, W, H) {
  CONNECTIONS.forEach(([aid, bid]) => {
    const a = roomRect(ROOM[aid], W, H);
    const b = roomRect(ROOM[bid], W, H);
    const horiz = ROOM[aid].row === ROOM[bid].row;

    ctx.fillStyle   = K.corridor;
    ctx.strokeStyle = K.corrBorder;
    ctx.lineWidth   = 1;

    if (horiz) {
      const gapX = b.x - (a.x + a.w);
      ctx.fillRect  (a.x + a.w, a.cy - CORR, gapX, CORR * 2);
      ctx.strokeRect(a.x + a.w, a.cy - CORR, gapX, CORR * 2);
    } else {
      const gapY = b.y - (a.y + a.h);
      ctx.fillRect  (a.cx - CORR, a.y + a.h, CORR * 2, gapY);
      ctx.strokeRect(a.cx - CORR, a.y + a.h, CORR * 2, gapY);
    }
  });
}

// ── Rooms ────────────────────────────────────────────────────
function drawRooms(ctx, W, H, ts) {
  const adj = ADJ[state.playerRoom];

  ROOMS.forEach(room => {
    const r      = roomRect(room, W, H);
    const isMe   = room.id === state.playerRoom;
    const isAdj  = adj.includes(room.id);
    const isHov  = room.id === state.hoveredRoom;
    const isTgt  = room.isTarget;
    const inRoute = state.route.includes(room.id);
    const pulse  = 0.55 + 0.45 * Math.sin(ts * 0.0035);

    // Choose fill and border based on state
    let fill = K.room, border = K.roomBorder, glow = null, lw = 1;

    if (isMe) {
      fill = K.roomActive; border = K.cyan; glow = K.cyan; lw = 1.5;
    } else if (state.phase === 2 && inRoute) {
      fill = '#0a1a10'; border = K.green; glow = 'rgba(0,255,136,0.5)'; lw = 1.5;
    } else if (isHov && isAdj && state.phase !== 3) {
      fill = K.roomHov; border = K.roomHovBord; glow = 'rgba(0,180,220,0.5)';
    } else if (isAdj && state.phase !== 3) {
      fill = K.roomAdj; border = K.roomAdjBord;
    } else if (isTgt) {
      fill = K.roomTarget; border = K.target;
      glow = `rgba(255,215,0,${pulse * 0.9})`; lw = 1.5;
    }

    // In Phase 1+2, shade rooms by P(guard) if observed
    if (!isMe && state.phase >= 1) {
      const [a, b] = posteriorParams(room.id);
      const ob     = state.obs[room.id];
      if (ob && ob.total > 0) {
        const pG = betaMean(a, b);
        // Subtle danger tint based on guard probability
        if (pG > 0.6) fill = '#160a0c';
        else if (pG > 0.3) fill = '#12100a';
      }
    }

    rrect(ctx, r.x, r.y, r.w, r.h, 6, fill, border, lw, glow);

    // Reachable highlight bar
    if (isAdj && !isMe && state.phase !== 3) {
      ctx.fillStyle = 'rgba(0,100,170,0.15)';
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 3);
    }

    drawRoomContents(ctx, room, r, ts);
    drawRoomLabel(ctx, room, r);
    drawObsDot(ctx, room, r);
  });
}

// Icons inside each room
function drawRoomContents(ctx, room, r, ts) {
  const pulse   = 0.65 + 0.35 * Math.sin(ts * 0.004);
  const multi   = [room.cam, room.guard, room.isTarget].filter(Boolean).length > 1;
  let iconX     = multi ? r.cx - 11 : r.cx;
  const iconY   = r.cy - 10;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (room.cam) {
    ctx.font        = '15px serif';
    ctx.shadowColor = K.gold; ctx.shadowBlur = 7;
    ctx.fillText('📷', iconX, iconY);
    ctx.shadowBlur  = 0;
    if (multi) iconX += 22;
  }
  if (room.guard) {
    ctx.font        = '15px serif';
    ctx.shadowColor = K.red; ctx.shadowBlur = 10;
    ctx.fillText('👮', iconX, iconY);
    ctx.shadowBlur  = 0;
    if (multi) iconX += 22;
  }
  if (room.isTarget) {
    ctx.font        = '20px serif';
    ctx.shadowColor = K.target; ctx.shadowBlur = 14 * pulse;
    ctx.fillText('🎨', r.cx, r.cy - 10);
    ctx.shadowBlur  = 0;
  }
}

// Room name label
function drawRoomLabel(ctx, room, r) {
  const isMe  = room.id === state.playerRoom;
  const isAdj = ADJ[state.playerRoom].includes(room.id);
  ctx.fillStyle = isMe      ? K.cyan
                : room.isTarget ? K.target
                : isAdj     ? '#7aaaca'
                : K.textDim;
  ctx.font         = "bold 9px 'Share Tech Mono', monospace";
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';

  const words = room.name.split(' ');
  if (words.length <= 2) {
    ctx.fillText(room.name, r.cx, r.y + r.h - 8);
  } else {
    const mid = Math.ceil(words.length / 2);
    ctx.fillText(words.slice(0, mid).join(' '), r.cx, r.y + r.h - 18);
    ctx.fillText(words.slice(mid).join(' '),    r.cx, r.y + r.h - 7);
  }
}

// Small dot showing observation count + posterior color
function drawObsDot(ctx, room, r) {
  const ob = state.obs[room.id];
  if (!ob || ob.total === 0) return;

  const p   = ob.seen / ob.total;
  const col = p > 0.5  ? `rgba(255,80,80,${Math.min(1, p + 0.2)})`
            : p > 0.2  ? 'rgba(240,165,0,0.85)'
            :             'rgba(0,255,136,0.75)';

  ctx.beginPath();
  ctx.arc(r.x + r.w - 9, r.y + 9, 5, 0, Math.PI * 2);
  ctx.fillStyle   = col;
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur  = 0;

  ctx.fillStyle    = '#040710';
  ctx.font         = "7px 'Share Tech Mono', monospace";
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ob.total, r.x + r.w - 9, r.y + 9);
}

// ── Player character ─────────────────────────────────────────
function drawPlayer(ctx, W, H, ts) {
  const room  = ROOM[state.playerRoom];
  const r     = roomRect(room, W, H);
  const px    = r.cx;
  const py    = r.cy - 16;
  const pulse = 0.5 + 0.5 * Math.sin(ts * 0.005);

  // Outer halo
  ctx.beginPath();
  ctx.arc(px, py, 14 + pulse * 3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,255,136,${0.06 * pulse})`;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(px, py, 7 + pulse * 1.5, 0, Math.PI * 2);
  ctx.fillStyle   = K.green;
  ctx.shadowColor = K.green; ctx.shadowBlur = 14 + pulse * 8;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // Inner dot
  ctx.beginPath();
  ctx.arc(px, py, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();

  // Label
  ctx.fillStyle    = K.green;
  ctx.font         = "8px 'Share Tech Mono', monospace";
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('YOU', px, py - 10);
}

// ── Phase 2: Route overlay ───────────────────────────────────
function drawRouteOverlay(ctx, W, H) {
  if (state.route.length < 2) return;

  // Draw connecting lines between route rooms
  ctx.strokeStyle = 'rgba(0,255,136,0.4)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 4]);

  for (let i = 1; i < state.route.length; i++) {
    const a = roomRect(ROOM[state.route[i - 1]], W, H);
    const b = roomRect(ROOM[state.route[i]],     W, H);
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw step numbers on route rooms
  state.route.forEach((id, i) => {
    const r = roomRect(ROOM[id], W, H);
    ctx.beginPath();
    ctx.arc(r.cx, r.y + 10, 9, 0, Math.PI * 2);
    ctx.fillStyle   = i === 0 ? K.cyan : K.green;
    ctx.shadowColor = i === 0 ? K.cyan : K.green;
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.fillStyle    = '#040710';
    ctx.font         = "bold 9px 'Share Tech Mono', monospace";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, r.cx, r.y + 10);
  });
}

// ── Phase 3: Execution overlay ───────────────────────────────
function drawExecutionOverlay(ctx, W, H, ts) {
  // Highlight current target room
  const targetId = state.route[state.currentStep];
  if (!targetId) return;

  const r     = roomRect(ROOM[targetId], W, H);
  const pulse = 0.5 + 0.5 * Math.sin(ts * 0.006);

  ctx.strokeStyle = `rgba(0,212,255,${0.4 + pulse * 0.4})`;
  ctx.lineWidth   = 2;
  ctx.shadowColor = K.cyan; ctx.shadowBlur = 12 * pulse;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.shadowBlur  = 0;

  // Show suspicion as red overlay on current room
  if (state.suspicion > 0.1) {
    ctx.fillStyle = `rgba(255,51,85,${state.suspicion * 0.18})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

// ── Legend ───────────────────────────────────────────────────
function drawLegend(ctx, W, H) {
  const lx = 8, ly = H - 64, lw = 196, lh = 56;
  ctx.fillStyle   = 'rgba(4,7,16,0.88)';
  ctx.strokeStyle = K.corrBorder; ctx.lineWidth = 1;
  ctx.fillRect  (lx, ly, lw, lh);
  ctx.strokeRect(lx, ly, lw, lh);

  ctx.fillStyle    = K.textDim;
  ctx.font         = "8px 'Share Tech Mono', monospace";
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('LEGEND', lx + 6, ly + 5);

  const items = [
    ['●', K.green,  'Your position'],
    ['📷', K.gold,  'Camera'],
    ['👮', K.red,   'Guard station'],
    ['🎨', K.target,'Target artifact'],
  ];

  items.forEach(([ico, col, lbl], i) => {
    const ix = lx + 6  + (i % 2) * 96;
    const iy = ly + 18 + Math.floor(i / 2) * 16;
    ctx.fillStyle    = col;
    ctx.font         = '11px serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(ico, ix, iy + 4);
    ctx.fillStyle    = K.textDim;
    ctx.font         = "8px 'Share Tech Mono', monospace";
    ctx.fillText(lbl, ix + 14, iy + 4);
  });
}