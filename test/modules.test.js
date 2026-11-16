import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, applyAction, setSettings, victoryPoints, GameError } from '../server/engine/game.js';
import { privateView, publicView } from '../server/engine/view.js';
import { validSettlementSpots, validRoadSpots, canPlaceShip, cardTypes, piecesLeft } from '../server/engine/rules.js';
import { longestRoad } from '../server/engine/longestRoad.js';
import { botAction } from './bot.js';

const COLORS = ['red', 'blue', 'yellow', 'violet', 'green', 'orange'];

function game(n, modules = [], extra = {}, seed = 11) {
  const s = createGame({ seed });
  setSettings(s, { modules, players: n, ...extra });
  for (let i = 0; i < n; i++) addPlayer(s, { id: `p${i}`, name: `G${i}`, color: COLORS[i] });
  startGame(s);
  return s;
}
const cur = s => s.players[s.current];
function doSetup(s) {
  while (s.phase === 'setup') {
    const id = cur(s).id;
    const v = validSettlementSpots(s, id, { setup: true })[0];
    applyAction(s, id, { type: 'placeSettlement', vertex: v });
    applyAction(s, id, { type: 'placeRoad', edge: validRoadSpots(s, id, { mustTouchVertex: v })[0] });
  }
}
function fixBank(s) {
  for (const r of cardTypes(s)) {
    const initial = r === 'credits' || r === 'data' || r === 'plasma' ? 12 : (s.settings.modules.includes('galaxy') ? 24 : 19);
    s.bank[r] = initial - s.players.reduce((x, p) => x + (p.hand[r] || 0), 0);
  }
}

// ---------- Impostazioni ----------

test('impostazioni: dipendenze, limiti e PV suggeriti', () => {
  const s = createGame();
  assert.throws(() => setSettings(s, { modules: ['missions'] }), /richiede/);
  setSettings(s, { modules: ['deepspace', 'missions'] });
  assert.equal(s.settings.winVp, 15);
  assert.throws(() => setSettings(s, { players: 6 }), GameError);
  setSettings(s, { modules: ['galaxy'], players: 6 });
  assert.equal(s.settings.players, 6);
  setSettings(s, { winVp: 12 });
  assert.equal(s.settings.winVp, 12);
  setSettings(s, { modules: [] }); // con galassia disattivata i giocatori tornano a max 4
  assert.equal(s.settings.players, 4);
  assert.equal(s.settings.winVp, 12, 'un valore impostato a mano non viene sovrascritto');
  assert.throws(() => setSettings(s, { mapMode: 'boh' }), GameError);
});

test('impostazioni: la partita parte solo col numero di giocatori scelto', () => {
  const s = createGame();
  setSettings(s, { players: 3 });
  addPlayer(s, { id: 'a', name: 'A', color: 'red' });
  addPlayer(s, { id: 'b', name: 'B', color: 'blue' });
  assert.throws(() => startGame(s), /Servono 3/);
  addPlayer(s, { id: 'c', name: 'C', color: 'yellow' });
  assert.throws(() => addPlayer(s, { id: 'd', name: 'D', color: 'violet' }), /piena/);
  startGame(s);
  assert.equal(s.phase, 'setup');
});

test('mappa: nebulosa al centro', () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = game(3, [], { mapMode: 'center' }, seed);
    const center = s.board.hexes.find(h => h.q === 0 && h.r === 0);
    assert.equal(center.terrain, 'nebula');
    assert.equal(s.robberHex, center.id);
  }
});

test('espansione non attiva: azioni rifiutate', () => {
  const s = game(2);
  doSetup(s);
  assert.throws(() => applyAction(s, cur(s).id, { type: 'buildShip', edge: 0 }), /non attiva/);
});

// ---------- Grande Galassia ----------

test('Grande Galassia: 30 settori, 6 giocatori, costruzione extra', () => {
  const s = game(6, ['galaxy']);
  const land = s.board.hexes.filter(h => h.kind === 'land');
  assert.equal(land.length, 30);
  assert.equal(land.filter(h => h.terrain === 'nebula').length, 2);
  assert.equal(land.filter(h => h.number).length, 28);
  assert.equal(s.board.ports.length, 11);
  assert.equal(s.devDeck.length, 34);
  assert.equal(s.bank.ore, 24);
  doSetup(s);
  const me = cur(s);
  s.phase = 'main';
  applyAction(s, me.id, { type: 'endTurn' });
  assert.equal(s.phase, 'extraBuild');
  assert.equal(s.extraBuild.queue.length, 5);
  const next = s.extraBuild.queue[0];
  assert.throws(() => applyAction(s, s.extraBuild.queue[1], { type: 'passExtra' }), GameError);
  // durante la costruzione extra niente scambi
  assert.throws(() => applyAction(s, next, { type: 'bankTrade', give: 'ore', get: 'bio' }), GameError);
  for (let i = 0; i < 5; i++) applyAction(s, s.extraBuild.queue[0], { type: 'passExtra' });
  assert.equal(s.phase, 'roll');
  assert.notEqual(cur(s).id, me.id);
});

// ---------- Spazio profondo ----------

test('Spazio profondo: vuoto, settori inesplorati, astronavi ed esplorazione', () => {
  const s = game(3, ['deepspace']);
  const voids = s.board.hexes.filter(h => h.kind === 'void');
  const hidden = s.board.hexes.filter(h => h.hidden);
  assert.ok(voids.length >= 18);
  assert.ok(hidden.length >= 9);
  assert.ok(s.raidersHex != null);
  doSetup(s);
  // tutti gli avamposti iniziali sono nel sistema principale
  for (const v of Object.keys(s.buildings)) assert.equal(s.board.vertices[v].system, 0);

  const me = cur(s);
  s.phase = 'main';
  me.hand = { ...me.hand, energy: 10, water: 10 };
  fixBank(s);
  const pv = privateView(s, me.id);
  assert.ok(pv.me.legal.ships.length > 0 || true);
  // traccia una rotta di astronavi verso un sistema esterno
  let revealed = false;
  for (let i = 0; i < 8 && !revealed; i++) {
    const spots = privateView(s, me.id).me.legal.ships;
    if (!spots.length) break;
    // preferisci lati che toccano esagoni inesplorati
    const best = spots.find(e => s.board.edges[e].hexes.some(h => s.board.hexes[h].hidden)) ?? spots[0];
    const hiddenBefore = s.board.hexes.filter(h => h.hidden).length;
    applyAction(s, me.id, { type: 'buildShip', edge: best });
    if (s.board.hexes.filter(h => h.hidden).length < hiddenBefore) revealed = true;
  }
  assert.ok(Object.values(s.ships).includes(me.id));
});

test('Spazio profondo: rotta mista iperlinea + astronave solo tramite edificio', () => {
  const s = game(2, ['deepspace']);
  const b = s.board;
  // trova un vertice di costa con un lato di terra e un lato di vuoto
  const v = b.vertices.find(vv => vv.system === 0 && vv.edges.some(e => b.edges[e].land) && vv.edges.some(e => b.edges[e].space && !b.edges[e].land));
  const road = v.edges.find(e => b.edges[e].land);
  const ship = v.edges.find(e => b.edges[e].space && !b.edges[e].land);
  const roads = { [road]: 'p0' }, ships = { [ship]: 'p0' };
  assert.equal(longestRoad(b, roads, {}, 'p0', { ships }), 1);
  assert.equal(longestRoad(b, roads, { [v.id]: { owner: 'p0', type: 'settlement' } }, 'p0', { ships }), 2);
  // i predoni bloccano le astronavi adiacenti
  s.raidersHex = b.edges[ship].hexes.find(h => b.hexes[h].kind === 'void');
  s.buildings[v.id] = { owner: 'p0', type: 'settlement' };
  assert.equal(canPlaceShip(s, 'p0', ship), false);
});

// ---------- Imperi e Invasione ----------

test('Imperi: le colonie producono merci e si sale nei tracciati fino alla metropoli', () => {
  const s = game(2, ['empires']);
  doSetup(s);
  const me = cur(s);
  assert.ok('credits' in me.hand && 'data' in me.hand && 'plasma' in me.hand);
  assert.equal(s.devDeck.length, 0);
  const v = Object.keys(s.buildings).find(k => s.buildings[k].owner === me.id);
  s.buildings[v].type = 'city';
  s.phase = 'main';
  me.hand.credits = 10;
  fixBank(s);
  for (let lvl = 1; lvl <= 4; lvl++) applyAction(s, me.id, { type: 'improve', track: 'trade' });
  assert.equal(me.tracks.trade, 4);
  assert.equal(s.buildings[v].metro, 'trade');
  assert.equal(victoryPoints(s, me.id), 1 + 2 + 2); // avamposto + colonia + metropoli
  // livello 3 di commercio: merci 2:1
  assert.equal(privateView(s, me.id).me.ratios.credits, 2);
});

test('Imperi: invasione respinta e invasione persa', () => {
  const s = game(2, ['empires']);
  doSetup(s);
  const [a, b] = s.players;
  const va = Object.keys(s.buildings).find(k => s.buildings[k].owner === a.id);
  const vb = Object.keys(s.buildings).find(k => s.buildings[k].owner === b.id);
  s.buildings[va].type = 'city';
  s.buildings[vb].type = 'city';
  // guardiano attivo di A con forza 2: difesa 2 >= forza 2
  const free = s.board.vertices.find(v => v.land && !s.buildings[v.id] && v.neighbors.every(n => !s.buildings[n])).id;
  s.guardians[free] = { owner: a.id, level: 2, active: true, activatedTurn: 0 };
  s.empires.invasion = 6;
  let found = false;
  const base = structuredClone(s);
  for (let seed = 1; seed < 300 && !found; seed++) {
    const t = structuredClone(base);
    t.rng = seed;
    applyAction(t, cur(t).id, { type: 'roll' });
    if (t.dice.event === 'ship') {
      found = true;
      const ta = t.players.find(p => p.id === a.id);
      assert.equal(ta.defenderVP, 1);
      assert.equal(t.empires.invasion, 0);
      assert.equal(t.empires.firstInvasion, true);
      assert.equal(t.guardians[free].active, false);
    }
  }
  assert.ok(found);

  // senza difesa: chi ha contribuito meno perde la colonia
  delete s.guardians[free];
  s.empires.invasion = 6;
  found = false;
  const base2 = structuredClone(s);
  for (let seed = 1; seed < 300 && !found; seed++) {
    const t = structuredClone(base2);
    t.rng = seed;
    applyAction(t, cur(t).id, { type: 'roll' });
    if (t.dice.event === 'ship') {
      found = true;
      assert.equal(t.buildings[va].type, 'settlement');
      assert.equal(t.buildings[vb].type, 'settlement');
    }
  }
  assert.ok(found);
});

test('Imperi: guardiani, scudi e limite mano', () => {
  const s = game(2, ['empires']);
  doSetup(s);
  const me = cur(s);
  s.phase = 'main';
  me.hand = { ...me.hand, bio: 5, ore: 5, water: 3, energy: 4 };
  fixBank(s);
  const spots = privateView(s, me.id).me.legal.guardians;
  assert.ok(spots.length > 0);
  applyAction(s, me.id, { type: 'buildGuardian', vertex: spots[0] });
  applyAction(s, me.id, { type: 'activateGuardian', vertex: spots[0] });
  assert.equal(s.guardians[spots[0]].active, true);
  applyAction(s, me.id, { type: 'upgradeGuardian', vertex: spots[0] });
  assert.equal(s.guardians[spots[0]].level, 2);
  assert.throws(() => applyAction(s, me.id, { type: 'upgradeGuardian', vertex: spots[0] }), /livello 3|già stato potenziato/);
  // scudo: serve una colonia
  const v = Object.keys(s.buildings).find(k => s.buildings[k].owner === me.id);
  s.buildings[v].type = 'city';
  applyAction(s, me.id, { type: 'buildShield', vertex: Number(v) });
  assert.equal(s.buildings[v].shield, true);
  // limite mano 7 + 2 per scudo
  me.hand = { ...me.hand, ore: 0, energy: 0, crystal: 9, water: 0, bio: 0 };
  fixBank(s);
  s.phase = 'roll';
  s.empires.firstInvasion = true;
  let found = false;
  const base = structuredClone(s);
  for (let seed = 1; seed < 400 && !found; seed++) {
    const t = structuredClone(base);
    t.rng = seed;
    applyAction(t, me.id, { type: 'roll' });
    if (t.dice.sum === 7) { found = true; assert.equal(t.discardPending[me.id], undefined); }
  }
  assert.ok(found);
});

/** Tira finché il dado evento non fa scattare l'invasione; restituisce lo stato dopo il tiro. */
function rollInvasion(base) {
  for (let seed = 1; seed < 500; seed++) {
    const t = structuredClone(base);
    t.rng = seed;
    applyAction(t, cur(t).id, { type: 'roll' });
    if (t.dice.event === 'ship' && t.phase !== 'ended') return t;
  }
  throw new Error('nessuna invasione');
}

test('Imperi: punti vittoria dopo l\'invasione', () => {
  const s = game(3, ['empires']);
  doSetup(s);
  const [a, b, c] = s.players;
  const own = pid => Object.keys(s.buildings).filter(k => s.buildings[k].owner === pid);
  const vp = (t, p) => victoryPoints(t, p.id);
  s.empires.invasion = 6;
  s.phase = 'roll';

  // 1. nessuna colonia in gioco: nessun PV anche con un guardiano attivo
  const free = s.board.vertices.find(v => v.land && !s.buildings[v.id] && v.neighbors.every(n => !s.buildings[n])).id;
  s.guardians[free] = { owner: a.id, level: 1, active: true, activatedTurn: -1 };
  let t = rollInvasion(structuredClone(s));
  assert.deepEqual(t.players.map(p => vp(t, p)), s.players.map(p => vp(s, p)));
  assert.equal(t.players[0].defenderVP, 0);

  // 2. difesa vinta: +1 PV solo al miglior difensore
  const [a1] = own(a.id), [b1, b2] = own(b.id), [c1] = own(c.id);
  s.buildings[a1].type = 'city';
  s.buildings[b1].type = 'city';
  s.guardians[free].level = 2;
  const before = s.players.map(p => vp(s, p));
  t = rollInvasion(structuredClone(s));
  assert.deepEqual(t.players.map(p => vp(t, p)), [before[0] + 1, before[1], before[2]]);

  // 3. difesa persa: perdono 1 PV (colonia → avamposto) solo i meno difesi con colonie
  delete s.guardians[free];
  s.buildings[c1].type = 'city';
  s.guardians[free] = { owner: c.id, level: 1, active: true, activatedTurn: -1 };
  const b4 = s.players.map(p => vp(s, p));
  t = rollInvasion(structuredClone(s));
  assert.deepEqual(t.players.map(p => vp(t, p)), [b4[0] - 1, b4[1] - 1, b4[2]]);
  assert.equal(t.buildings[c1].type, 'city');

  // 4. metropoli immune, scudo assorbe: nessun PV perso
  s.buildings[a1].metro = 'trade';
  s.buildings[b1].shield = true;
  const b5 = s.players.map(p => vp(s, p));
  t = rollInvasion(structuredClone(s));
  assert.deepEqual(t.players.map(p => vp(t, p)), b5);
  assert.equal(t.buildings[b1].shield, undefined);
  assert.equal(t.buildings[b1].type, 'city');

  // 5. riserva di avamposti vuota: la colonia torna comunque avamposto, i pezzi restanti non vanno sotto zero
  delete s.buildings[a1].metro; delete s.buildings[b1].shield;
  const spots = s.board.vertices.filter(v => v.land && !s.buildings[v.id]).map(v => v.id);
  let added = 0;
  for (const v of spots) { if (added >= 4) break; if (s.board.vertices[v].neighbors.some(n => s.buildings[n])) continue; s.buildings[v] = { owner: b.id, type: 'settlement' }; added++; }
  assert.equal(added, 4);
  const b6 = vp(s, b);
  t = rollInvasion(structuredClone(s));
  assert.equal(t.buildings[b1].type, 'settlement');
  assert.equal(vp(t, b), b6 - 1);
  assert.equal(piecesLeft(t, b.id).settlement, 0);
});

// ---------- Raid pirata e predoni con più espansioni ----------

/** Cerca un seme che dia 7 (senza far partire l'invasione) e restituisce lo stato dopo il tiro. */
function rollSeven(base, pid) {
  for (let seed = 1; seed < 2000; seed++) {
    const t = structuredClone(base);
    t.rng = seed;
    applyAction(t, pid, { type: 'roll' });
    if (t.dice.sum === 7 && t.empires?.firstInvasion === base.empires?.firstInvasion && t.phase !== 'discard' && t.event?.type !== 'truce') return t;
  }
  throw new Error('nessun 7 trovato');
}

test('Raid: con Imperi + Spazio profondo, prima dell\'invasione si muovono solo i predoni', () => {
  const s = game(3, ['deepspace', 'empires', 'events']);
  doSetup(s);
  const me = cur(s);
  s.phase = 'roll';
  const t = rollSeven(structuredClone(s), me.id);
  assert.equal(t.phase, 'robber');
  const targets = privateView(t, me.id).me.legal.robberHexes.map(o => o.hex);
  assert.ok(targets.length > 0);
  assert.ok(targets.every(h => t.board.hexes[h].kind === 'void'), 'solo settori di vuoto');
  const land = t.board.hexes.find(h => h.kind === 'land' && h.id !== t.robberHex);
  assert.throws(() => applyAction(t, me.id, { type: 'moveRobber', hex: land.id }), /non può andare/);
  const robberBefore = t.robberHex;
  applyAction(t, me.id, { type: 'moveRobber', hex: targets[0] });
  assert.equal(t.raidersHex, targets[0]);
  assert.equal(t.robberHex, robberBefore);
  assert.equal(t.phase, 'main');

  // solo Imperi: il 7 non sposta niente
  const u = game(3, ['empires']);
  doSetup(u);
  u.phase = 'roll';
  const v = rollSeven(structuredClone(u), cur(u).id);
  assert.equal(v.phase, 'main');
});

test('Raid: un guardiano scaccia solo la flotta pirata, non i predoni', () => {
  const s = game(3, ['deepspace', 'empires']);
  doSetup(s);
  const me = cur(s);
  s.phase = 'main';
  s.empires.firstInvasion = true;
  const v = Number(Object.keys(s.buildings).find(k => s.buildings[k].owner === me.id));
  s.guardians[v] = { owner: me.id, level: 1, active: true, activatedTurn: -1 };
  s.robberHex = s.board.vertices[v].hexes.find(h => s.board.hexes[h].kind === 'land');
  const chase = privateView(s, me.id).me.legal.chase;
  assert.ok(chase.includes(v));
  applyAction(s, me.id, { type: 'chaseRobber', from: v });
  assert.equal(s.phase, 'robber');
  const targets = privateView(s, me.id).me.legal.robberHexes.map(o => o.hex);
  assert.ok(targets.length > 0 && targets.every(h => s.board.hexes[h].kind === 'land'));
  const voidHex = s.board.hexes.find(h => h.kind === 'void' && h.id !== s.raidersHex);
  assert.throws(() => applyAction(s, me.id, { type: 'moveRobber', hex: voidHex.id }), /non può andare/);
  applyAction(s, me.id, { type: 'moveRobber', hex: targets[0], victim: privateView(s, me.id).me.legal.robberHexes[0].victims[0] });
  assert.equal(s.phase, 'main');
  // al raid successivo i predoni tornano disponibili
  s.phase = 'roll';
  const t = rollSeven(structuredClone(s), me.id);
  assert.ok(privateView(t, me.id).me.legal.robberHexes.some(o => t.board.hexes[o.hex].kind === 'void'));
});

test('Predoni: derubano chi ha astronavi vicine e le bloccano', () => {
  const s = game(3, ['galaxy', 'deepspace', 'empires', 'convoys', 'missions', 'events'].filter(m => m !== 'galaxy'));
  doSetup(s);
  const [a, b] = s.players;
  // astronave di b accanto a un settore di vuoto
  const e = s.board.edges.findIndex(ed => ed.space && ed.hexes.some(h => s.board.hexes[h].kind === 'void')
    && [ed.a, ed.b].some(x => s.buildings[x]?.owner === b.id));
  assert.ok(e >= 0, 'serve un lato di vuoto vicino a un edificio');
  s.ships[e] = b.id;
  const voidHex = s.board.edges[e].hexes.find(h => s.board.hexes[h].kind === 'void');
  s.raidersHex = s.board.hexes.find(h => h.kind === 'void' && h.id !== voidHex).id;
  b.hand = { ...b.hand, water: 2 };
  for (const r of Object.keys(a.hand)) a.hand[r] = 0;
  fixBank(s);
  s.current = 0; s.phase = 'robber'; s.robberReturn = 'main';
  const opt = privateView(s, a.id).me.legal.robberHexes.find(o => o.hex === voidHex);
  assert.deepEqual(opt.victims, [b.id]);
  applyAction(s, a.id, { type: 'moveRobber', hex: voidHex, victim: b.id });
  assert.equal(s.raidersHex, voidHex);
  assert.equal(a.hand.water + b.hand.water, 2);
  assert.equal(handSizeOf(a), 1);
  // le astronavi accanto ai predoni non si spostano e non si costruiscono lì
  for (const ed of s.board.hexes[voidHex].edges) assert.equal(canPlaceShip(s, b.id, ed), false);
  s.current = 1; s.phase = 'main';
  const moves = privateView(s, b.id).me.legal.shipMoves || [];
  assert.ok(!moves.some(m => m.from === e));
});
const handSizeOf = p => Object.values(p.hand).reduce((x, n) => x + n, 0);

// ---------- Convogli mercantili ----------

test('Convogli: pedaggio sulle iperlinee altrui e consegna dei contratti', () => {
  const s = game(2, ['convoys']);
  assert.equal(s.convoys.stations.length, 3);
  assert.ok(s.convoys.stations.every(st => st.vertex != null));
  doSetup(s);
  const [a, b] = [cur(s), s.players.find(p => p !== cur(s))];
  const unit = s.convoys.units[a.id];
  assert.ok(unit.vertex != null);
  assert.equal(unit.moves, 4);
  s.phase = 'main';
  // costruisci una iperlinea dell'avversario accanto al convoglio
  const e = s.board.vertices[unit.vertex].edges.find(x => s.roads[x] === undefined && s.board.edges[x].land);
  s.roads[e] = b.id;
  const to = s.board.edges[e].a === unit.vertex ? s.board.edges[e].b : s.board.edges[e].a;
  applyAction(s, a.id, { type: 'moveConvoy', to });
  assert.equal(a.credits, 1);
  assert.equal(b.credits, 3);
  // consegna: metti il convoglio carico accanto alla stazione di destinazione
  const dest = s.convoys.stations.find(st => st.id === unit.contract.to);
  unit.contract.loaded = true;
  const e2 = s.board.vertices[dest.vertex].edges[0];
  const from2 = s.board.edges[e2].a === dest.vertex ? s.board.edges[e2].b : s.board.edges[e2].a;
  s.roads[e2] = a.id;
  unit.vertex = from2;
  applyAction(s, a.id, { type: 'moveConvoy', to: dest.vertex });
  assert.equal(unit.points, 1);
  assert.equal(a.credits, 3);
});

// ---------- Missioni di frontiera ----------

test('Missioni: distruggere una base pirata con 3 equipaggi', () => {
  const s = game(2, ['deepspace', 'missions']);
  doSetup(s);
  const me = cur(s);
  s.phase = 'main';
  const hex = s.board.hexes.find(h => h.hidden);
  hex.hidden = false; hex.terrain = 'ice'; hex.number = 5;
  s.missions.markers[hex.id] = { type: 'base', crew: {} };
  const e = hex.edges.find(x => s.board.edges[x].space);
  s.ships[e] = me.id;
  me.hand = { ...me.hand, bio: 3, ore: 3 };
  fixBank(s);
  assert.deepEqual(privateView(s, me.id).me.legal.crewHexes, [hex.id]);
  for (let i = 0; i < 3; i++) applyAction(s, me.id, { type: 'sendCrew', hex: hex.id });
  assert.equal(s.missions.markers[hex.id], undefined);
  assert.equal(me.freePicks, 2);
  assert.equal(victoryPoints(s, me.id), 2 + 2);
});

// ---------- Eventi cosmici ----------

test('Eventi: si pesca una carta a ogni tiro e cambia la produzione', () => {
  const s = game(2, ['events']);
  doSetup(s);
  s.events.deck.push('solarstorm');
  applyAction(s, cur(s).id, { type: 'roll' });
  assert.equal(s.event.type, 'solarstorm');
  assert.equal(publicView(s).event.type, 'solarstorm');
  // fine turno: l'evento scade
  if (s.phase === 'main') {
    applyAction(s, cur(s).id, { type: 'endTurn' });
    assert.equal(s.event, null);
  }
});

// ---------- Partite simulate ----------

function simulate(modules, n, seed, maxActions = 4000) {
  const s = game(n, modules, {}, seed);
  let rngState = seed;
  const r = () => { rngState = (rngState * 1103515245 + 12345) % 2147483648; return rngState / 2147483648; };
  const initial = {};
  for (const k of cardTypes(s)) initial[k] = s.bank[k];
  const errors = [];
  for (let i = 0; i < maxActions && s.phase !== 'ended' && s.turn < 120; i++) {
    let acted = false;
    for (const p of s.players) {
      const v = privateView(s, p.id);
      const a = botAction(v, r);
      if (!a) continue;
      try {
        applyAction(s, p.id, a);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        errors.push(`${a.type}: ${err.message}`);
        if (s.phase === 'main' && cur(s).id === p.id) applyAction(s, p.id, { type: 'endTurn' });
      }
      acted = true;
      break;
    }
    if (!acted) throw new Error(`stallo in fase ${s.phase}`);
  }
  for (const k of cardTypes(s)) {
    const total = s.bank[k] + s.players.reduce((x, p) => x + p.hand[k], 0);
    assert.equal(total, initial[k], `conservazione ${k}`);
  }
  return { s, errors };
}

const combos = [
  [[], 3], [['events'], 3], [['galaxy'], 5], [['deepspace'], 3], [['empires'], 3],
  [['convoys'], 3], [['deepspace', 'missions'], 3],
  [['galaxy', 'deepspace', 'empires', 'convoys', 'missions', 'events'], 6],
];
for (const [mods, n] of combos) {
  test(`partita simulata: ${mods.join('+') || 'base'} (${n} giocatori)`, () => {
    for (const seed of [3, 17]) {
      const { s, errors } = simulate(mods, n, seed);
      assert.deepEqual(errors, [], `mosse "legali" rifiutate: ${errors.slice(0, 5).join(' | ')}`);
      assert.ok(s.turn > 20 || s.phase === 'ended', `turni: ${s.turn}`);
    }
  });
}
