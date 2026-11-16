// Modulo "Convogli mercantili": stazioni industriali, convogli che si muovono sulle iperlinee,
// pedaggi in Fondi, contratti di consegna e punti commercio.
import { STATIONS, CONVOY_BASE_MOVES, RESOURCES, RESOURCE_INFO } from '../../../public/shared/constants.js';
import { randInt } from '../rng.js';
import { gain } from '../rules.js';

function pickStations(state) {
  const { hexes, vertices } = state.board;
  const main = hexes.filter(h => h.kind === 'land' && h.system === 0);
  const cx = main.reduce((s, h) => s + h.x, 0) / main.length;
  const cy = main.reduce((s, h) => s + h.y, 0) / main.length;
  const interior = vertices.filter(v => v.hexes.length === 3 && v.hexes.every(h => hexes[h].kind === 'land' && hexes[h].system === 0));
  const out = [];
  STATIONS.forEach((s, i) => {
    const target = (-Math.PI / 2) + i * (2 * Math.PI / 3);
    let best = null, bestScore = -Infinity;
    for (const v of interior) {
      const d = Math.hypot(v.x - cx, v.y - cy);
      if (d < 1.4 || d > 3.2) continue;
      if (out.some(o => o.vertex === v.id || vertices[o.vertex].neighbors.includes(v.id))) continue;
      const score = Math.cos(Math.atan2(v.y - cy, v.x - cx) - target) * 3 - Math.abs(d - 2);
      if (score > bestScore) { bestScore = score; best = v.id; }
    }
    out.push({ ...s, vertex: best });
  });
  return out;
}

function newContract(state, unit) {
  const ids = STATIONS.map(s => s.id);
  const from = ids[randInt(state, ids.length)];
  const rest = ids.filter(x => x !== from);
  const to = rest[randInt(state, rest.length)];
  unit.contract = { from, to, loaded: false };
}

const stationAt = (state, v) => state.convoys.stations.find(s => s.vertex === v);
const stationById = (state, id) => state.convoys.stations.find(s => s.id === id);

export function convoySteps(state, pid) {
  const unit = state.convoys?.units[pid];
  if (!unit || unit.vertex == null || unit.moves <= 0) return [];
  const p = state.players.find(x => x.id === pid);
  const out = [];
  for (const e of state.board.vertices[unit.vertex].edges) {
    const owner = state.roads[e];
    if (owner === undefined) continue;
    if (owner !== pid && (p.credits || 0) < 1) continue;
    const ed = state.board.edges[e];
    out.push(ed.a === unit.vertex ? ed.b : ed.a);
  }
  return out;
}

export default {
  id: 'convoys',

  onStart(state) {
    state.convoys = { stations: pickStations(state), units: {} };
    for (const p of state.players) {
      p.credits = 2;
      state.convoys.units[p.id] = { vertex: null, moves: 0, engines: 0, points: 0, contract: null };
    }
  },

  onSetupDone(state) {
    for (const p of state.players) {
      const unit = state.convoys.units[p.id];
      const home = Object.entries(state.buildings).find(([, b]) => b.owner === p.id);
      unit.vertex = home ? Number(home[0]) : null;
      newContract(state, unit);
    }
  },

  onNewTurn(state) {
    const p = state.players[state.current];
    const unit = state.convoys.units[p.id];
    unit.moves = CONVOY_BASE_MOVES + 2 * unit.engines;
  },

  victoryPoints(state, pid) {
    return Math.floor((state.convoys?.units[pid]?.points || 0) / 2);
  },

  legal(state, pid) {
    const myTurnMain = state.phase === 'main' && state.players[state.current].id === pid;
    return { convoySteps: myTurnMain ? convoySteps(state, pid) : [] };
  },

  privateExtra(state, pid) {
    return { credits: state.players.find(x => x.id === pid).credits, creditTradeUsed: !!state.turnFlags.creditTrade };
  },

  publicExtra(state) {
    return {
      convoys: {
        stations: state.convoys.stations,
        units: state.convoys.units,
        credits: Object.fromEntries(state.players.map(p => [p.id, p.credits])),
      },
    };
  },

  handlers: {
    moveConvoy(state, p, { to }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const unit = state.convoys.units[p.id];
      if (unit.moves <= 0) ctx.fail('Il convoglio ha finito i movimenti per questo turno.');
      const e = state.board.vertices[unit.vertex]?.edges.find(x => {
        const ed = state.board.edges[x];
        return (ed.a === to || ed.b === to) && state.roads[x] !== undefined;
      });
      if (e === undefined) ctx.fail('Il convoglio si muove solo lungo le iperlinee.');
      const owner = state.roads[e];
      if (owner !== p.id) {
        if ((p.credits || 0) < 1) ctx.fail('Ti serve 1 Fondo per il pedaggio.');
        p.credits--;
        ctx.findPlayer(state, owner).credits++;
      }
      unit.vertex = to;
      unit.moves--;
      const st = stationAt(state, to);
      const c = unit.contract;
      if (st && c) {
        if (!c.loaded && st.id === c.from) {
          c.loaded = true;
          ctx.log(state, `🚚 ${p.name} carica il contratto alla ${st.name}.`);
        } else if (c.loaded && st.id === c.to) {
          p.credits += 2;
          unit.points++;
          ctx.log(state, `🚚 ${p.name} consegna alla ${st.name}: +2 💰${unit.points % 2 === 0 ? ' e +1 PV' : ''}.`);
          newContract(state, unit);
          const nst = stationById(state, unit.contract.from);
          if (nst.vertex === to) unit.contract.loaded = true;
        }
      }
    },

    buildEngine(state, p, _a, ctx) {
      ctx.requireBuildTurn(state, p);
      const unit = state.convoys.units[p.id];
      if (unit.engines >= 2) ctx.fail('Motori già al massimo.');
      ctx.payOrFail(state, p, 'engine');
      unit.engines++;
      if (state.phase === 'main' && state.players[state.current].id === p.id) unit.moves += 2;
      ctx.log(state, `${p.name} potenzia i motori del convoglio.`);
    },

    creditTrade(state, p, { resource }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      if (state.turnFlags.creditTrade) ctx.fail('Puoi convertire i Fondi una volta per turno.');
      if (!RESOURCES.includes(resource)) ctx.fail('Risorsa non valida.');
      if ((p.credits || 0) < 2) ctx.fail('Servono 2 Fondi.');
      if (!gain(state, p, resource)) ctx.fail('La banca ha finito quella risorsa.');
      p.credits -= 2;
      state.turnFlags.creditTrade = true;
      ctx.log(state, `${p.name} converte 2 💰 in 1 ${RESOURCE_INFO[resource].icon}.`);
    },
  },
};
