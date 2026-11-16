// Modulo "Imperi e Invasione": merci, tracciati di progresso, metropoli, guardiani,
// scudi planetari, dado evento, invasione aliena e carte progresso.
import {
  RESOURCES, COMMODITIES, RESOURCE_INFO, TERRAIN_COMMODITY, TERRAIN_RES, TRACKS, PROGRESS_CARDS,
  PROGRESS_HAND_LIMIT, INVASION_LENGTH,
} from '../../../public/shared/constants.js';
import { shuffle, rollDie, randInt } from '../rng.js';
import { canAfford, costOf, piecesLeft, networkVertices, buildableVertex, gain, handSize } from '../rules.js';

const TRACK_OF_COMMODITY = { credits: 'trade', data: 'science', plasma: 'defense' };
const EVENT_FACES = { 1: 'ship', 2: 'ship', 3: 'ship', 4: 'trade', 5: 'science', 6: 'defense' };
const GUARDIANS_PER_LEVEL = 2;

function newDecks(state) {
  const decks = { science: [], trade: [], defense: [] };
  for (const [type, c] of Object.entries(PROGRESS_CARDS)) for (let i = 0; i < c.count; i++) decks[c.deck].push(type);
  for (const k of Object.keys(decks)) shuffle(state, decks[k]);
  return decks;
}

const cities = (state, pid) => Object.entries(state.buildings).filter(([, b]) => b.owner === pid && b.type === 'city').map(([v]) => Number(v));
const guardiansOf = (state, pid) => Object.entries(state.guardians).filter(([, g]) => g.owner === pid).map(([v, g]) => ({ v: Number(v), ...g }));
const countLevel = (state, pid, level) => guardiansOf(state, pid).filter(g => g.level === level).length;

function drawProgress(state, p, deck, ctx) {
  const decks = state.empires.decks;
  if (!decks[deck].length) return null;
  const card = PROGRESS_CARDS[decks[deck][decks[deck].length - 1]];
  if (card.vp) {
    decks[deck].pop();
    p.progressVP++;
    ctx.log(state, `${p.name} pesca ${card.name}: +1 PV!`);
    return card;
  }
  if (p.progress.length >= PROGRESS_HAND_LIMIT) {
    ctx.log(state, `${p.name} ha già ${PROGRESS_HAND_LIMIT} carte progresso e non pesca.`);
    return null;
  }
  const type = decks[deck].pop();
  p.progress.push(type);
  ctx.log(state, `${p.name} pesca una carta progresso (${TRACKS[deck].name}).`);
  return card;
}

/** Difesa attiva di un giocatore: somma dei livelli dei suoi guardiani attivi. */
const defenseOf = (state, pid) => guardiansOf(state, pid).filter(g => g.active).reduce((s, g) => s + g.level, 0);
const invasionStrength = state => Object.values(state.buildings).filter(b => b.type === 'city').length;

function resolveInvasion(state, ctx) {
  const strength = invasionStrength(state);
  const contrib = Object.fromEntries(state.players.map(p => [p.id, defenseOf(state, p.id)]));
  const defense = Object.values(contrib).reduce((a, b) => a + b, 0);
  ctx.log(state, `👾 INVASIONE ALIENA! Forza ${strength} contro difesa ${defense}.`);
  if (strength === 0) {
    // nessuna colonia in gioco: gli invasori passano oltre e non c'è nulla da difendere (nessun PV)
    ctx.log(state, 'Non ci sono colonie da attaccare: gli invasori passano oltre.');
  } else if (defense >= strength) {
    const max = Math.max(...Object.values(contrib));
    const top = Object.keys(contrib).filter(id => contrib[id] === max && max > 0);
    if (top.length === 1) {
      const p = ctx.findPlayer(state, top[0]);
      p.defenderVP++;
      ctx.log(state, `L'invasione è respinta! ${p.name} è Difensore della galassia: +1 PV.`);
    } else if (top.length > 1) {
      ctx.log(state, `L'invasione è respinta! I migliori difensori ricevono una carta progresso.`);
      for (const id of top) drawProgress(state, ctx.findPlayer(state, id), 'defense', ctx);
    } else {
      ctx.log(state, 'L\'invasione è respinta.');
    }
  } else {
    const exposed = state.players.filter(p => cities(state, p.id).some(v => !state.buildings[v].metro));
    if (exposed.length) {
      const min = Math.min(...exposed.map(p => contrib[p.id]));
      for (const p of exposed.filter(x => contrib[x.id] === min)) {
        const shielded = cities(state, p.id).find(v => !state.buildings[v].metro && state.buildings[v].shield);
        if (shielded !== undefined) {
          delete state.buildings[shielded].shield;
          ctx.log(state, `Lo scudo planetario di ${p.name} assorbe l'attacco e va distrutto.`);
        } else {
          const v = cities(state, p.id).find(x => !state.buildings[x].metro);
          state.buildings[v] = { owner: p.id, type: 'settlement' }; // anche se la riserva di avamposti è vuota
          ctx.log(state, `${p.name} perde una colonia, che torna avamposto.`);
        }
      }
    } else {
      ctx.log(state, 'Gli invasori non trovano colonie da saccheggiare.');
    }
  }
  for (const g of Object.values(state.guardians)) g.active = false;
  state.empires.invasion = 0;
  if (!state.empires.firstInvasion) {
    state.empires.firstInvasion = true;
    ctx.log(state, 'Da ora la flotta pirata può muoversi.');
  }
}

function placeMetro(state, p, track, ctx) {
  const holder = state.empires.metros[track];
  if (holder !== null && holder !== undefined) {
    const b = state.buildings[holder];
    if (b?.owner === p.id) return;
    if (b) delete b.metro;
  }
  const v = cities(state, p.id).find(x => !state.buildings[x].metro);
  state.buildings[v].metro = track;
  state.empires.metros[track] = v;
  ctx.log(state, `🏙️ ${p.name} fonda la Metropoli ${TRACKS[track].name.toLowerCase()} (+2 PV).`);
}

function metroOwner(state, track) {
  const v = state.empires.metros[track];
  return v == null ? null : state.buildings[v]?.owner ?? null;
}

/** Livello successivo raggiungibile? Restituisce null se ok, altrimenti il motivo. */
function improveBlocker(state, p, track) {
  const lvl = p.tracks[track];
  if (lvl >= 5) return 'Livello massimo raggiunto.';
  if (!cities(state, p.id).length) return 'Ti serve almeno una colonia.';
  const c = TRACKS[track].commodity;
  if ((p.hand[c] || 0) < lvl + 1) return `Servono ${lvl + 1} ${RESOURCE_INFO[c].name}.`;
  const next = lvl + 1;
  const owner = metroOwner(state, track);
  const freeCity = cities(state, p.id).some(v => !state.buildings[v].metro);
  if (next === 4 && owner === null && !freeCity) return 'Ti serve una colonia senza metropoli.';
  if (next === 5 && owner && owner !== p.id && !freeCity) return 'Ti serve una colonia senza metropoli.';
  return null;
}

function guardianTargets(state, pid) {
  return [...networkVertices(state, pid)].filter(v => buildableVertex(state, v) && !state.buildings[v] && !state.guardians[v]);
}

function canActNow(state, g) {
  return g.active && g.activatedTurn < state.turn;
}

function isOpenRoad(state, e, owner) {
  const edge = state.board.edges[e];
  return [edge.a, edge.b].some(v => {
    if (state.buildings[v]?.owner === owner) return false;
    return !state.board.vertices[v].edges.some(o => o !== e && state.roads[o] === owner);
  });
}

export default {
  id: 'empires',

  onStart(state) {
    state.empires = { invasion: 0, firstInvasion: false, decks: newDecks(state), metros: { trade: null, science: null, defense: null } };
    for (const p of state.players) {
      p.tracks = { trade: 0, science: 0, defense: 0 };
      p.progress = [];
      p.defenderVP = 0;
      p.progressVP = 0;
    }
  },

  buildingYield(state, hex, b) {
    const c = TERRAIN_COMMODITY[hex.terrain];
    if (b.type === 'city' && c) return { [TERRAIN_RES[hex.terrain]]: 1, [c]: 1 };
    return undefined;
  },

  onDice(state, p, dice, ctx) {
    const face = EVENT_FACES[rollDie(state)];
    dice.event = face;
    if (face === 'ship') {
      state.empires.invasion++;
      ctx.log(state, `👾 La flotta aliena avanza (${state.empires.invasion}/${INVASION_LENGTH}).`);
      if (state.empires.invasion >= INVASION_LENGTH) resolveInvasion(state, ctx);
    } else {
      const red = dice.values[0];
      ctx.log(state, `Dado evento: ${TRACKS[face].name} (dado rosso ${red}).`);
      const n = state.players.length;
      for (let i = 0; i < n; i++) {
        const pl = state.players[(state.current + i) % n];
        const lvl = pl.tracks[face];
        if (lvl >= 1 && red <= lvl + 1) drawProgress(state, pl, face, ctx);
      }
    }
  },

  afterProduce(state, roll, gains) {
    for (const pl of state.players) {
      if (pl.tracks.science >= 3 && !gains[pl.id]) pl.freePicks++;
    }
  },

  robberAllowed(state) {
    return !!state.empires?.firstInvasion;
  },

  handLimitBonus(state, p) {
    return 2 * Object.values(state.buildings).filter(b => b.owner === p.id && b.shield).length;
  },

  victoryPoints(state, pid) {
    const p = state.players.find(x => x.id === pid);
    const metros = Object.values(state.buildings).filter(b => b.owner === pid && b.metro).length;
    return metros * 2 + (p.defenderVP || 0) + (p.progressVP || 0);
  },

  legal(state, pid, { building }) {
    const p = state.players.find(x => x.id === pid);
    const myTurnMain = state.phase === 'main' && state.players[state.current].id === pid;
    const out = { guardians: [], upgradeGuardians: [], activateGuardians: [], guardianMoves: [], displace: [], chase: [], shields: [], improve: {}, diplomacy: [] };
    if (building) {
      if (canAfford(p.hand, costOf(state, pid, 'guardian')) && countLevel(state, pid, 1) < GUARDIANS_PER_LEVEL) out.guardians = guardianTargets(state, pid);
      if (canAfford(p.hand, costOf(state, pid, 'upgradeGuardian'))) {
        out.upgradeGuardians = guardiansOf(state, pid).filter(g => g.level < 3 && g.upgradedTurn !== state.turn
          && (g.level < 2 || p.tracks.defense >= 3) && countLevel(state, pid, g.level + 1) < GUARDIANS_PER_LEVEL).map(g => g.v);
      }
      if (canAfford(p.hand, costOf(state, pid, 'activateGuardian'))) out.activateGuardians = guardiansOf(state, pid).filter(g => !g.active).map(g => g.v);
      if (canAfford(p.hand, costOf(state, pid, 'shield')) && piecesLeft(state, pid).shield > 0) out.shields = cities(state, pid).filter(v => !state.buildings[v].shield);
    }
    if (myTurnMain) {
      for (const t of Object.keys(TRACKS)) out.improve[t] = improveBlocker(state, p, t);
      const targets = guardianTargets(state, pid);
      const robberVerts = state.board.hexes[state.robberHex].vertices;
      for (const g of guardiansOf(state, pid).filter(x => canActNow(state, x))) {
        const to = targets.filter(v => v !== g.v);
        if (to.length) out.guardianMoves.push({ from: g.v, to });
        const weaker = Object.entries(state.guardians)
          .filter(([v, o]) => o.owner !== pid && o.level < g.level && networkVertices(state, pid).has(Number(v)))
          .map(([v]) => Number(v));
        if (weaker.length) out.displace.push({ from: g.v, to: weaker });
        if (state.empires.firstInvasion && robberVerts.includes(g.v)) out.chase.push(g.v);
      }
      out.diplomacy = Object.entries(state.roads).filter(([e, o]) => o !== pid && isOpenRoad(state, Number(e), o)).map(([e]) => Number(e));
    }
    return out;
  },

  privateExtra(state, pid) {
    const p = state.players.find(x => x.id === pid);
    return { tracks: p.tracks, progress: p.progress };
  },

  publicExtra(state) {
    return {
      guardians: state.guardians,
      empires: {
        invasion: state.empires.invasion,
        length: INVASION_LENGTH,
        firstInvasion: state.empires.firstInvasion,
        strength: invasionStrength(state),
        defense: state.players.reduce((s, p) => s + defenseOf(state, p.id), 0),
        metros: state.empires.metros,
        decks: Object.fromEntries(Object.entries(state.empires.decks).map(([k, d]) => [k, d.length])),
      },
      playerExtras: Object.fromEntries(state.players.map(p => [p.id, {
        tracks: p.tracks, progressCount: p.progress.length, defense: defenseOf(state, p.id), defenderVP: p.defenderVP,
      }])),
    };
  },

  handlers: {
    improve(state, p, { track }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      if (!TRACKS[track]) ctx.fail('Tracciato non valido.');
      const why = improveBlocker(state, p, track);
      if (why) ctx.fail(why);
      const c = TRACKS[track].commodity;
      const lvl = p.tracks[track] + 1;
      p.hand[c] -= lvl;
      state.bank[c] += lvl;
      p.tracks[track] = lvl;
      ctx.log(state, `${p.name} porta ${TRACKS[track].name} al livello ${lvl}.`);
      const owner = metroOwner(state, track);
      if (lvl === 4 && owner === null) placeMetro(state, p, track, ctx);
      if (lvl === 5 && owner && owner !== p.id) {
        const o = ctx.findPlayer(state, owner);
        if (o.tracks[track] < 5) placeMetro(state, p, track, ctx);
      }
    },

    buildGuardian(state, p, { vertex }, ctx) {
      ctx.requireBuildTurn(state, p);
      if (countLevel(state, p.id, 1) >= GUARDIANS_PER_LEVEL) ctx.fail('Hai già tutti i guardiani di livello 1 in gioco.');
      if (!guardianTargets(state, p.id).includes(vertex)) ctx.fail('Il guardiano va su un incrocio libero della tua rete.');
      ctx.payOrFail(state, p, 'guardian');
      state.guardians[vertex] = { owner: p.id, level: 1, active: false, activatedTurn: -1 };
      ctx.log(state, `${p.name} schiera un guardiano.`);
      ctx.updateLongestRoad(state);
    },

    upgradeGuardian(state, p, { vertex }, ctx) {
      ctx.requireBuildTurn(state, p);
      const g = state.guardians[vertex];
      if (!g || g.owner !== p.id) ctx.fail('Non è un tuo guardiano.');
      if (g.level >= 3) ctx.fail('Il guardiano è già al massimo.');
      if (g.level === 2 && p.tracks.defense < 3) ctx.fail('Serve Difesa al livello 3.');
      if (g.upgradedTurn === state.turn) ctx.fail('Questo guardiano è già stato potenziato in questo turno.');
      if (countLevel(state, p.id, g.level + 1) >= GUARDIANS_PER_LEVEL) ctx.fail('Hai già tutti i guardiani di quel livello.');
      ctx.payOrFail(state, p, 'upgradeGuardian');
      g.level++;
      g.upgradedTurn = state.turn;
      ctx.log(state, `${p.name} potenzia un guardiano al livello ${g.level}.`);
    },

    activateGuardian(state, p, { vertex }, ctx) {
      ctx.requireBuildTurn(state, p);
      const g = state.guardians[vertex];
      if (!g || g.owner !== p.id) ctx.fail('Non è un tuo guardiano.');
      if (g.active) ctx.fail('Il guardiano è già attivo.');
      ctx.payOrFail(state, p, 'activateGuardian');
      g.active = true;
      g.activatedTurn = state.turn;
      ctx.log(state, `${p.name} attiva un guardiano.`);
    },

    moveGuardian(state, p, { from, to }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const g = state.guardians[from];
      if (!g || g.owner !== p.id || !canActNow(state, g)) ctx.fail('Il guardiano deve essere attivo da almeno un turno.');
      if (!guardianTargets(state, p.id).includes(to)) ctx.fail('Destinazione non valida.');
      delete state.guardians[from];
      state.guardians[to] = { ...g, active: false };
      ctx.log(state, `${p.name} sposta un guardiano.`);
      ctx.updateLongestRoad(state);
    },

    displaceGuardian(state, p, { from, to }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const g = state.guardians[from];
      const target = state.guardians[to];
      if (!g || g.owner !== p.id || !canActNow(state, g)) ctx.fail('Il guardiano deve essere attivo da almeno un turno.');
      if (!target || target.owner === p.id || target.level >= g.level) ctx.fail('Puoi scacciare solo un guardiano avversario più debole.');
      if (!networkVertices(state, p.id).has(to)) ctx.fail('Il bersaglio deve essere collegato alla tua rete.');
      const victim = ctx.findPlayer(state, target.owner);
      delete state.guardians[from];
      state.guardians[to] = { ...g, active: false };
      ctx.log(state, `${p.name} scaccia un guardiano di ${victim.name}, che torna nella riserva.`);
      ctx.updateLongestRoad(state);
    },

    chaseRobber(state, p, { from }, ctx) {
      ctx.requirePhase(state, 'main');
      ctx.requireTurn(state, p.id);
      const g = state.guardians[from];
      if (!g || g.owner !== p.id || !canActNow(state, g)) ctx.fail('Il guardiano deve essere attivo da almeno un turno.');
      if (!state.empires.firstInvasion) ctx.fail('La flotta pirata è ferma fino alla prima invasione.');
      if (!state.board.hexes[state.robberHex].vertices.includes(from)) ctx.fail('Il guardiano deve essere vicino alla flotta pirata.');
      g.active = false;
      ctx.log(state, `${p.name} scaccia la flotta pirata con un guardiano.`);
      ctx.enterRobber(state, 'main', 'land');
    },

    buildShield(state, p, { vertex }, ctx) {
      ctx.requireBuildTurn(state, p);
      const b = state.buildings[vertex];
      if (!b || b.owner !== p.id || b.type !== 'city') ctx.fail('Lo scudo va su una tua colonia.');
      if (b.shield) ctx.fail('Questa colonia ha già uno scudo.');
      if (piecesLeft(state, p.id).shield <= 0) ctx.fail('Hai finito gli scudi.');
      ctx.payOrFail(state, p, 'shield');
      b.shield = true;
      ctx.log(state, `${p.name} installa uno scudo planetario.`);
    },

    playProgress(state, p, a, ctx) {
      const { card } = a;
      const info = PROGRESS_CARDS[card];
      if (!info || info.vp) ctx.fail('Carta non valida.');
      const idx = p.progress.indexOf(card);
      if (idx < 0) ctx.fail('Non hai questa carta.');
      ctx.requireTurn(state, p.id);
      ctx.requirePhase(state, info.when === 'roll' ? 'roll' : 'main');
      const others = state.players.filter(o => o.id !== p.id);
      const take = () => { p.progress.splice(idx, 1); ctx.log(state, `${p.name} gioca ${info.name}.`); };

      switch (card) {
        case 'orbital':
          take();
          state.freeRoads = Math.min(2, piecesLeft(state, p.id).road);
          break;
        case 'extractor': take(); gain(state, p, 'ore', 2); break;
        case 'greenhouse': take(); gain(state, p, 'bio', 2); break;
        case 'shieldgen': {
          const v = cities(state, p.id).find(x => !state.buildings[x].shield);
          if (v === undefined || piecesLeft(state, p.id).shield <= 0) ctx.fail('Non hai colonie senza scudo.');
          take();
          state.buildings[v].shield = true;
          break;
        }
        case 'predictive': {
          const vals = a.values;
          if (!Array.isArray(vals) || vals.length !== 2 || !vals.every(x => Number.isInteger(x) && x >= 1 && x <= 6)) ctx.fail('Scegli i due dadi (1–6).');
          take();
          ctx.doRoll(state, p, vals);
          break;
        }
        case 'medicine': take(); state.turnFlags.medicine = p.id; break;
        case 'resmono': {
          if (!RESOURCES.includes(a.resource)) ctx.fail('Scegli una risorsa.');
          take();
          let tot = 0;
          for (const o of others) { const k = Math.min(2, o.hand[a.resource]); o.hand[a.resource] -= k; p.hand[a.resource] += k; tot += k; }
          ctx.log(state, `${p.name} ottiene ${tot} ${RESOURCE_INFO[a.resource].icon}.`);
          break;
        }
        case 'commono': {
          if (!COMMODITIES.includes(a.resource)) ctx.fail('Scegli una merce.');
          take();
          let tot = 0;
          for (const o of others) { const k = Math.min(1, o.hand[a.resource]); o.hand[a.resource] -= k; p.hand[a.resource] += k; tot += k; }
          ctx.log(state, `${p.name} ottiene ${tot} ${RESOURCE_INFO[a.resource].icon}.`);
          break;
        }
        case 'tradefleet':
          if (![...RESOURCES, ...COMMODITIES].includes(a.resource)) ctx.fail('Scegli una risorsa o merce.');
          take();
          state.turnFlags.tradefleet = { player: p.id, res: a.resource };
          break;
        case 'requisition': {
          const t = ctx.findPlayer(state, a.target);
          const myVp = ctx.victoryPoints(state, p.id, { includeHidden: false });
          if (!t || t.id === p.id || ctx.victoryPoints(state, t.id, { includeHidden: false }) <= myVp) ctx.fail('Scegli un giocatore con più punti di te.');
          take();
          for (let i = 0; i < 2; i++) ctx.stealRandom(state, p, t);
          break;
        }
        case 'windfall': take(); p.freePicks += 2; break;
        case 'commander': {
          const mine = guardiansOf(state, p.id).filter(g => !g.active);
          if (!mine.length) ctx.fail('Non hai guardiani da attivare.');
          take();
          for (const g of mine) Object.assign(state.guardians[g.v], { active: true, activatedTurn: state.turn });
          break;
        }
        case 'training': {
          const g = guardiansOf(state, p.id)
            .filter(x => x.level < 3 && (x.level < 2 || p.tracks.defense >= 3) && countLevel(state, p.id, x.level + 1) < GUARDIANS_PER_LEVEL)
            .sort((x, y) => x.level - y.level)[0];
          if (!g) ctx.fail('Nessun guardiano da potenziare.');
          take();
          state.guardians[g.v].level++;
          break;
        }
        case 'sabotage': {
          take();
          const myVp = ctx.victoryPoints(state, p.id, { includeHidden: false });
          for (const o of others) {
            if (ctx.victoryPoints(state, o.id, { includeHidden: false }) < myVp) continue;
            const n = Math.floor(handSize(o.hand) / 2);
            for (let i = 0; i < n; i++) {
              const pool = Object.entries(o.hand).flatMap(([r, k]) => Array(k).fill(r));
              const r = pool[randInt(state, pool.length)];
              o.hand[r]--; state.bank[r]++;
            }
            if (n) ctx.log(state, `${o.name} perde ${n} carte.`);
          }
          break;
        }
        case 'spy': {
          const t = ctx.findPlayer(state, a.target);
          if (!t || t.id === p.id || !t.progress.length) ctx.fail('Scegli un avversario con carte progresso.');
          take();
          const stolen = t.progress.splice(randInt(state, t.progress.length), 1)[0];
          p.progress.push(stolen);
          ctx.log(state, `${p.name} ruba una carta progresso a ${t.name}.`);
          break;
        }
        case 'diplomacy': {
          const owner = state.roads[a.edge];
          if (owner === undefined || owner === p.id || !isOpenRoad(state, a.edge, owner)) ctx.fail('Scegli un\'iperlinea aperta di un avversario.');
          take();
          delete state.roads[a.edge];
          ctx.log(state, `Un'iperlinea di ${ctx.findPlayer(state, owner).name} viene smantellata.`);
          ctx.updateLongestRoad(state);
          break;
        }
        default:
          ctx.fail('Carta non valida.');
      }
    },
  },
};

export { TRACK_OF_COMMODITY };
