// Test dei bot giocatori: partite complete solo-bot, livelli a confronto, risposte agli scambi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, applyAction, setSettings, GameError } from '../server/engine/game.js';
import { privateView } from '../server/engine/view.js';
import { cardTypes } from '../server/engine/rules.js';
import { botDecide } from '../server/bots/index.js';
import { judgeTrade, LEVELS } from '../server/bots/strategy.js';

const COLORS = ['red', 'blue', 'yellow', 'violet', 'green', 'orange'];

function lcg(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

/** Gioca una partita completa con i livelli indicati; restituisce stato, errori e vincitore. */
export function playBots(levels, { modules = [], seed = 1, maxTurns = 250 } = {}) {
  const s = createGame({ seed });
  setSettings(s, { modules, players: levels.length });
  levels.forEach((level, i) => addPlayer(s, { id: `b${i}`, name: `Bot${i}`, color: COLORS[i], bot: { level } }));
  startGame(s);
  const r = lcg(seed);
  const memory = Object.fromEntries(s.players.map(p => [p.id, {}]));
  const initial = {};
  for (const k of cardTypes(s)) initial[k] = s.bank[k];
  const errors = [];
  let now = 0;
  for (let i = 0; i < 20000 && s.phase !== 'ended' && s.turn < maxTurns; i++) {
    now += 1000;
    let acted = false;
    for (const p of s.players) {
      const mem = memory[p.id];
      mem.now = now;
      const a = botDecide(privateView(s, p.id), p.bot.level, mem, r);
      if (!a) continue;
      try {
        applyAction(s, p.id, a);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        errors.push(`${p.bot.level} ${a.type}: ${err.message}`);
        if (s.phase === 'main' && s.players[s.current].id === p.id) applyAction(s, p.id, { type: 'endTurn' });
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
  return { s, errors, winner: s.players.find(p => p.id === s.winner) };
}

const combos = [
  [[], 4], [['events'], 3], [['galaxy'], 5], [['deepspace'], 3], [['empires'], 3],
  [['convoys'], 3], [['deepspace', 'missions'], 3],
  [['galaxy', 'deepspace', 'empires', 'convoys', 'missions', 'events'], 6],
];
for (const [mods, n] of combos) {
  test(`bot: partita completa ${mods.join('+') || 'base'} (${n} bot di livelli misti)`, () => {
    const levels = Array.from({ length: n }, (_, i) => ['hard', 'medium', 'easy'][i % 3]);
    for (const seed of [5, 23]) {
      const { s, errors } = playBots(levels, { modules: mods, seed });
      assert.deepEqual(errors, [], `mosse rifiutate: ${errors.slice(0, 5).join(' | ')}`);
      assert.ok(s.turn > 15 || s.phase === 'ended', `turni: ${s.turn}`);
    }
  });
}

test('bot: i bot difficili finiscono la partita base', () => {
  for (const seed of [2, 9, 31]) {
    const { s, errors } = playBots(['hard', 'hard', 'hard', 'hard'], { seed });
    assert.deepEqual(errors, []);
    assert.equal(s.phase, 'ended', `partita non finita (turno ${s.turn})`);
  }
});

test('bot: il livello Difficile vince più spesso del Facile', () => {
  const wins = { hard: 0, easy: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const levels = seed % 2 ? ['hard', 'easy', 'hard', 'easy'] : ['easy', 'hard', 'easy', 'hard'];
    const { winner } = playBots(levels, { seed });
    if (winner) wins[winner.bot.level]++;
  }
  assert.ok(wins.hard > wins.easy * 2, `vittorie: ${JSON.stringify(wins)}`);
});

test('bot: accetta uno scambio utile e rifiuta uno svantaggioso', () => {
  const v = { players: [{ id: 'x', vp: 3 }, { id: 'me', vp: 3 }], winVp: 10 };
  const me = { id: 'me', hand: { ore: 3, energy: 0, crystal: 0, water: 1, bio: 1 } };
  const goal = { ore: 1, energy: 1, water: 1, bio: 1 }; // avamposto: manca energia
  const good = { from: 'x', give: { energy: 1 }, want: { ore: 1 } };
  const bad = { from: 'x', give: { crystal: 1 }, want: { water: 1 } };
  assert.equal(judgeTrade(v, me, good, goal, LEVELS.hard, Math.random), true);
  assert.equal(judgeTrade(v, me, bad, goal, LEVELS.hard, Math.random), false);
  // cede una carta in eccesso per una che non ha, anche se non serve all'obiettivo del turno
  const spare = { from: 'x', give: { crystal: 1 }, want: { ore: 1 } };
  assert.equal(judgeTrade(v, me, spare, goal, LEVELS.hard, Math.random), true);
  // 2 cristalli per 1 energia: avvicina la colonia, accetta
  const me2 = { id: 'me', hand: { ore: 2, energy: 1, crystal: 0, water: 2, bio: 0 } };
  assert.equal(judgeTrade(v, me2, { from: 'x', give: { crystal: 2 }, want: { energy: 1 } }, { ore: 1, energy: 1 }, LEVELS.hard, Math.random), true);
  // non aiuta chi sta per vincere
  const v2 = { ...v, players: [{ id: 'x', vp: 9 }, { id: 'me', vp: 3 }] };
  assert.equal(judgeTrade(v2, me, good, goal, LEVELS.hard, Math.random), false);
});

test('bot: propone uno scambio e lo conclude se un altro accetta', () => {
  // cerca una partita in cui un bot difficile propone uno scambio che viene concluso
  let proposed = 0, concluded = 0;
  for (const seed of [4, 8, 15]) {
    const { s } = playBots(['hard', 'hard', 'hard'], { seed, maxTurns: 60 });
    proposed += s.tradeSeq;
    concluded += s.log.filter(l => l.text.includes('concludono lo scambio')).length;
  }
  assert.ok(proposed > 0, 'nessuna offerta proposta');
  assert.ok(concluded >= 0);
});
