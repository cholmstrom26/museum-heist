// ============================================================
//  museum.js  —  Room layout, connections, adjacency map
//  All game world data lives here.
// ============================================================

export const ROOM_W  = 136;
export const ROOM_H  = 120;
export const GAP_X   = 22;
export const GAP_Y   = 22;
export const COLS    = 5;
export const ROWS    = 3;

export const ROOMS = [
  // ── Row 0 ──────────────────────────────────────────────────
  { id: 'entrance',     name: 'Main Entrance',   col: 0, row: 0,
    cam: false, guard: false, isStart: true,
    desc: 'The public entrance. Lightly monitored at night — ideal starting point.' },
  { id: 'west_gallery', name: 'West Gallery',    col: 1, row: 0,
    cam: false, guard: false,
    desc: 'Ancient artifact exhibits. Dark and quiet after closing.' },
  { id: 'rotunda',      name: 'Rotunda',         col: 2, row: 0,
    cam: true,  guard: false,
    desc: 'The grand rotunda. A sweeping camera covers 180°. Time your crossing.' },
  { id: 'east_gallery', name: 'East Gallery',    col: 3, row: 0,
    cam: true,  guard: false,
    desc: 'Contemporary art wing. Two ceiling cameras. High exposure risk.' },
  { id: 'fire_exit',    name: 'Fire Exit',        col: 4, row: 0,
    cam: false, guard: false,
    desc: 'Emergency exit. No camera, but door alarm triggers if opened from outside.' },

  // ── Row 1 ──────────────────────────────────────────────────
  { id: 'security',     name: 'Security Office', col: 0, row: 1,
    cam: false, guard: true,
    desc: 'Guard headquarters. Two guards stationed here at all times. Avoid.' },
  { id: 'archive',      name: 'Archive Room',    col: 1, row: 1,
    cam: false, guard: false,
    desc: 'Museum records. Dark, quiet, unlocked. Excellent transit corridor.' },
  { id: 'main_hall',    name: 'Main Hall',       col: 2, row: 1,
    cam: true,  guard: true,
    desc: 'Central corridor. Camera plus a roaming guard. Very high risk.' },
  { id: 'gift_shop',    name: 'Gift Shop',       col: 3, row: 1,
    cam: false, guard: false,
    desc: 'Closed at night. Unlocked — useful shortcut. No surveillance.' },
  { id: 'staff_area',   name: 'Staff Area',      col: 4, row: 1,
    cam: false, guard: false,
    desc: 'Staff-only zone. Restricted but unwatched after hours.' },

  // ── Row 2 ──────────────────────────────────────────────────
  { id: 'basement',     name: 'Basement',        col: 0, row: 2,
    cam: false, guard: false,
    desc: 'Sub-level storage. Completely dark — no cameras, no guards.' },
  { id: 'storage',      name: 'Storage Room',    col: 1, row: 2,
    cam: false, guard: false,
    desc: 'Equipment and crates. Easy to hide. No active surveillance.' },
  { id: 'server_room',  name: 'Server Room',     col: 2, row: 2,
    cam: true,  guard: false,
    desc: 'Central security servers. Disabling them cuts all cameras.' },
  { id: 'vault_lobby',  name: 'Vault Lobby',     col: 3, row: 2,
    cam: false, guard: true,
    desc: 'Antechamber to the vault. One guard patrols. Last checkpoint.' },
  { id: 'vault',        name: 'THE VAULT',       col: 4, row: 2,
    cam: true,  guard: false, isTarget: true,
    desc: '★ PRIMARY OBJECTIVE. The Monet is secured here. Heavy lock, one camera.' },
];

// Which rooms connect to which (undirected)
export const CONNECTIONS = [
  // Row 0 horizontal
  ['entrance', 'west_gallery'], ['west_gallery', 'rotunda'],
  ['rotunda', 'east_gallery'],  ['east_gallery', 'fire_exit'],
  // Row 1 horizontal
  ['security', 'archive'],      ['archive', 'main_hall'],
  ['main_hall', 'gift_shop'],   ['gift_shop', 'staff_area'],
  // Row 2 horizontal
  ['basement', 'storage'],      ['storage', 'server_room'],
  ['server_room', 'vault_lobby'], ['vault_lobby', 'vault'],
  // Verticals col 0
  ['entrance', 'security'],     ['security', 'basement'],
  // Verticals col 1
  ['west_gallery', 'archive'],  ['archive', 'storage'],
  // Verticals col 2
  ['rotunda', 'main_hall'],     ['main_hall', 'server_room'],
  // Verticals col 3
  ['east_gallery', 'gift_shop'], ['gift_shop', 'vault_lobby'],
  // Verticals col 4
  ['fire_exit', 'staff_area'],
];

// Build lookup and adjacency map from the arrays above
export const ROOM = {};
ROOMS.forEach(r => { ROOM[r.id] = r; });

export const ADJ = {};
ROOMS.forEach(r => { ADJ[r.id] = []; });
CONNECTIONS.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });

// Pixel position of a room's top-left corner on the canvas
export function roomRect(room, canvasW, canvasH) {
  const totalW = COLS * ROOM_W + (COLS - 1) * GAP_X;
  const totalH = ROWS * ROOM_H + (ROWS - 1) * GAP_Y;
  const offsetX = Math.round((canvasW - totalW) / 2);
  const offsetY = Math.round((canvasH - totalH) / 2);
  const x = offsetX + room.col * (ROOM_W + GAP_X);
  const y = offsetY + room.row * (ROOM_H + GAP_Y);
  return { x, y, w: ROOM_W, h: ROOM_H, cx: x + ROOM_W / 2, cy: y + ROOM_H / 2 };
}