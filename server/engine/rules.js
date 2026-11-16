// Regole di piazzamento, costi e rapporti di scambio. Funzioni pure sullo stato.

import { RESOURCES, COMMODITIES, COSTS, PIECE_LIMITS } from '../../public/shared/constants.js';

export const hasModule = (state, m) => !!state.settings?.modules?.includes(m);

/** Tipi di carta che compongono la mano (risorse + eventuali merci). */
export function cardTypes(state) {
  return hasModule(state, 'empires') ? [...RESOURCES, ...COMMODITIES] : RESOURCES;
}

export function emptyHand(types = RESOURCES) {
  return Object.fromEntries(types.map(r => [r, 0]));
}

export function handSize(hand) {
  return Object.values(hand).reduce((s, n) => s + (n || 0), 0);
}

export function canAfford(hand, cost) {
  return Object.entries(cost).every(([r, n]) => (hand[r] || 0) >= n);
}

export function isValidResourceBundle(bundle, types = RESOURCES) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false;
  return Object.entries(bundle).every(([r, n]) => types.includes(r) && Number.isInteger(n) && n >= 0);
}

export function piecesUsed(state, playerId) {
  let road = 0, settlement = 0, city = 0, ship = 0, shield = 0;
  for (const owner of Object.values(state.roads)) if (owner === playerId) road++;
  for (const owner of Object.values(state.ships || {})) if (owner === playerId) ship++;
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== playerId) continue;
    if (b.type === 'settlement') settlement++; else city++;
    if (b.shield) shield++;
  }
  return { road, settlement, city, ship, shield };
}

export function piecesLeft(state, playerId) {
  const u = piecesUsed(state, playerId);
  return Object.fromEntries(Object.entries(u).map(([k, n]) => [k, Math.max(0, PIECE_LIMITS[k] - n)]));
}

/** Costo effettivo di una costruzione, considerando eventi e carte attive. */
export function costOf(state, playerId, what) {
  if (what === 'road' && state.event?.type === 'gravity') return { energy: 1 };
  if (what === 'city' && state.turnFlags?.medicine === playerId) return { crystal: 2, bio: 1 };
  return COSTS[what];
}

// ---------- Vertici ----------

/** Un vertice è edificabile se tocca almeno un settore di terra già esplorato e non è una stazione. */
export function buildableVertex(state, v) {
  const vv = state.board.vertices[v];
  if (!vv || !vv.land) return false;
  if (!vv.hexes.some(h => state.board.hexes[h].kind === 'land' && !state.board.hexes[h].hidden)) return false;
  if (state.convoys?.stations?.some(s => s.vertex === v)) return false;
  return true;
}

/** Regola della distanza: vertice libero (niente edifici né guardiani) e nessun edificio adiacente. */
export function vertexFree(state, v) {
  if (state.buildings[v] || state.guardians?.[v]) return false;
  return state.board.vertices[v].neighbors.every(n => !state.buildings[n]);
}

/** Vertice occupato da un pezzo avversario che interrompe le reti. */
export function blockedFor(state, v, playerId) {
  const b = state.buildings[v];
  if (b && b.owner !== playerId) return true;
  const g = state.guardians?.[v];
  return !!(g && g.owner !== playerId);
}

const touchesOwn = (state, map, playerId, v, exceptEdge = null) =>
  state.board.vertices[v].edges.some(e => e !== exceptEdge && map?.[e] === playerId);

export function canPlaceSettlement(state, playerId, v, { setup = false } = {}) {
  if (!buildableVertex(state, v)) return false;
  if (!vertexFree(state, v)) return false;
  if (setup) return state.board.vertices[v].system === 0;
  return touchesOwn(state, state.roads, playerId, v) || touchesOwn(state, state.ships, playerId, v);
}

export function canPlaceCity(state, playerId, v) {
  const b = state.buildings[v];
  return !!b && b.owner === playerId && b.type === 'settlement';
}

// ---------- Lati ----------

function edgeTaken(state, e) {
  return state.roads[e] !== undefined || state.ships?.[e] !== undefined;
}

/** Iperlinea: lato di terra libero, collegato a un proprio edificio o a una propria iperlinea
 *  (attraverso un vertice non occupato da avversari). */
export function canPlaceRoad(state, playerId, e, { mustTouchVertex = null } = {}) {
  const edge = state.board.edges[e];
  if (!edge || !edge.land || edgeTaken(state, e)) return false;
  if (mustTouchVertex !== null) return edge.a === mustTouchVertex || edge.b === mustTouchVertex;
  for (const v of [edge.a, edge.b]) {
    const b = state.buildings[v];
    if (b && b.owner === playerId) return true;
    if (blockedFor(state, v, playerId)) continue;
    if (touchesOwn(state, state.roads, playerId, v, e)) return true;
  }
  return false;
}

/** Astronave: lato che tocca il vuoto, libero, non adiacente ai predoni, collegato a un proprio
 *  edificio o a una propria astronave. */
export function canPlaceShip(state, playerId, e, { ignoreEdge = null, mustTouchVertex = null } = {}) {
  const edge = state.board.edges[e];
  if (!edge || !edge.space || edgeTaken(state, e)) return false;
  if (state.raidersHex != null && edge.hexes.includes(state.raidersHex)) return false;
  if (mustTouchVertex !== null) return edge.a === mustTouchVertex || edge.b === mustTouchVertex;
  for (const v of [edge.a, edge.b]) {
    const b = state.buildings[v];
    if (b && b.owner === playerId) return true;
    if (blockedFor(state, v, playerId)) continue;
    if (state.board.vertices[v].edges.some(o => o !== e && o !== ignoreEdge && state.ships?.[o] === playerId)) return true;
  }
  return false;
}

export function validSettlementSpots(state, playerId, opts) {
  return state.board.vertices.map(v => v.id).filter(v => canPlaceSettlement(state, playerId, v, opts));
}

export function validCitySpots(state, playerId) {
  return Object.keys(state.buildings).map(Number).filter(v => canPlaceCity(state, playerId, v));
}

export function validRoadSpots(state, playerId, opts) {
  return state.board.edges.map(e => e.id).filter(e => canPlaceRoad(state, playerId, e, opts));
}

export function validShipSpots(state, playerId, opts) {
  return state.board.edges.map(e => e.id).filter(e => canPlaceShip(state, playerId, e, opts));
}

/** Vertici raggiungibili dalla rete di un giocatore (edifici + estremi di iperlinee non bloccati). */
export function networkVertices(state, playerId) {
  const out = new Set();
  for (const [v, b] of Object.entries(state.buildings)) if (b.owner === playerId) out.add(Number(v));
  for (const [e, owner] of Object.entries(state.roads)) {
    if (owner !== playerId) continue;
    const ed = state.board.edges[e];
    for (const v of [ed.a, ed.b]) if (!blockedFor(state, v, playerId)) out.add(v);
  }
  return out;
}

// ---------- Scambi ----------

/** Rapporti di scambio con la banca per ogni tipo di carta. */
export function tradeRatios(state, playerId) {
  const types = cardTypes(state);
  const ratios = Object.fromEntries(types.map(r => [r, 4]));
  for (const port of state.board?.ports || []) {
    const owns = port.vertices.some(v => state.buildings[v]?.owner === playerId);
    if (!owns) continue;
    if (port.type === 'any') {
      for (const r of RESOURCES) ratios[r] = Math.min(ratios[r], 3);
    } else {
      ratios[port.type] = 2;
    }
  }
  if (state.event?.type === 'boom') for (const r of types) ratios[r] = Math.min(ratios[r], 3);
  const p = state.players.find(pl => pl.id === playerId);
  if (p?.tracks?.trade >= 3) for (const c of COMMODITIES) ratios[c] = 2;
  if (state.turnFlags?.tradefleet?.player === playerId) {
    const r = state.turnFlags.tradefleet.res;
    ratios[r] = Math.min(ratios[r], 2);
  }
  return ratios;
}

export function payCost(state, player, cost) {
  for (const [r, n] of Object.entries(cost)) {
    player.hand[r] -= n;
    state.bank[r] += n;
  }
}

export function gain(state, player, res, n = 1) {
  const k = Math.min(n, state.bank[res] ?? 0);
  player.hand[res] += k;
  state.bank[res] -= k;
  return k;
}

export { COSTS };
