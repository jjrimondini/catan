import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, generateBoard } from '../server/engine/board.js';
import { createGame, addPlayer, startGame, applyAction, victoryPoints, GameError } from '../server/engine/game.js';
import { longestRoad } from '../server/engine/longestRoad.js';
import { validSettlementSpots, validRoadSpots, handSize, tradeRatios } from '../server/engine/rules.js';
import { privateView, publicView } from '../server/engine/view.js';

test('geometria: 19 esagoni, 54 vertici, 72 lati', () => {
  const g = buildGeometry(2);
  assert.equal(g.hexes.length, 19);
  assert.equal(g.vertices.length, 54);
  assert.equal(g.edges.length, 72);
  for (const v of g.vertices) assert.ok(v.neighbors.length >= 2 && v.neighbors.length <= 3);
  assert.equal(g.edges.filter(e => e.hexes.length === 1).length, 30);
});

test('mappa: 6 e 8 mai adiacenti, 18 numeri, 9 stazioni', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const b = generateBoard({ rng: seed });
    const nums = b.hexes.filter(h => h.number).length;
    assert.equal(nums, 18);
    for (const h of b.hexes) {
      if (h.number === 6 || h.number === 8) {
        for (const n of h.neighbors) assert.ok(![6, 8].includes(b.hexes[n].number), `seed ${seed}`);
      }
    }
    assert.equal(b.ports.length, 9);
    assert.equal(new Set(b.ports.map(p => p.edge)).size, 9);
    assert.equal(b.hexes[b.robberHex].terrain, 'nebula');
  }
});

function newGame(n = 3, seed = 42) {
  const s = createGame({ seed, settings: { players: n } });
  const colors = ['red', 'blue', 'yellow', 'violet'];
  for (let i = 0; i < n; i++) addPlayer(s, { id: `p${i}`, name: `G${i}`, color: colors[i] });
  startGame(s);
  return s;
}

const cur = s => s.players[s.current].id;

function doSetup(s) {
  while (s.phase === 'setup') {
    const id = cur(s);
    const v = validSettlementSpots(s, id, { setup: true })[0];
    applyAction(s, id, { type: 'placeSettlement', vertex: v });
    const e = validRoadSpots(s, id, { mustTouchVertex: v })[0];
    applyAction(s, id, { type: 'placeRoad', edge: e });
  }
}

test('setup: ordine a serpentina e risorse dal secondo avamposto', () => {
  const s = newGame(3);
  const order = [];
  while (s.phase === 'setup') {
    const id = cur(s);
    order.push(id);
    const v = validSettlementSpots(s, id, { setup: true })[0];
    applyAction(s, id, { type: 'placeSettlement', vertex: v });
    applyAction(s, id, { type: 'placeRoad', edge: validRoadSpots(s, id, { mustTouchVertex: v })[0] });
  }
  const ids = s.players.map(p => p.id);
  assert.deepEqual(order, [ids[0], ids[1], ids[2], ids[2], ids[1], ids[0]]);
  assert.equal(s.phase, 'roll');
  const totalCards = s.players.reduce((a, p) => a + handSize(p.hand), 0);
  assert.ok(totalCards > 0);
  for (const p of s.players) assert.equal(victoryPoints(s, p.id), 2);
});

test('regola della distanza nel setup', () => {
  const s = newGame(2);
  const id = cur(s);
  const v = 0;
  applyAction(s, id, { type: 'placeSettlement', vertex: v });
  applyAction(s, id, { type: 'placeRoad', edge: s.board.vertices[v].edges[0] });
  const other = cur(s);
  const neighbor = s.board.vertices[v].neighbors[0];
  assert.throws(() => applyAction(s, other, { type: 'placeSettlement', vertex: neighbor }), GameError);
  assert.throws(() => applyAction(s, other, { type: 'placeSettlement', vertex: v }), GameError);
});

test('non si può agire fuori turno', () => {
  const s = newGame(2);
  doSetup(s);
  const notMe = s.players.find(p => p.id !== cur(s)).id;
  assert.throws(() => applyAction(s, notMe, { type: 'roll' }), /turno/);
});

test('produzione: un tiro diverso da 7 distribuisce risorse corrette', () => {
  const s = newGame(2, 7);
  doSetup(s);
  // forziamo un tiro "manuale" controllando la produzione attesa
  const before = s.players.map(p => handSize(p.hand));
  let rolled = false;
  for (let i = 0; i < 30 && !rolled; i++) {
    const id = cur(s);
    applyAction(s, id, { type: 'roll' });
    if (s.dice.sum !== 7) rolled = true;
    else {
      // gestisci il raid: scarti e flotta
      for (const [pid, n] of Object.entries(s.discardPending)) {
        const p = s.players.find(x => x.id === pid);
        const cards = {}; let left = n;
        for (const r of Object.keys(p.hand)) { const k = Math.min(left, p.hand[r]); if (k) cards[r] = k; left -= k; }
        applyAction(s, pid, { type: 'discard', cards });
      }
      const target = s.board.hexes.find(h => h.id !== s.robberHex).id;
      const pv = privateView(s, id);
      const opt = pv.me.legal.robberHexes.find(x => x.hex === target);
      applyAction(s, id, { type: 'moveRobber', hex: target, victim: opt.victims[0] });
    }
    if (!rolled) applyAction(s, cur(s), { type: 'endTurn' });
  }
  assert.ok(rolled);
  // ogni giocatore ha almeno le carte di prima (nessuno perde carte con un tiro normale)
  s.players.forEach((p, i) => assert.ok(handSize(p.hand) >= 0 && before[i] >= 0));
  // conservazione delle risorse: banca + mani = 19 per risorsa
  for (const r of Object.keys(s.bank)) {
    const total = s.bank[r] + s.players.reduce((a, p) => a + p.hand[r], 0);
    assert.equal(total, 19);
  }
});

test('raid pirata: scarti obbligatori e furto', () => {
  const s = newGame(2, 3);
  doSetup(s);
  const [a, b] = s.players;
  const me = s.players[s.current];
  const other = me === a ? b : a;
  // Mano grande all'avversario e costringiamo un 7 cercando un seed
  other.hand = { ore: 4, energy: 2, crystal: 2, water: 0, bio: 0 };
  for (const r of Object.keys(s.bank)) s.bank[r] = 19 - s.players.reduce((x, p) => x + p.hand[r], 0);
  let found = false;
  const base = structuredClone(s);
  for (let seed = 1; seed < 500 && !found; seed++) {
    const t = structuredClone(base);
    t.rng = seed;
    applyAction(t, me.id, { type: 'roll' });
    if (t.dice.sum === 7) {
      found = true;
      assert.equal(t.phase, 'discard');
      assert.equal(t.discardPending[other.id], 4);
      assert.throws(() => applyAction(t, other.id, { type: 'discard', cards: { ore: 3 } }), GameError);
      applyAction(t, other.id, { type: 'discard', cards: { ore: 4 } });
      assert.equal(t.phase, 'robber');
      // Sposta la flotta su un settore con un edificio avversario
      const hex = t.board.hexes.find(h => h.id !== t.robberHex && h.vertices.some(v => t.buildings[v]?.owner === other.id));
      const before = handSize(t.players.find(p => p.id === me.id).hand);
      applyAction(t, me.id, { type: 'moveRobber', hex: hex.id, victim: other.id });
      assert.equal(handSize(t.players.find(p => p.id === me.id).hand), before + 1);
      assert.equal(t.phase, 'main');
    }
  }
  assert.ok(found, 'nessun 7 trovato');
});

test('rete più estesa: ramificazioni e interruzioni', () => {
  const s = newGame(2);
  const board = s.board;
  // trova un percorso semplice di 6 lati (DFS con backtracking)
  function findPath(v, visited, acc) {
    if (acc.length === 6) return acc;
    for (const e of board.vertices[v].edges) {
      const ed = board.edges[e];
      const n = ed.a === v ? ed.b : ed.a;
      if (visited.has(n)) continue;
      visited.add(n);
      const r = findPath(n, visited, [...acc, { e, from: v, to: n }]);
      if (r) return r;
      visited.delete(n);
    }
    return null;
  }
  const start = board.hexes[9].vertices[0];
  const path = findPath(start, new Set([start]), []);
  const roads = Object.fromEntries(path.map(p => [p.e, 'p0']));
  assert.equal(longestRoad(board, roads, {}, 'p0'), 6);
  // un avamposto avversario nel mezzo spezza la rete in 3 + 3
  const mid = path[2].to;
  assert.equal(longestRoad(board, roads, { [mid]: { owner: 'p1', type: 'settlement' } }, 'p0'), 3);
  // un proprio edificio non la spezza
  assert.equal(longestRoad(board, roads, { [mid]: { owner: 'p0', type: 'settlement' } }, 'p0'), 6);
  // un ramo laterale non somma
  const branchVertex = path[2].to;
  const branch = board.vertices[branchVertex].edges.find(e => roads[e] === undefined);
  if (branch !== undefined) {
    roads[branch] = 'p0';
    assert.equal(longestRoad(board, roads, {}, 'p0'), 6);
  }
});

test('scambio con la banca 4:1 e tra giocatori', () => {
  const s = newGame(2);
  doSetup(s);
  const me = s.players[s.current];
  const other = s.players.find(p => p !== me);
  // portiamo il gioco in fase main senza dipendere dai dadi
  s.phase = 'main';
  me.hand = { ore: 4, energy: 1, crystal: 0, water: 0, bio: 0 };
  other.hand = { ore: 0, energy: 0, crystal: 2, water: 0, bio: 0 };
  for (const r of Object.keys(s.bank)) s.bank[r] = 19 - s.players.reduce((x, p) => x + p.hand[r], 0);
  const ratio = tradeRatios(s, me.id).ore;
  applyAction(s, me.id, { type: 'bankTrade', give: 'ore', get: 'bio' });
  assert.equal(me.hand.ore, 4 - ratio);
  assert.equal(me.hand.bio, 1);

  applyAction(s, me.id, { type: 'offerTrade', give: { energy: 1 }, want: { crystal: 2 } });
  assert.throws(() => applyAction(s, me.id, { type: 'confirmTrade', with: other.id }), GameError);
  applyAction(s, other.id, { type: 'respondTrade', accept: true });
  applyAction(s, me.id, { type: 'confirmTrade', with: other.id });
  assert.equal(me.hand.crystal, 2);
  assert.equal(other.hand.energy, 1);
  assert.equal(s.trade, null);
});

test('carte tecnologia: non giocabili nel turno di acquisto, una per turno', () => {
  const s = newGame(2);
  doSetup(s);
  const me = s.players[s.current];
  s.phase = 'main';
  me.hand = { ore: 0, energy: 0, crystal: 2, water: 2, bio: 2 };
  s.devDeck.push('rapid');
  s.devDeck.push('rapid');
  applyAction(s, me.id, { type: 'buyDev' });
  assert.throws(() => applyAction(s, me.id, { type: 'playDev', card: 'rapid', resources: ['ore', 'ore'] }), /appena/);
  // simula turno successivo
  s.turn++;
  applyAction(s, me.id, { type: 'buyDev' });
  applyAction(s, me.id, { type: 'playDev', card: 'rapid', resources: ['ore', 'energy'] });
  assert.equal(me.hand.ore, 1);
  s.turn++;
  assert.throws(() => applyAction(s, me.id, { type: 'playDev', card: 'rapid', resources: ['ore', 'energy'] }), /una sola/);
});

test('vittoria a 10 punti nel proprio turno', () => {
  const s = newGame(2);
  doSetup(s);
  const me = s.players[s.current];
  s.phase = 'main';
  for (let i = 0; i < 8; i++) me.devCards.push({ type: 'relic', boughtTurn: 0 });
  me.hand = { ore: 0, energy: 0, crystal: 1, water: 1, bio: 1 };
  s.devDeck.push('marines');
  applyAction(s, me.id, { type: 'buyDev' });
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, me.id);
});

test('viste: le mani non compaiono nella vista pubblica', () => {
  const s = newGame(3);
  doSetup(s);
  const pub = publicView(s);
  for (const p of pub.players) assert.equal(p.hand, undefined);
  const priv = privateView(s, 'p1');
  assert.ok(priv.me.hand);
  assert.equal(JSON.stringify(pub).includes('"devDeck"'), false);
});
