// ============================================================
//  main.js  —  Entry point: wires everything together
// ============================================================

import { state }          from './game/state.js';
import * as mechanics     from './game/mechanics.js';
import { ROOM, ADJ, roomRect } from './data/museum.js';
import { drawMap }        from './render/map.js';
import { drawProbPanel }  from './render/probability.js';
import { refreshUI }      from './render/ui.js';

// ── Canvas Setup ────────────────────────────────────────────────────────────
const mapCanvas  = document.getElementById('map-canvas');
const probCanvas = document.getElementById('prob-canvas');
const mapCtx     = mapCanvas.getContext('2d');
const probCtx    = probCanvas.getContext('2d');

function resizeCanvases() {
  const mw = mapCanvas.clientWidth;
  const mh = mapCanvas.clientHeight;
  const pw = probCanvas.clientWidth;
  const ph = probCanvas.clientHeight;
  if (mw > 0 && mh > 0) { mapCanvas.width  = mw; mapCanvas.height  = mh; }
  if (pw > 0 && ph > 0) { probCanvas.width = pw; probCanvas.height = ph; }
}

window.addEventListener('resize', resizeCanvases);

// ── Animation Loop ───────────────────────────────────────────────────────────
function loop(ts) {
  state.animTime = ts;
  resizeCanvases();
  drawMap(mapCtx, mapCanvas.width, mapCanvas.height, ts);
  drawProbPanel(probCtx, probCanvas.width, probCanvas.height);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── Map Canvas Click ─────────────────────────────────────────────────────────
mapCanvas.addEventListener('click', (e) => {
  const rect = mapCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const W = mapCanvas.width;
  const H = mapCanvas.height;

  let clicked = null;
  for (const room of Object.values(ROOM)) {
    const r = roomRect(room, W, H);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      clicked = room.id;
      break;
    }
  }
  if (!clicked) return;

  if (state.phase === 1) {
    // Use ADJ (not room.connections which doesn't exist)
    if (ADJ[state.playerRoom] && ADJ[state.playerRoom].includes(clicked)) {
      mechanics.movePlayer(clicked);
      refreshUI();
    }
  } else if (state.phase === 2) {
    mechanics.addToRoute(clicked);
    refreshUI();
  }
});

mapCanvas.addEventListener('mousemove', (e) => {
  const rect = mapCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const W = mapCanvas.width;
  const H = mapCanvas.height;
  let hovered = null;
  for (const room of Object.values(ROOM)) {
    const r = roomRect(room, W, H);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      hovered = room.id;
      break;
    }
  }
  state.hoveredRoom = hovered;
});

mapCanvas.addEventListener('mouseleave', () => { state.hoveredRoom = null; });

// ── Button Wiring ────────────────────────────────────────────────────────────
function wire(id, fn) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => { fn(); refreshUI(); });
}

wire('observe-btn',         () => mechanics.observeRoom());
wire('advance-btn',         () => mechanics.advanceToPlanning());
wire('route-undo-btn',      () => mechanics.removeLastFromRoute());
wire('route-clear-btn',     () => mechanics.clearRoute());
wire('simulate-btn',        () => mechanics.runSimulation(1000));
wire('commit-btn',          () => mechanics.commitRoute());
wire('execute-btn',         () => mechanics.executeStep());
wire('pick-lock-btn',       () => mechanics.pickLock());
wire('disable-cameras-btn', () => mechanics.disableCameras());

// ── Initial State ────────────────────────────────────────────────────────────
// Use unshift so newest is first (matches how mechanics.js logs)
state.log.unshift({ msg: 'Move through rooms and observe to map guard probabilities.', type: '' });
state.log.unshift({ msg: '▶ Operation initiated. Begin reconnaissance.', type: 'info' });

refreshUI();
console.log('Museum Heist loaded ✓');
