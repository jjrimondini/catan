// Modulo "Spazio profondo": vuoto, astronavi, settori inesplorati, predoni del vuoto,
// bonus per il primo avamposto in ogni sistema esterno.
import { RESOURCE_INFO, TERRAIN, TERRAIN_RES } from '../../../public/shared/constants.js';
import { canAfford, piecesLeft, canPlaceShip, validShipSpots, gain, costOf } from '../rules.js';

/** Un'astronave è "in fondo a una rotta aperta" se un suo estremo non tocca propri edifici né altre proprie astronavi. */
function isOpenEnd(state, e, owner) {
  const edge = state.board.edges[e];
  return [edge.a, edge.b].some(v => {
    if (state.buildings[v]?.owner === owner) return false;
    return !state.board.vertices[v].edges.some(o => o !== e && state.ships[o] === owner);
  });
}

export function shipMoves(state, playerId) {
  if (state.turnFlags.shipMoved) return [];
  const built = state.turnFlags.shipsBuilt || [];
  const out = [];
  for (const [k, owner] of Object.entries(state.ships)) {
    const e = Number(k);
    if (owner !== playerId || built.includes(e)) continue;
    if (state.raidersHex != null && state.board.edges[e].hexes.includes(state.raidersHex)) continue;
    if (!isOpenEnd(state, e, playerId)) continue;
    // simula la rimozione
    delete state.ships[e];
    const to = validShipSpots(state, playerId).filter(t => t !== e);
    state.ships[e] = playerId;
    if (to.length) out.push({ from: e, to });
  }
  return out;
}

/** Rivela i settori inesplorati toccati da un lato. */
function revealAround(state, p, edgeId, ctx) {
  for (const h of state.board.edges[edgeId].hexes) {
    const hex = state.board.hexes[h];
    if (!hex.hidden) continue;
    const tile = state.board.hiddenPool.pop() || { terrain: 'asteroids', number: 6 };
    hex.hidden = false;
    hex.terrain = tile.terrain;
    hex.number = tile.number;
    const res = TERRAIN_RES[tile.terrain];
    let bonus = '';
    if (res && gain(state, p, res)) bonus = ` e riceve 1 ${RESOURCE_INFO[res].icon}`;
    ctx.log(state, `🔭 ${p.name} esplora un settore: ${TERRAIN[tile.terrain].name} (${tile.number})${bonus}.`);
    ctx.runHook(state, 'onReveal', hex, p);
  }
}

export default {
  id: 'deepspace',

  onStart(state) {
    state.deepspace = { claimed: {} }; // system -> playerId
  },

  onPiecePlaced(state, p, { kind, id }, ctx) {
    if (kind === 'road' || kind === 'ship') revealAround(state, p, id, ctx);
    if (kind === 'settlement') {
      const sys = state.board.vertices[id].system;
      if (sys > 0 && sys < 99 && !state.deepspace.claimed[sys]) {
        state.deepspace.claimed[sys] = p.id;
        ctx.log(state, `🌟 ${p.name} colonizza per primo il sistema esterno ${sys}: +2 PV!`);
      }
    }
  },

  victoryPoints(state, playerId) {
    return 2 * Object.values(state.deepspace?.claimed || {}).filter(id => id === playerId).length;
  },

  legal(state, playerId, { building }) {
    const out = { ships: [], shipMoves: [] };
    if (building && piecesLeft(state, playerId).ship > 0 && canAfford(state.players.find(x => x.id === playerId).hand, costOf(state, playerId, 'ship'))) {
      out.ships = validShipSpots(state, playerId);
    }
    if (state.phase === 'main' && state.players[state.current].id === playerId) out.shipMoves = shipMoves(state, playerId);
    return out;
  },

  publicExtra(state) {
    return { ships: state.ships, raidersHex: state.raidersHex, claimedSystems: state.deepspace?.claimed || {} };
  },

  handlers: {
    buildShip(state, p, { edge }, ctx) {
      ctx.requireBuildTurn(state, p);
      if (piecesLeft(state, p.id).ship <= 0) ctx.fail('Hai finito le astronavi.');
      if (!canPlaceShip(state, p.id, edge)) ctx.fail('Posizione non valida per un\'astronave.');
      ctx.payOrFail(state, p, 'ship');
      state.ships[edge] = p.id;
      (state.turnFlags.shipsBuilt ||= []).push(edge);
      ctx.log(state, `${p.name} lancia un'astronave.`);
      ctx.runHook(state, 'onPiecePlaced', p, { kind: 'ship', id: edge });
      ctx.updateLongestRoad(state);
    },

    moveShip(state, p, { from, to }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const opt = shipMoves(state, p.id).find(m => m.from === from);
      if (!opt) ctx.fail('Questa astronave non può essere spostata.');
      if (!opt.to.includes(to)) ctx.fail('Destinazione non valida.');
      delete state.ships[from];
      state.ships[to] = p.id;
      state.turnFlags.shipMoved = true;
      ctx.log(state, `${p.name} sposta un'astronave.`);
      ctx.runHook(state, 'onPiecePlaced', p, { kind: 'ship', id: to });
      ctx.updateLongestRoad(state);
    },
  },
};
