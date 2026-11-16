// Macchina a stati della partita. Lo stato è un oggetto JSON serializzabile.
// applyAction() valida e muta lo stato; in caso di azione non valida lancia GameError
// (il server lavora su una copia, quindi uno stato a metà non viene mai pubblicato).
// I moduli-espansione (server/engine/modules) si agganciano tramite hook e handler propri.

import {
  RESOURCES, COMMODITIES, RESOURCE_INFO, DEV_CARDS, BANK_PER_RESOURCE, TERRAIN_RES,
  LONGEST_ROAD_MIN, LARGEST_ARMY_MIN, MIN_PLAYERS, MAX_PLAYERS, MAX_PLAYERS_GALAXY,
  PLAYER_COLORS, BUILD_NAMES, MODULE_INFO, MODULE_ORDER, MAP_MODES, suggestedVp,
} from '../../public/shared/constants.js';
import { generateBoard, boardSpec } from './board.js';
import { shuffle, rollDie, randInt } from './rng.js';
import { longestRoad } from './longestRoad.js';
import {
  hasModule, cardTypes, emptyHand, handSize, canAfford, isValidResourceBundle, piecesLeft, payCost, gain, costOf,
  canPlaceSettlement, canPlaceCity, canPlaceRoad, validRoadSpots, tradeRatios,
} from './rules.js';
import { MODULES } from './modules/index.js';

export class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };
const resName = r => RESOURCE_INFO[r]?.name ?? r;

export const DEFAULT_SETTINGS = { players: 4, modules: [], mapMode: 'random', winVp: 10, winVpAuto: true };

export function createGame({ seed = Date.now() >>> 0, settings = {} } = {}) {
  return {
    rng: seed >>> 0,
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: [],
    board: null,
    buildings: {},   // vertexId -> { owner, type: 'settlement' | 'city', shield?, metro? }
    roads: {},       // edgeId -> owner
    ships: {},       // edgeId -> owner (Spazio profondo)
    guardians: {},   // vertexId -> { owner, level, active, ... } (Imperi e Invasione)
    robberHex: null,
    raidersHex: null,
    bank: {},
    devDeck: [],
    current: 0,
    turn: 0,
    setup: null,
    dice: null,
    discardPending: {},
    robberReturn: 'main',
    devPlayedThisTurn: false,
    freeRoads: 0,
    turnFlags: {},
    event: null,
    trade: null,
    tradeSeq: 0,
    extraBuild: null,
    longestRoad: { owner: null, length: 0 },
    largestArmy: { owner: null, size: 0 },
    winner: null,
    log: [],
    version: 0,
  };
}

export function log(state, text) {
  state.log.push({ n: state.log.length ? state.log[state.log.length - 1].n + 1 : 1, text });
  if (state.log.length > 80) state.log.shift();
}

export function findPlayer(state, playerId) {
  return state.players.find(p => p.id === playerId);
}

const currentPlayer = state => state.players[state.current];

/** Chi può agire adesso: il giocatore di turno, o chi ha la costruzione extra. */
export function actorId(state) {
  if (state.phase === 'extraBuild') return state.extraBuild?.queue[0] ?? null;
  return currentPlayer(state)?.id ?? null;
}

// ---------- Hook dei moduli ----------

export function activeModules(state) {
  return MODULE_ORDER.filter(m => hasModule(state, m)).map(m => MODULES[m]);
}

function runHook(state, name, ...args) {
  const out = [];
  for (const m of activeModules(state)) if (typeof m[name] === 'function') out.push(m[name](state, ...args, ctx));
  return out;
}

// ---------- Impostazioni e lobby ----------

export function maxPlayers(settings) {
  return settings.modules.includes('galaxy') ? MAX_PLAYERS_GALAXY : MAX_PLAYERS;
}

export function setSettings(state, input = {}) {
  if (state.phase !== 'lobby') fail('Le impostazioni si cambiano solo prima di iniziare.');
  const s = { ...state.settings };
  if (input.modules !== undefined) {
    if (!Array.isArray(input.modules) || !input.modules.every(m => MODULE_INFO[m])) fail('Espansione sconosciuta.');
    const mods = MODULE_ORDER.filter(m => input.modules.includes(m));
    for (const m of mods) {
      for (const req of MODULE_INFO[m].requires || []) {
        if (!mods.includes(req)) fail(`${MODULE_INFO[m].name} richiede ${MODULE_INFO[req].name}.`);
      }
    }
    s.modules = mods;
  }
  if (input.mapMode !== undefined) {
    if (!MAP_MODES[input.mapMode]) fail('Modalità mappa non valida.');
    s.mapMode = input.mapMode;
  }
  if (input.players !== undefined) {
    const n = Number(input.players);
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > maxPlayers(s)) fail(`Numero di giocatori non valido (${MIN_PLAYERS}–${maxPlayers(s)}).`);
    s.players = n;
  }
  if (s.players > maxPlayers(s)) s.players = maxPlayers(s);
  if (state.players.length > s.players) fail(`Ci sono già ${state.players.length} giocatori in sala.`);
  if (input.winVp !== undefined) {
    const v = Number(input.winVp);
    if (!Number.isInteger(v) || v < 5 || v > 20) fail('I punti per vincere devono essere tra 5 e 20.');
    s.winVp = v;
    s.winVpAuto = false;
  }
  if (input.winVpAuto === true) s.winVpAuto = true;
  if (s.winVpAuto) s.winVp = suggestedVp(s.modules);
  state.settings = s;
  state.version++;
}

export function addPlayer(state, { id, name, color, bot = null }) {
  if (state.phase !== 'lobby') fail('La partita è già iniziata.');
  if (state.players.length >= state.settings.players) fail('La partita è piena.');
  name = String(name || '').trim().slice(0, 16);
  if (!name) fail('Inserisci un nome.');
  const colors = PLAYER_COLORS.slice(0, maxPlayers(state.settings));
  if (!colors.some(c => c.id === color)) fail('Colore non valido.');
  if (state.players.some(p => p.color === color)) fail('Colore già preso.');
  const player = { id, name, color, hand: {}, devCards: [], playedMarines: 0, freePicks: 0 };
  if (bot) {
    if (!['easy', 'medium', 'hard'].includes(bot.level)) fail('Livello del bot non valido.');
    player.bot = { level: bot.level };
    player.connected = true;
  }
  state.players.push(player);
  state.version++;
  log(state, `${name} è entrato nella partita.`);
  return player;
}

export function removePlayer(state, playerId) {
  if (state.phase !== 'lobby') fail('Non si può uscire a partita iniziata.');
  state.players = state.players.filter(p => p.id !== playerId);
  state.version++;
}

function buildDevDeck(state) {
  if (hasModule(state, 'empires')) return []; // sostituite dalle carte progresso
  const galaxy = hasModule(state, 'galaxy');
  const extra = { marines: 6, shortcut: 1, rapid: 1, embargo: 1, relic: 0 };
  const deck = [];
  for (const [type, info] of Object.entries(DEV_CARDS)) {
    const n = info.count + (galaxy ? extra[type] : 0);
    for (let i = 0; i < n; i++) deck.push(type);
  }
  return shuffle(state, deck);
}

export function startGame(state) {
  if (state.phase !== 'lobby') fail('La partita è già iniziata.');
  if (state.players.length < MIN_PLAYERS) fail(`Servono almeno ${MIN_PLAYERS} giocatori.`);
  if (state.players.length !== state.settings.players) fail(`Servono ${state.settings.players} giocatori (ora ${state.players.length}).`);
  shuffle(state, state.players);
  const types = cardTypes(state);
  const perRes = hasModule(state, 'galaxy') ? 24 : BANK_PER_RESOURCE;
  state.bank = Object.fromEntries(types.map(r => [r, COMMODITIES.includes(r) ? 12 : perRes]));
  for (const p of state.players) p.hand = emptyHand(types);
  state.board = generateBoard(state, boardSpec(state.settings));
  state.robberHex = state.board.robberHex;
  state.raidersHex = hasModule(state, 'deepspace') ? state.board.raidersHex : null;
  state.devDeck = buildDevDeck(state);
  const n = state.players.length;
  const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
  state.setup = { order, index: 0, step: 'settlement', lastVertex: null };
  state.current = order[0];
  state.phase = 'setup';
  runHook(state, 'onStart');
  state.version++;
  log(state, `La partita inizia! Ordine: ${state.players.map(p => p.name).join(', ')}.`);
}

// ---------- Punteggi ----------

export function victoryPoints(state, playerId, { includeHidden = true } = {}) {
  let vp = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner === playerId) vp += b.type === 'city' ? 2 : 1;
  }
  if (state.longestRoad.owner === playerId) vp += 2;
  if (state.largestArmy.owner === playerId) vp += 2;
  const p = findPlayer(state, playerId);
  if (includeHidden) vp += p.devCards.filter(c => c.type === 'relic').length;
  for (const m of activeModules(state)) if (m.victoryPoints) vp += m.victoryPoints(state, playerId, { includeHidden });
  return vp;
}

function updateLongestRoad(state) {
  const lengths = Object.fromEntries(state.players.map(p => [p.id,
    longestRoad(state.board, state.roads, state.buildings, p.id, { ships: state.ships, guardians: state.guardians })]));
  const holder = state.longestRoad.owner;
  const max = Math.max(...Object.values(lengths));
  const leaders = Object.keys(lengths).filter(id => lengths[id] === max);

  if (holder && lengths[holder] === max && max >= LONGEST_ROAD_MIN) {
    state.longestRoad.length = max; // il detentore mantiene il bonus anche in caso di pareggio
    return;
  }
  const prev = holder;
  if (max >= LONGEST_ROAD_MIN && leaders.length === 1) {
    state.longestRoad = { owner: leaders[0], length: max };
  } else {
    state.longestRoad = { owner: null, length: 0 };
  }
  if (state.longestRoad.owner !== prev) {
    if (state.longestRoad.owner) {
      log(state, `${findPlayer(state, state.longestRoad.owner).name} ottiene la Rete più estesa (${max}).`);
    } else if (prev) {
      log(state, `Nessuno detiene più la Rete più estesa.`);
    }
  }
}

function updateLargestArmy(state, player) {
  const la = state.largestArmy;
  if (player.playedMarines >= LARGEST_ARMY_MIN && player.playedMarines > la.size && la.owner !== player.id) {
    state.largestArmy = { owner: player.id, size: player.playedMarines };
    log(state, `${player.name} ottiene la Flotta più forte.`);
  } else if (la.owner === player.id) {
    la.size = player.playedMarines;
  }
}

function checkWinner(state) {
  if (state.phase === 'lobby' || state.phase === 'setup' || state.phase === 'ended') return;
  const p = currentPlayer(state);
  const vp = victoryPoints(state, p.id);
  if (vp >= state.settings.winVp) {
    state.phase = 'ended';
    state.winner = p.id;
    state.trade = null;
    state.extraBuild = null;
    log(state, `🏆 ${p.name} vince la partita con ${vp} punti!`);
  }
}

// ---------- Produzione e pirati ----------

function produce(state, roll) {
  const gains = {}; // playerId -> { res: n }
  for (const h of state.board.hexes) {
    if (h.number !== roll || h.id === state.robberHex || h.hidden || h.kind !== 'land') continue;
    if (runHook(state, 'hexBlocked', h).some(Boolean)) continue;
    const res = TERRAIN_RES[h.terrain];
    if (!res) continue;
    let mult = 1;
    for (const m of runHook(state, 'productionMultiplier', h)) if (typeof m === 'number') mult *= m;
    if (mult === 0) continue;
    for (const v of h.vertices) {
      const b = state.buildings[v];
      if (!b) continue;
      let y = { [res]: b.type === 'city' ? 2 : 1 };
      for (const r of runHook(state, 'buildingYield', h, b)) if (r) y = r;
      gains[b.owner] ??= {};
      for (const [k, n] of Object.entries(y)) gains[b.owner][k] = (gains[b.owner][k] || 0) + n * mult;
    }
  }
  for (const r of cardTypes(state)) {
    const takers = Object.keys(gains).filter(id => gains[id][r]);
    const total = takers.reduce((s, id) => s + gains[id][r], 0);
    if (total === 0) continue;
    if (total > state.bank[r]) {
      if (takers.length === 1) {
        gains[takers[0]][r] = state.bank[r];
      } else {
        for (const id of takers) gains[id][r] = 0;
        log(state, `La banca non ha abbastanza ${resName(r)}: nessuno la riceve.`);
      }
    }
  }
  const parts = [];
  for (const [id, g] of Object.entries(gains)) {
    const p = findPlayer(state, id);
    const got = [];
    for (const [r, n] of Object.entries(g)) {
      if (!n) continue;
      p.hand[r] += n;
      state.bank[r] -= n;
      got.push(`${n} ${RESOURCE_INFO[r].icon}`);
    }
    if (got.length) parts.push(`${p.name}: ${got.join(' ')}`);
    else delete gains[id];
  }
  log(state, parts.length ? `Produzione — ${parts.join(' · ')}` : 'Nessuna produzione.');
  runHook(state, 'afterProduce', roll, gains);
}

export function robberVictims(state, hexId, playerId) {
  const hex = state.board.hexes[hexId];
  const ids = new Set();
  if (hex.kind === 'void') {
    for (const e of hex.edges) {
      const o = state.ships[e];
      if (o && o !== playerId && handSize(findPlayer(state, o).hand) > 0) ids.add(o);
    }
  } else {
    for (const v of hex.vertices) {
      const b = state.buildings[v];
      if (b && b.owner !== playerId && handSize(findPlayer(state, b.owner).hand) > 0) ids.add(b.owner);
    }
  }
  return [...ids];
}

/** Settori su cui si può spostare la flotta pirata (o i predoni, nel vuoto). */
export function robberTargets(state) {
  const landOk = !fleetLocked(state);
  const voidOk = hasModule(state, 'deepspace') && state.robberMode !== 'land';
  return state.board.hexes.filter(h => {
    if (h.kind === 'void') return voidOk && h.id !== state.raidersHex;
    return landOk && !h.hidden && h.id !== state.robberHex;
  }).map(h => h.id);
}

/** La flotta pirata (terra) è bloccata? (es. Imperi e Invasione prima della prima invasione).
 *  I predoni del vuoto restano liberi. */
export function fleetLocked(state) {
  return runHook(state, 'robberAllowed').some(v => v === false);
}

export function stealRandom(state, thief, victim) {
  const pool = [];
  for (const [r, n] of Object.entries(victim.hand)) for (let i = 0; i < n; i++) pool.push(r);
  if (!pool.length) return null;
  const r = pool[randInt(state, pool.length)];
  victim.hand[r]--;
  thief.hand[r]++;
  return r;
}

function handLimit(state, p) {
  let limit = 7;
  for (const l of runHook(state, 'handLimitBonus', p)) if (typeof l === 'number') limit += l;
  return limit;
}

function robberAllowed(state) {
  state.robberMode = null;
  return robberTargets(state).length > 0;
}

/** Avvia lo spostamento della flotta pirata (dopo un 7 o una carta).
 *  mode 'land': solo la flotta pirata (es. scacciata da un guardiano). */
function enterRobber(state, returnPhase, mode = null) {
  state.robberReturn = returnPhase;
  state.robberMode = mode;
  state.phase = 'robber';
}

// ---------- Azioni ----------

function requireTurn(state, playerId) {
  if (currentPlayer(state)?.id !== playerId) fail('Non è il tuo turno.');
}

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) fail('Azione non disponibile in questa fase.');
}

/** Costruzioni: nel proprio turno (fase main) o durante la propria costruzione extra. */
function requireBuildTurn(state, p) {
  if (state.phase === 'main') return requireTurn(state, p.id);
  if (state.phase === 'extraBuild') {
    if (actorId(state) !== p.id) fail('Non è il tuo momento di costruire.');
    return;
  }
  fail('Azione non disponibile in questa fase.');
}

function bundleTotal(b) {
  return Object.values(b).reduce((s, n) => s + n, 0);
}

function describeBundle(b) {
  return Object.entries(b).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RESOURCE_INFO[r].icon}`).join(' ');
}

function payOrFail(state, p, what) {
  const cost = costOf(state, p.id, what);
  if (!canAfford(p.hand, cost)) fail('Risorse insufficienti.');
  payCost(state, p, cost);
}

/** Passa il turno al giocatore successivo. */
function advanceTurn(state) {
  state.trade = null;
  state.freeRoads = 0;
  state.devPlayedThisTurn = false;
  state.turnFlags = {};
  state.event = null;
  state.extraBuild = null;
  state.current = (state.current + 1) % state.players.length;
  state.turn++;
  state.phase = 'roll';
  runHook(state, 'onNewTurn');
  log(state, `Tocca a ${currentPlayer(state).name}.`);
}

function doRoll(state, p, forced = null) {
  const d = forced || [rollDie(state), rollDie(state)];
  const sum = d[0] + d[1];
  state.dice = { values: d, sum, seq: (state.dice?.seq || 0) + 1 };
  log(state, `${p.name} tira ${d[0]} + ${d[1]} = ${sum}.`);
  runHook(state, 'onDice', p, state.dice);
  if (state.phase === 'ended') return;
  if (sum === 7) {
    if (state.event?.type === 'truce') {
      log(state, 'Tregua: nessun raid pirata.');
      state.phase = 'main';
      return;
    }
    state.discardPending = {};
    for (const pl of state.players) {
      const n = handSize(pl.hand);
      if (n > handLimit(state, pl)) state.discardPending[pl.id] = Math.floor(n / 2);
    }
    const robber = robberAllowed(state);
    state.robberReturn = 'main';
    if (Object.keys(state.discardPending).length) {
      state.phase = 'discard';
      state.discardThenRobber = robber;
      log(state, `Raid pirata! Chi ha troppe carte deve scartarne metà.`);
    } else if (robber) {
      state.phase = 'robber';
      log(state, fleetLocked(state)
        ? `Raid! La flotta pirata è ferma fino alla prima invasione: ${p.name} sposta i predoni del vuoto.`
        : `Raid pirata! ${p.name} sposta la flotta.`);
    } else {
      state.phase = 'main';
      log(state, 'La flotta pirata è ferma fino alla prima invasione.');
    }
  } else {
    produce(state, sum);
    state.phase = 'main';
  }
}

/** Contesto passato agli hook e agli handler dei moduli. */
export const ctx = {
  fail, log, findPlayer, currentPlayer, actorId, requireTurn, requirePhase, requireBuildTurn,
  payOrFail, updateLongestRoad, stealRandom, robberVictims, enterRobber, advanceTurn, doRoll,
  victoryPoints, handLimit, runHook: (state, name, ...a) => runHook(state, name, ...a),
};

const handlers = {
  // --- Piazzamento iniziale ---
  placeSettlement(state, p, { vertex }) {
    requirePhase(state, 'setup');
    requireTurn(state, p.id);
    if (state.setup.step !== 'settlement') fail('Ora devi piazzare un\'iperlinea.');
    if (!canPlaceSettlement(state, p.id, vertex, { setup: true })) fail('Posizione non valida.');
    state.buildings[vertex] = { owner: p.id, type: 'settlement' };
    const second = state.setup.index >= state.players.length;
    if (second) {
      const got = [];
      for (const h of state.board.vertices[vertex].hexes) {
        const hex = state.board.hexes[h];
        const r = !hex.hidden && TERRAIN_RES[hex.terrain];
        if (r && gain(state, p, r)) got.push(RESOURCE_INFO[r].icon);
      }
      log(state, `${p.name} piazza il secondo avamposto e riceve ${got.join(' ') || 'nulla'}.`);
    } else {
      log(state, `${p.name} piazza un avamposto.`);
    }
    state.setup.step = 'road';
    state.setup.lastVertex = vertex;
  },

  placeRoad(state, p, { edge }) {
    requirePhase(state, 'setup');
    requireTurn(state, p.id);
    if (state.setup.step !== 'road') fail('Prima piazza un avamposto.');
    if (!canPlaceRoad(state, p.id, edge, { mustTouchVertex: state.setup.lastVertex })) fail('L\'iperlinea deve partire dal tuo nuovo avamposto.');
    state.roads[edge] = p.id;
    runHook(state, 'onPiecePlaced', p, { kind: 'road', id: edge });
    state.setup.index++;
    if (state.setup.index >= state.setup.order.length) {
      state.phase = 'roll';
      state.current = 0;
      state.turn = 1;
      state.setup = null;
      runHook(state, 'onSetupDone');
      runHook(state, 'onNewTurn');
      log(state, `Piazzamento completato. Tocca a ${currentPlayer(state).name}.`);
    } else {
      state.current = state.setup.order[state.setup.index];
      state.setup.step = 'settlement';
      state.setup.lastVertex = null;
    }
  },

  // --- Turno ---
  roll(state, p) {
    requirePhase(state, 'roll');
    requireTurn(state, p.id);
    doRoll(state, p);
  },

  discard(state, p, { cards }) {
    requirePhase(state, 'discard');
    const need = state.discardPending[p.id];
    if (!need) fail('Non devi scartare.');
    if (!isValidResourceBundle(cards, cardTypes(state)) || bundleTotal(cards) !== need) fail(`Devi scartare esattamente ${need} carte.`);
    if (!canAfford(p.hand, cards)) fail('Non hai quelle carte.');
    for (const [r, n] of Object.entries(cards)) { p.hand[r] -= n; state.bank[r] += n; }
    delete state.discardPending[p.id];
    log(state, `${p.name} scarta ${need} carte.`);
    if (Object.keys(state.discardPending).length === 0) {
      if (state.discardThenRobber === false) {
        state.phase = state.robberReturn;
      } else {
        state.phase = 'robber';
        log(state, `${currentPlayer(state).name} sposta la flotta pirata.`);
      }
      state.discardThenRobber = undefined;
    }
  },

  moveRobber(state, p, { hex, victim }) {
    requirePhase(state, 'robber');
    requireTurn(state, p.id);
    if (!state.board.hexes[hex]) fail('Settore non valido.');
    if (!robberTargets(state).includes(hex)) fail('La flotta non può andare in quel settore.');
    const victims = robberVictims(state, hex, p.id);
    if (victims.length) {
      if (victim == null && victims.length === 1) victim = victims[0];
      if (!victims.includes(victim)) fail('Scegli a chi rubare.');
    }
    const isVoid = state.board.hexes[hex].kind === 'void';
    if (isVoid) state.raidersHex = hex; else state.robberHex = hex;
    const who = isVoid ? 'i predoni del vuoto' : 'la flotta pirata';
    if (victims.length) {
      const v = findPlayer(state, victim);
      stealRandom(state, p, v);
      log(state, `${p.name} sposta ${who} e ruba una carta a ${v.name}.`);
    } else {
      log(state, `${p.name} sposta ${who} (nessuno da derubare).`);
    }
    state.robberMode = null;
    state.phase = state.robberReturn;
  },

  buildRoad(state, p, { edge }) {
    requireBuildTurn(state, p);
    if (piecesLeft(state, p.id).road <= 0) fail('Hai finito le iperlinee.');
    if (!canPlaceRoad(state, p.id, edge)) fail('Posizione non valida.');
    const free = state.freeRoads > 0 && state.phase === 'main';
    if (free) state.freeRoads--; else payOrFail(state, p, 'road');
    state.roads[edge] = p.id;
    log(state, `${p.name} costruisce un'iperlinea${free ? ' (gratis)' : ''}.`);
    if (state.freeRoads > 0 && (piecesLeft(state, p.id).road <= 0 || validRoadSpots(state, p.id).length === 0)) state.freeRoads = 0;
    runHook(state, 'onPiecePlaced', p, { kind: 'road', id: edge });
    updateLongestRoad(state);
  },

  buildSettlement(state, p, { vertex }) {
    requireBuildTurn(state, p);
    if (piecesLeft(state, p.id).settlement <= 0) fail('Hai finito gli avamposti.');
    if (!canPlaceSettlement(state, p.id, vertex)) fail('Posizione non valida.');
    payOrFail(state, p, 'settlement');
    state.buildings[vertex] = { owner: p.id, type: 'settlement' };
    log(state, `${p.name} costruisce un avamposto.`);
    runHook(state, 'onPiecePlaced', p, { kind: 'settlement', id: vertex });
    updateLongestRoad(state);
  },

  buildCity(state, p, { vertex }) {
    requireBuildTurn(state, p);
    if (piecesLeft(state, p.id).city <= 0) fail('Hai finito le colonie.');
    if (!canPlaceCity(state, p.id, vertex)) fail('Puoi potenziare solo un tuo avamposto.');
    payOrFail(state, p, 'city');
    state.buildings[vertex] = { owner: p.id, type: 'city' };
    log(state, `${p.name} trasforma un avamposto in colonia.`);
  },

  buyDev(state, p) {
    requireBuildTurn(state, p);
    if (hasModule(state, 'empires')) fail('Con Imperi e Invasione si usano le carte progresso.');
    if (!state.devDeck.length) fail('Il mazzo tecnologie è esaurito.');
    payOrFail(state, p, 'dev');
    const type = state.devDeck.pop();
    p.devCards.push({ type, boughtTurn: state.turn });
    log(state, `${p.name} acquista una ${BUILD_NAMES.dev.toLowerCase()}.`);
  },

  playDev(state, p, { card, resources, resource }) {
    requireTurn(state, p.id);
    requirePhase(state, ...(card === 'marines' ? ['roll', 'main'] : ['main']));
    if (!DEV_CARDS[card] || card === 'relic') fail('Carta non giocabile.');
    if (state.devPlayedThisTurn) fail('Puoi giocare una sola carta tecnologia per turno.');
    const idx = p.devCards.findIndex(c => c.type === card && c.boughtTurn < state.turn);
    if (idx < 0) fail('Non hai questa carta, o l\'hai appena acquistata.');

    if (card === 'rapid') {
      if (!Array.isArray(resources) || resources.length !== 2 || !resources.every(r => RESOURCES.includes(r))) fail('Scegli 2 risorse.');
      const need = {};
      for (const r of resources) need[r] = (need[r] || 0) + 1;
      if (!canAfford(state.bank, need)) fail('La banca non ha quelle risorse.');
    }
    if (card === 'embargo' && !RESOURCES.includes(resource)) fail('Scegli una risorsa.');

    p.devCards.splice(idx, 1);
    state.devPlayedThisTurn = true;
    const name = DEV_CARDS[card].name;

    if (card === 'marines') {
      p.playedMarines++;
      updateLargestArmy(state, p);
      enterRobber(state, state.phase);
      log(state, `${p.name} gioca ${name}: sposta la flotta pirata.`);
    } else if (card === 'shortcut') {
      state.freeRoads = Math.min(2, piecesLeft(state, p.id).road);
      if (validRoadSpots(state, p.id).length === 0) state.freeRoads = 0;
      log(state, `${p.name} gioca ${name}: 2 iperlinee gratis.`);
    } else if (card === 'rapid') {
      for (const r of resources) { p.hand[r]++; state.bank[r]--; }
      log(state, `${p.name} gioca ${name}: prende ${resources.map(r => RESOURCE_INFO[r].icon).join(' ')}.`);
    } else if (card === 'embargo') {
      let total = 0;
      for (const other of state.players) {
        if (other.id === p.id) continue;
        total += other.hand[resource];
        p.hand[resource] += other.hand[resource];
        other.hand[resource] = 0;
      }
      log(state, `${p.name} gioca ${name} su ${resName(resource)} e ne ottiene ${total}.`);
    }
  },

  /** Spende una "risorsa a scelta" guadagnata da eventi, carte o missioni. */
  pickFree(state, p, { resource }) {
    if (!(p.freePicks > 0)) fail('Non hai risorse da scegliere.');
    if (!RESOURCES.includes(resource)) fail('Risorsa non valida.');
    if (state.bank[resource] < 1) fail('La banca ha finito quella risorsa.');
    p.freePicks--;
    gain(state, p, resource);
    log(state, `${p.name} riceve 1 ${RESOURCE_INFO[resource].icon} a scelta.`);
  },

  bankTrade(state, p, { give, get }) {
    requirePhase(state, 'main');
    requireTurn(state, p.id);
    const types = cardTypes(state);
    if (!types.includes(give) || !types.includes(get) || give === get) fail('Scambio non valido.');
    const ratio = tradeRatios(state, p.id)[give];
    if (p.hand[give] < ratio) fail(`Servono ${ratio} ${resName(give)}.`);
    if (state.bank[get] < 1) fail('La banca ha finito quella risorsa.');
    p.hand[give] -= ratio; state.bank[give] += ratio;
    p.hand[get]++; state.bank[get]--;
    log(state, `${p.name} scambia ${ratio} ${RESOURCE_INFO[give].icon} con 1 ${RESOURCE_INFO[get].icon} (banca).`);
  },

  offerTrade(state, p, { give, want }) {
    requirePhase(state, 'main');
    requireTurn(state, p.id);
    if (state.event?.type === 'blackout') fail('Blackout: niente scambi tra giocatori in questo turno.');
    const types = cardTypes(state);
    if (!isValidResourceBundle(give, types) || !isValidResourceBundle(want, types)) fail('Offerta non valida.');
    if (bundleTotal(give) === 0 || bundleTotal(want) === 0) fail('Devi offrire e chiedere almeno una carta.');
    if (types.some(r => (give[r] || 0) > 0 && (want[r] || 0) > 0)) fail('Non puoi offrire e chiedere la stessa risorsa.');
    if (!canAfford(p.hand, give)) fail('Non hai quelle carte.');
    state.trade = { id: ++state.tradeSeq, from: p.id, give, want, responses: {} };
    log(state, `${p.name} offre ${describeBundle(give)} per ${describeBundle(want)}.`);
  },

  respondTrade(state, p, { accept, tradeId }) {
    const t = state.trade;
    if (!t || (tradeId != null && tradeId !== t.id)) fail('Questa offerta non è più valida.');
    if (t.from === p.id) fail('Non puoi rispondere alla tua offerta.');
    if (accept && !canAfford(p.hand, t.want)) fail('Non hai le carte richieste.');
    t.responses[p.id] = !!accept;
  },

  confirmTrade(state, p, { with: otherId }) {
    requirePhase(state, 'main');
    requireTurn(state, p.id);
    const t = state.trade;
    if (!t || t.from !== p.id) fail('Nessuna offerta attiva.');
    if (t.responses[otherId] !== true) fail('Quel giocatore non ha accettato.');
    const other = findPlayer(state, otherId);
    if (!canAfford(p.hand, t.give)) fail('Non hai più le carte offerte.');
    if (!canAfford(other.hand, t.want)) fail(`${other.name} non ha più le carte richieste.`);
    for (const [r, n] of Object.entries(t.give)) { p.hand[r] -= n; other.hand[r] += n; }
    for (const [r, n] of Object.entries(t.want)) { other.hand[r] -= n; p.hand[r] += n; }
    log(state, `${p.name} e ${other.name} concludono lo scambio.`);
    state.trade = null;
  },

  cancelTrade(state, p) {
    if (!state.trade || state.trade.from !== p.id) fail('Nessuna offerta da annullare.');
    state.trade = null;
  },

  endTurn(state, p) {
    requirePhase(state, 'main');
    requireTurn(state, p.id);
    state.trade = null;
    state.freeRoads = 0;
    if (runHook(state, 'onEndTurn', p).some(Boolean)) return; // un modulo ha preso il controllo (es. costruzione extra)
    advanceTurn(state);
  },
};

export function applyAction(state, playerId, action) {
  if (!action || typeof action.type !== 'string') fail('Azione sconosciuta.');
  let handler = Object.hasOwn(handlers, action.type) ? handlers[action.type] : null;
  if (!handler) {
    const owner = Object.values(MODULES).find(m => m.handlers && Object.hasOwn(m.handlers, action.type));
    if (!owner) fail('Azione sconosciuta.');
    if (!hasModule(state, owner.id)) fail('Espansione non attiva in questa partita.');
    handler = owner.handlers[action.type];
  }
  if (state.phase === 'ended') fail('La partita è finita.');
  if (state.phase === 'lobby') fail('La partita non è ancora iniziata.');
  const p = findPlayer(state, playerId);
  if (!p) fail('Giocatore sconosciuto.');
  handler(state, p, action, ctx);
  checkWinner(state);
  state.version++;
  return state;
}
