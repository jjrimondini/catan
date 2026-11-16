// Generazione della mappa esagonale e del grafo vertici/lati.
// Esagoni "pointy-top" in coordinate assiali (q, r). Supporta layout diversi:
//  - base: esagono di raggio 2 (19 settori)
//  - galaxy: righe 3-4-5-6-5-4-3 (30 settori)
//  - deepspace: sistema principale + anello di vuoto + sistemi esterni inesplorati

import { TERRAIN_COUNTS, NUMBER_TOKENS, RESOURCES } from '../../public/shared/constants.js';
import { shuffle } from './rng.js';

const SQRT3 = Math.sqrt(3);
const AXIAL_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const ck = (q, r) => `${q},${r}`;
const axialDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

export function hexCoords(radius) {
  const out = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(-q - r) <= radius) out.push({ q, r });
    }
  }
  return out;
}

function galaxyCoords() {
  const out = [];
  for (let r = -3; r <= 3; r++) {
    const len = 6 - Math.abs(r);
    const start = Math.round(-(len - 1) / 2 - r / 2 - 0.0001);
    for (let i = 0; i < len; i++) out.push({ q: start + i, r });
  }
  return out;
}

const keyOf = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

/** Geometria: esagoni, vertici, lati, adiacenze. `layout` = raggio oppure lista di { q, r, kind?, system?, hidden? }. */
export function buildGeometry(layout = 2) {
  const cells = typeof layout === 'number' ? hexCoords(layout) : layout;
  const hexes = cells.map((c, id) => ({
    id, q: c.q, r: c.r,
    kind: c.kind || 'land',
    system: c.system ?? 0,
    hidden: !!c.hidden,
    x: SQRT3 * (c.q + c.r / 2),
    y: 1.5 * c.r,
    vertices: [], edges: [],
  }));

  const vertexMap = new Map();
  const vertices = [];
  const edgeMap = new Map();
  const edges = [];

  for (const h of hexes) {
    const corner = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i - 30);
      const x = h.x + Math.cos(ang);
      const y = h.y + Math.sin(ang);
      const k = keyOf(x, y);
      let v = vertexMap.get(k);
      if (v === undefined) {
        v = vertices.length;
        vertexMap.set(k, v);
        vertices.push({ id: v, x, y, hexes: [], edges: [], neighbors: [] });
      }
      vertices[v].hexes.push(h.id);
      corner.push(v);
    }
    h.vertices = corner;
    for (let i = 0; i < 6; i++) {
      const a = corner[i], b = corner[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = edgeMap.get(k);
      if (e === undefined) {
        e = edges.length;
        edgeMap.set(k, e);
        edges.push({ id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        vertices[a].edges.push(e);
        vertices[b].edges.push(e);
        vertices[a].neighbors.push(b);
        vertices[b].neighbors.push(a);
      }
      edges[e].hexes.push(h.id);
      h.edges.push(e);
    }
  }

  const byCoord = new Map(hexes.map(h => [ck(h.q, h.r), h.id]));
  for (const h of hexes) {
    h.neighbors = AXIAL_DIRS.map(([dq, dr]) => byCoord.get(ck(h.q + dq, h.r + dr))).filter(n => n !== undefined);
  }
  refreshFlags({ hexes, vertices, edges });
  return { hexes, vertices, edges };
}

/** Ricalcola i flag terra/spazio di vertici e lati (dopo aver cambiato kind degli esagoni). */
export function refreshFlags(board) {
  const { hexes, vertices, edges } = board;
  for (const v of vertices) {
    v.land = v.hexes.some(h => hexes[h].kind === 'land');
    v.system = Math.min(...v.hexes.filter(h => hexes[h].kind === 'land').map(h => hexes[h].system), 99);
  }
  for (const e of edges) {
    e.land = e.hexes.some(h => hexes[h].kind === 'land');
    e.space = e.hexes.some(h => hexes[h].kind === 'void');
  }
}

// ---------- Specifiche delle mappe ----------

function deepspaceCells(main) {
  const mainSet = new Set(main.map(c => ck(c.q, c.r)));
  const near = d => {
    const out = new Map();
    for (const m of main) {
      for (const c of hexCoords(d)) {
        const q = m.q + c.q, r = m.r + c.r;
        const k = ck(q, r);
        if (mainSet.has(k) || out.has(k)) continue;
        const dist = Math.min(...main.map(mm => axialDist(mm, { q, r })));
        if (dist === d) out.set(k, { q, r });
      }
    }
    return [...out.values()];
  };
  const cx = main.reduce((s, c) => s + SQRT3 * (c.q + c.r / 2), 0) / main.length;
  const cy = main.reduce((s, c) => s + 1.5 * c.r, 0) / main.length;
  const angle = c => Math.atan2(1.5 * c.r - cy, SQRT3 * (c.q + c.r / 2) - cx);
  const ring1 = near(1).map(c => ({ ...c, kind: 'void', system: -1 }));
  const ring2 = near(2).sort((a, b) => angle(a) - angle(b));
  // Sistemi esterni: gruppi di 4 settori consecutivi, separati da 4 settori di vuoto
  const cells = [...main.map(c => ({ ...c, kind: 'land', system: 0 })), ...ring1];
  const groupSize = 4, gap = 4;
  const period = groupSize + gap;
  const groups = Math.floor(ring2.length / period);
  ring2.forEach((c, i) => {
    const pos = i % period;
    const g = Math.floor(i / period);
    if (g < groups && pos >= 1 && pos <= groupSize) cells.push({ ...c, kind: 'land', system: g + 1, hidden: true });
    else cells.push({ ...c, kind: 'void', system: -1 });
  });
  return cells;
}

export function boardSpec(settings = {}) {
  const modules = settings.modules || [];
  const galaxy = modules.includes('galaxy');
  const deepspace = modules.includes('deepspace');
  const main = galaxy ? galaxyCoords() : hexCoords(2);
  const spec = {
    cells: deepspace ? deepspaceCells(main) : main.map(c => ({ ...c, kind: 'land', system: 0 })),
    terrainCounts: galaxy ? { asteroids: 6, solar: 5, crystal: 5, ice: 6, jungle: 6, nebula: 2 } : { ...TERRAIN_COUNTS },
    numbers: galaxy
      ? [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]
      : NUMBER_TOKENS.slice(),
    portTypes: galaxy ? ['any', 'any', 'any', 'any', 'any', 'any', ...RESOURCES] : ['any', 'any', 'any', 'any', ...RESOURCES],
    mapMode: settings.mapMode || 'random',
    nectar: modules.includes('missions') ? 2 : 0,
  };
  return spec;
}

function numbersOk(hexes) {
  for (const h of hexes) {
    if (h.number !== 6 && h.number !== 8) continue;
    for (const n of h.neighbors) {
      const nn = hexes[n].number;
      if (nn === 6 || nn === 8) return false;
    }
  }
  return true;
}

/** Genera una mappa completa. `rngHolder` è un oggetto { rng }; `spec` da boardSpec(). */
export function generateBoard(rngHolder, spec = boardSpec()) {
  const board = buildGeometry(spec.cells);
  const { hexes, vertices, edges } = board;
  const mainLand = hexes.filter(h => h.kind === 'land' && h.system === 0);

  // Terreni del sistema principale
  const terrains = [];
  for (const [t, n] of Object.entries(spec.terrainCounts)) for (let i = 0; i < n; i++) terrains.push(t);
  shuffle(rngHolder, terrains);
  for (const h of hexes) { h.terrain = null; h.number = null; }

  if (spec.mapMode === 'center') {
    const nebulas = terrains.filter(t => t === 'nebula').length;
    const rest = terrains.filter(t => t !== 'nebula');
    const cx = mainLand.reduce((s, h) => s + h.x, 0) / mainLand.length;
    const cy = mainLand.reduce((s, h) => s + h.y, 0) / mainLand.length;
    const byCenter = mainLand.slice().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    byCenter.forEach((h, i) => { h.terrain = i < nebulas ? 'nebula' : rest[i - nebulas]; });
  } else {
    mainLand.forEach((h, i) => { h.terrain = terrains[i]; });
  }

  // Numeri: rimescola finché 6 e 8 non sono adiacenti
  const producing = mainLand.filter(h => h.terrain !== 'nebula');
  for (let attempt = 0; attempt < 5000; attempt++) {
    const nums = shuffle(rngHolder, spec.numbers.slice());
    producing.forEach((h, i) => { h.number = nums[i]; });
    if (numbersOk(hexes)) break;
  }

  // Riserva per i settori inesplorati (Spazio profondo)
  const hidden = hexes.filter(h => h.hidden);
  const hiddenPool = [];
  if (hidden.length) {
    const ts = ['asteroids', 'solar', 'crystal', 'ice', 'jungle'];
    const ns = [3, 4, 5, 6, 8, 9, 10, 11, 4, 10, 5, 9];
    for (let i = 0; i < hidden.length; i++) hiddenPool.push({ terrain: ts[i % ts.length], number: ns[i % ns.length] });
    for (let i = 0; i < Math.min(spec.nectar || 0, hiddenPool.length); i++) hiddenPool[i].terrain = 'nectar';
    shuffle(rngHolder, hiddenPool);
  }

  // Stazioni commerciali sulla costa del sistema principale
  const coast = edges.filter(e => {
    const land = e.hexes.filter(h => hexes[h].kind === 'land' && hexes[h].system === 0);
    const others = e.hexes.filter(h => !(hexes[h].kind === 'land' && hexes[h].system === 0));
    return land.length === 1 && (e.hexes.length === 1 || others.every(h => hexes[h].kind === 'void'));
  });
  const cx = mainLand.reduce((s, h) => s + h.x, 0) / mainLand.length;
  const cy = mainLand.reduce((s, h) => s + h.y, 0) / mainLand.length;
  const outer = coast.map(e => {
    const va = vertices[e.a], vb = vertices[e.b];
    const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
    const land = hexes[e.hexes.find(h => hexes[h].kind === 'land')];
    return { e, mx, my, ang: Math.atan2(my - cy, mx - cx), ox: mx - land.x, oy: my - land.y };
  }).sort((p, q) => p.ang - q.ang);

  const portTypes = shuffle(rngHolder, spec.portTypes.slice());
  const ports = [];
  const used = new Set();
  for (let i = 0; i < portTypes.length; i++) {
    let idx = Math.round((i * outer.length) / portTypes.length) % outer.length;
    for (let k = 0; k < outer.length; k++) {
      const o = outer[(idx + k) % outer.length];
      if (used.has(o.e.a) || used.has(o.e.b)) continue;
      idx = (idx + k) % outer.length;
      break;
    }
    const o = outer[idx];
    used.add(o.e.a); used.add(o.e.b);
    // il segnalino sta fuori dalla costa, nella direzione opposta al settore di terra
    const len = Math.hypot(o.ox, o.oy) || 1;
    ports.push({
      edge: o.e.id, vertices: [o.e.a, o.e.b], type: portTypes[i],
      x: o.mx + (o.ox / len) * 0.55, y: o.my + (o.oy / len) * 0.55,
    });
  }

  const robberHex = hexes.find(h => h.terrain === 'nebula')?.id ?? mainLand[0].id;
  const raidersHex = hexes.find(h => h.kind === 'void')?.id ?? null;
  return { hexes, vertices, edges, ports, robberHex, raidersHex, hiddenPool };
}
