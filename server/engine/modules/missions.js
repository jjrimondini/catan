// Modulo "Missioni di frontiera" (richiede Spazio profondo): basi pirata, relitti alieni, nettare stellare.
import { shuffle } from '../rng.js';

const CREW_TO_WIN = 3;

const shipOnHex = (state, hex, pid) => state.board.hexes[hex].edges.some(e => state.ships[e] === pid);

export default {
  id: 'missions',

  onStart(state) {
    const hidden = state.board.hexes.filter(h => h.hidden).length;
    const pool = [];
    for (let i = 0; i < hidden; i++) pool.push(i < 3 ? 'base' : i < 6 ? 'wreck' : null);
    state.missions = { pool: shuffle(state, pool), markers: {} };
    for (const p of state.players) { p.nectar = 0; p.artifacts = 0; p.missionVP = 0; }
  },

  onReveal(state, hex, p, ctx) {
    if (hex.terrain === 'nectar') {
      ctx.log(state, '🍯 È un campo di nettare stellare!');
      return;
    }
    const m = state.missions.pool.pop();
    if (m === 'base') {
      state.missions.markers[hex.id] = { type: 'base', crew: {} };
      ctx.log(state, '🏴 Scoperta una base pirata: il settore non produce finché non viene distrutta.');
    } else if (m === 'wreck') {
      state.missions.markers[hex.id] = { type: 'wreck' };
      ctx.log(state, '📦 Scoperto un relitto alieno!');
    }
  },

  hexBlocked(state, hex) {
    return state.missions?.markers[hex.id]?.type === 'base';
  },

  afterProduce(state, roll, _gains, ctx) {
    for (const h of state.board.hexes) {
      if (h.terrain !== 'nectar' || h.number !== roll || h.id === state.robberHex) continue;
      for (const v of h.vertices) {
        const b = state.buildings[v];
        if (!b) continue;
        const p = ctx.findPlayer(state, b.owner);
        p.nectar += b.type === 'city' ? 2 : 1;
        ctx.log(state, `🍯 ${p.name} raccoglie nettare stellare.`);
      }
    }
  },

  victoryPoints(state, pid) {
    return state.players.find(x => x.id === pid).missionVP || 0;
  },

  legal(state, pid) {
    const myTurnMain = state.phase === 'main' && state.players[state.current].id === pid;
    const out = { crewHexes: [], salvageHexes: [] };
    if (!myTurnMain) return out;
    for (const [h, m] of Object.entries(state.missions.markers)) {
      if (!shipOnHex(state, Number(h), pid)) continue;
      if (m.type === 'base') out.crewHexes.push(Number(h));
      if (m.type === 'wreck') out.salvageHexes.push(Number(h));
    }
    return out;
  },

  privateExtra(state, pid) {
    const p = state.players.find(x => x.id === pid);
    return { nectar: p.nectar, artifacts: p.artifacts };
  },

  publicExtra(state) {
    return {
      missions: {
        markers: state.missions.markers,
        players: Object.fromEntries(state.players.map(p => [p.id, { nectar: p.nectar, artifacts: p.artifacts, missionVP: p.missionVP }])),
      },
    };
  },

  handlers: {
    sendCrew(state, p, { hex }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const m = state.missions.markers[hex];
      if (m?.type !== 'base') ctx.fail('Lì non c\'è una base pirata.');
      if (!shipOnHex(state, hex, p.id)) ctx.fail('Ti serve un\'astronave accanto alla base.');
      ctx.payOrFail(state, p, 'crew');
      m.crew[p.id] = (m.crew[p.id] || 0) + 1;
      ctx.log(state, `${p.name} invia un equipaggio contro la base pirata (${m.crew[p.id]}/${CREW_TO_WIN}).`);
      if (m.crew[p.id] >= CREW_TO_WIN) {
        delete state.missions.markers[hex];
        p.missionVP += 2;
        p.freePicks += 2;
        ctx.log(state, `💥 ${p.name} distrugge la base pirata: +2 PV e 2 risorse a scelta!`);
      }
    },

    salvage(state, p, { hex }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const m = state.missions.markers[hex];
      if (m?.type !== 'wreck') ctx.fail('Lì non c\'è un relitto.');
      if (!shipOnHex(state, hex, p.id)) ctx.fail('Ti serve un\'astronave accanto al relitto.');
      delete state.missions.markers[hex];
      p.artifacts++;
      ctx.log(state, `${p.name} recupera un artefatto alieno.`);
    },

    deliverArtifact(state, p, _a, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      if (!(p.artifacts > 0)) ctx.fail('Non hai artefatti da consegnare.');
      ctx.payOrFail(state, p, 'artifact');
      p.artifacts--;
      p.missionVP++;
      ctx.log(state, `${p.name} consegna un artefatto al Consiglio: +1 PV.`);
    },

    deliverNectar(state, p, _a, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      if ((p.nectar || 0) < 3) ctx.fail('Servono 3 nettari.');
      p.nectar -= 3;
      p.missionVP++;
      ctx.log(state, `${p.name} consegna 3 nettari al Consiglio: +1 PV.`);
    },
  },
};
