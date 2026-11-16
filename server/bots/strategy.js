// Bot strategico (livelli "Medio" e "Difficile"). Lavora solo sulla vista privata del giocatore,
// quindi non vede mai le mani degli altri: gioca con le stesse informazioni di un umano.
//
// Idea di base: a ogni turno sceglie un obiettivo (colonia, avamposto, iperlinea verso un buon
// incrocio, carta tecnologia), poi costruisce, scambia con la banca o propone scambi per raggiungerlo.
import { RESOURCES, TERRAIN_RES, COSTS } from '../../public/shared/constants.js';
import { buildableVertex, vertexFree, networkVertices, blockedFor, canAfford } from '../engine/rules.js';
import { botAction as easyAction, moduleOptions } from './easy.js';

const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const LEVELS = {
  medium: { noise: 2.5, randomRate: 0.2, maxOffers: 1, tradeTimeout: 15000, moduleActions: 3 },
  hard:   { noise: 0,   randomRate: 0,   maxOffers: 2, tradeTimeout: 20000, moduleActions: 5 },
};

// ---------- Valutazioni ----------

function production(v, pid) {
  const prod = Object.fromEntries(RESOURCES.map(r => [r, 0]));
  for (const [vid, b] of Object.entries(v.buildings)) {
    if (b.owner !== pid) continue;
    for (const h of v.board.vertices[vid].hexes) {
      const hex = v.board.hexes[h];
      const res = TERRAIN_RES[hex.terrain];
      if (!res || !hex.number || h === v.robberHex) continue;
      prod[res] += PIPS[hex.number] * (b.type === 'city' ? 2 : 1);
    }
  }
  return prod;
}

function vertexScore(v, vid, prod) {
  let s = 0;
  const kinds = new Set();
  for (const h of v.board.vertices[vid].hexes) {
    const hex = v.board.hexes[h];
    const res = TERRAIN_RES[hex.terrain];
    if (!res || !hex.number) continue;
    let p = PIPS[hex.number];
    if (h === v.robberHex) p *= 0.5;
    s += p * (prod[res] < 3 ? 1.3 : 1);
    kinds.add(res);
  }
  s += kinds.size * 1.2;
  for (const port of v.board.ports || []) {
    if (!port.vertices.includes(vid)) continue;
    s += port.type === 'any' ? 1.5 : (prod[port.type] >= 5 ? 3 : 0.8);
  }
  return s;
}

const missingFor = (hand, cost) => Object.entries(cost || {}).reduce((t, [r, n]) => t + Math.max(0, n - (hand[r] || 0)), 0);
const missingList = (hand, cost) => Object.entries(cost || {}).flatMap(([r, n]) => Array(Math.max(0, n - (hand[r] || 0))).fill(r));
const surplusOf = (hand, cost, r) => (hand[r] || 0) - ((cost || {})[r] || 0);

/** Distanze (in lati percorribili) da un vertice bersaglio, evitando pezzi avversari. */
function distancesFrom(v, pid, target, maxDepth = 4) {
  const dist = new Map([[target, 0]]);
  const queue = [target];
  while (queue.length) {
    const x = queue.shift();
    const d = dist.get(x);
    if (d >= maxDepth) continue;
    for (const e of v.board.vertices[x].edges) {
      const edge = v.board.edges[e];
      if (!edge.land) continue;
      if (v.roads[e] !== undefined && v.roads[e] !== pid) continue;
      const y = edge.a === x ? edge.b : edge.a;
      if (dist.has(y) || blockedFor(v, y, pid)) continue;
      dist.set(y, d + 1);
      queue.push(y);
    }
  }
  return dist;
}

/** I migliori incroci liberi vicini alla propria rete, con la distanza dalla rete. */
function targetSpots(v, pid, prod) {
  const net = networkVertices(v, pid);
  const dist = new Map();
  const queue = [];
  for (const x of net) { dist.set(x, 0); queue.push(x); }
  while (queue.length) {
    const x = queue.shift();
    const d = dist.get(x);
    if (d >= 3) continue;
    for (const e of v.board.vertices[x].edges) {
      const edge = v.board.edges[e];
      if (!edge.land || (v.roads[e] !== undefined && v.roads[e] !== pid)) continue;
      const y = edge.a === x ? edge.b : edge.a;
      if (dist.has(y) || blockedFor(v, y, pid)) continue;
      dist.set(y, d + 1);
      queue.push(y);
    }
  }
  const spots = [];
  for (const [x, d] of dist) {
    if (!buildableVertex(v, x) || !vertexFree(v, x)) continue;
    spots.push({ vertex: x, dist: d, score: vertexScore(v, x, prod) - 1.6 * d });
  }
  return spots.sort((a, b) => b.score - a.score);
}

function bestRoad(v, pid, roads, target) {
  if (!roads?.length) return undefined;
  if (target == null) return roads[0];
  const dist = distancesFrom(v, pid, target);
  let best = roads[0], bestD = Infinity;
  for (const e of roads) {
    const ed = v.board.edges[e];
    const d = Math.min(dist.get(ed.a) ?? 99, dist.get(ed.b) ?? 99);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ---------- Obiettivo del turno ----------

function chooseGoal(v, ctx) {
  const { me, prod, cfg, r } = ctx;
  const jitter = () => (cfg.noise ? (r() - 0.5) * cfg.noise : 0);
  const spots = targetSpots(v, me.id, prod);
  const ready = spots.find(s => s.dist === 0);
  const far = spots.find(s => s.dist > 0);
  const mySettlements = Object.values(v.buildings).filter(b => b.owner === me.id && b.type === 'settlement').length;
  const opts = [];
  if (me.piecesLeft.city > 0 && mySettlements > 0) opts.push({ kind: 'city', cost: me.costs.city, score: missingFor(me.hand, me.costs.city) - 0.3 });
  if (me.piecesLeft.settlement > 0 && ready) opts.push({ kind: 'settlement', cost: me.costs.settlement, score: missingFor(me.hand, me.costs.settlement), target: ready.vertex });
  if (me.piecesLeft.settlement > 0 && me.piecesLeft.road > 0 && far && !ready) {
    opts.push({ kind: 'road', cost: me.costs.road, score: missingFor(me.hand, me.costs.road) + 1, target: far.vertex });
  }
  if (me.costs.dev && v.devDeckCount > 0 && !v.settings.modules.includes('empires')) {
    opts.push({ kind: 'dev', cost: me.costs.dev, score: missingFor(me.hand, me.costs.dev) + 1.5 });
  }
  if (!opts.length) return { kind: 'none', cost: {}, target: far?.vertex ?? ready?.vertex };
  for (const o of opts) o.score += jitter();
  opts.sort((a, b) => a.score - b.score);
  return { ...opts[0], spots };
}

// ---------- Azioni ----------

function chooseDiscard(me, n, goalCost) {
  const hand = { ...me.hand };
  const cards = {};
  for (let i = 0; i < n; i++) {
    let best = null, bestS = -Infinity;
    for (const [k, c] of Object.entries(hand)) {
      if (c <= 0) continue;
      const s = c - ((goalCost || {})[k] || 0) * 1.5;
      if (s > bestS) { bestS = s; best = k; }
    }
    hand[best]--;
    cards[best] = (cards[best] || 0) + 1;
  }
  return cards;
}

function chooseRobber(v, me, options) {
  const vp = Object.fromEntries(v.players.map(p => [p.id, p.vp]));
  const cards = Object.fromEntries(v.players.map(p => [p.id, p.cards]));
  const leader = Math.max(...v.players.filter(p => p.id !== me.id).map(p => p.vp));
  let best = options[0], bestS = -Infinity;
  for (const o of options) {
    const hex = v.board.hexes[o.hex];
    const pips = PIPS[hex.number] || 0;
    let s = 0;
    for (const vid of hex.vertices || []) {
      const b = v.buildings[vid];
      if (!b) continue;
      const mult = b.type === 'city' ? 2 : 1;
      if (b.owner === me.id) s -= 12 * mult * Math.max(1, pips);
      else s += pips * mult * (vp[b.owner] === leader ? 1.6 : 1);
    }
    if (o.victims.length) s += 3;
    if (o.hex === v.robberHex) s -= 100;
    if (s > bestS) { bestS = s; best = o; }
  }
  const victim = [...best.victims].sort((a, b) => (vp[b] - vp[a]) || (cards[b] - cards[a]))[0];
  return { type: 'moveRobber', hex: best.hex, victim };
}

/**
 * Valore di una mano: quanto è vicina a ciascuna costruzione (l'obiettivo del turno pesa di più),
 * più un piccolo valore per ogni carta (convertibile in banca secondo i propri porti),
 * meno il rischio di dover scartare con il pirata.
 */
const KIND_WEIGHT = { city: 1, settlement: 1, dev: 0.6, road: 0.4 };

function handUtility(hand, costs, goalCost, ratios = {}) {
  let u = 0;
  for (const [kind, cost] of Object.entries(costs)) {
    if (!cost) continue;
    const total = Object.values(cost).reduce((a, b) => a + b, 0);
    const have = Object.entries(cost).reduce((t, [k, n]) => t + Math.min(n, hand[k] || 0), 0);
    const w = (KIND_WEIGHT[kind] ?? 0.5) * (cost === goalCost ? 1.4 : 1);
    u += w * (have / total + (have === total ? 0.15 : 0));
  }
  let cards = 0;
  for (const [k, n] of Object.entries(hand)) {
    cards += n;
    u += n * (0.32 / (ratios[k] || 4)) + (n > 0 ? 0.04 : 0);
  }
  if (cards > 7) u -= (cards - 7) * 0.06;
  return u;
}

/** Risposta a un'offerta di un altro giocatore: accetta se la mano migliora. */
export function judgeTrade(v, me, trade, goalCost, cfg, r) {
  if (!canAfford(me.hand, trade.want)) return false;
  const from = v.players.find(p => p.id === trade.from);
  if (from && from.vp >= v.winVp - 2) return false; // non aiutare chi sta per vincere
  const costs = me.costs || { road: COSTS.road, settlement: COSTS.settlement, city: COSTS.city, dev: COSTS.dev };
  const goal = Object.values(costs).find(c => c && goalCost && JSON.stringify(c) === JSON.stringify(goalCost)) || null;
  const after = { ...me.hand };
  for (const [k, n] of Object.entries(trade.give)) after[k] = (after[k] || 0) + n;
  for (const [k, n] of Object.entries(trade.want)) after[k] -= n;
  let delta = handUtility(after, costs, goal, me.ratios) - handUtility(me.hand, costs, goal, me.ratios);
  // con chi è in testa si scambia solo se conviene parecchio
  const leaderVp = Math.max(...v.players.map(p => p.vp));
  const myVp = v.players.find(p => p.id === me.id)?.vp ?? 0;
  if (from && from.vp === leaderVp && from.vp >= myVp + 2) delta -= 0.05;
  if (cfg.noise) delta += (r() - 0.5) * 0.08;
  return delta > 0.005;
}

function playDevCard(v, ctx, goal) {
  const { me } = ctx;
  if (me.devPlayedThisTurn) return null;
  const playable = new Set(me.devCards.filter(c => c.playable).map(c => c.type));
  if (!playable.size) return null;
  const robberOnMe = (v.board.hexes[v.robberHex]?.vertices || []).some(x => v.buildings[x]?.owner === me.id);
  if (playable.has('marines') && (robberOnMe || (v.phase === 'main' && me.devCards.filter(c => c.type === 'marines').length >= 2))) {
    return { type: 'playDev', card: 'marines' };
  }
  if (v.phase !== 'main') return null;
  const miss = missingList(me.hand, goal.cost);
  if (playable.has('rapid') && miss.length >= 2) {
    const res = [miss[0], miss[1]];
    const need = {};
    for (const x of res) need[x] = (need[x] || 0) + 1;
    if (canAfford(v.bank, need)) return { type: 'playDev', card: 'rapid', resources: res };
  }
  if (playable.has('shortcut') && goal.kind === 'road' && me.legal.roads.length) return { type: 'playDev', card: 'shortcut' };
  if (playable.has('embargo') && miss.length) return { type: 'playDev', card: 'embargo', resource: miss[0] };
  return null;
}

function buildForGoal(v, ctx, goal) {
  const { me, prod } = ctx;
  const L = me.legal;
  const byScore = list => [...list].sort((a, b) => vertexScore(v, b, prod) - vertexScore(v, a, prod))[0];
  if (v.freeRoads > 0 && L.roads.length) return { type: 'buildRoad', edge: bestRoad(v, me.id, L.roads, goal.target ?? goal.spots?.[0]?.vertex) };
  if (goal.kind === 'city' && L.cities.length) return { type: 'buildCity', vertex: byScore(L.cities) };
  if (goal.kind === 'settlement' && L.settlements.length) return { type: 'buildSettlement', vertex: byScore(L.settlements) };
  if (goal.kind === 'road' && L.roads.length) return { type: 'buildRoad', edge: bestRoad(v, me.id, L.roads, goal.target) };
  if (goal.kind === 'dev' && me.canBuy.dev) return { type: 'buyDev' };
  // occasioni: punti vittoria subito
  if (L.cities.length) return { type: 'buildCity', vertex: byScore(L.cities) };
  if (L.settlements.length) return { type: 'buildSettlement', vertex: byScore(L.settlements) };
  return null;
}

function bankTradeForGoal(v, me, goal) {
  for (const want of missingList(me.hand, goal.cost)) {
    if (!(v.bank[want] > 0)) continue;
    let best = null;
    for (const [give, ratio] of Object.entries(me.ratios)) {
      if (give === want) continue;
      if (surplusOf(me.hand, goal.cost, give) < ratio) continue;
      if (!best || ratio < best.ratio) best = { give, ratio };
    }
    if (best) return { type: 'bankTrade', give: best.give, get: want };
  }
  return null;
}

function proposeTrade(v, ctx, goal) {
  const { me, cfg, memory } = ctx;
  if (v.event?.type === 'blackout' || memory.offers >= cfg.maxOffers) return null;
  const miss = missingList(me.hand, goal.cost);
  if (!miss.length || miss.length > 2) return null;
  const want = miss[0];
  const spare = Object.keys(me.hand)
    .filter(k => k !== want && surplusOf(me.hand, goal.cost, k) >= 1)
    .sort((a, b) => surplusOf(me.hand, goal.cost, b) - surplusOf(me.hand, goal.cost, a));
  if (!spare.length) return null;
  const give = spare[0];
  // la seconda offerta del turno è più generosa (2:1) se possibile
  const n = memory.offers >= 1 && surplusOf(me.hand, goal.cost, give) >= 2 ? 2 : 1;
  return { type: 'offerTrade', give: { [give]: n }, want: { [want]: 1 } };
}

/** Gestisce la propria offerta aperta: conclude con chi ha accettato o la ritira. */
function handleOwnOffer(v, ctx) {
  const t = v.trade;
  const ok = Object.entries(t.responses).find(([, a]) => a === true);
  if (ok) return { type: 'confirmTrade', with: ok[0] };
  const others = v.players.filter(p => p.id !== ctx.me.id);
  const allAnswered = others.every(p => t.responses[p.id] !== undefined);
  const expired = ctx.memory.offerAt != null && ctx.memory.now - ctx.memory.offerAt > ctx.cfg.tradeTimeout;
  if (allAnswered || expired) return { type: 'cancelTrade' };
  return null; // aspetta le risposte
}

export function strategicAction(v, level, memory = {}, r = Math.random) {
  const me = v.me;
  if (!me || v.phase === 'ended' || v.phase === 'lobby') return null;
  const cfg = LEVELS[level] || LEVELS.hard;
  if (memory.turn !== v.turn) Object.assign(memory, { turn: v.turn, offers: 0, moduleActions: 0, actions: 0, offerAt: null });
  memory.now ??= Date.now();
  const prod = production(v, me.id);
  const ctx = { me, prod, cfg, r, memory };
  const goal = chooseGoal(v, ctx);

  if (me.freePicks > 0) {
    const miss = missingList(me.hand, goal.cost).filter(k => RESOURCES.includes(k) && v.bank[k] > 0);
    const res = miss[0] || [...RESOURCES].filter(k => v.bank[k] > 0).sort((a, b) => prod[a] - prod[b])[0];
    if (res) return { type: 'pickFree', resource: res };
  }
  if (v.phase === 'discard') {
    if (!me.mustDiscard) return null;
    return { type: 'discard', cards: chooseDiscard(me, me.mustDiscard, goal.cost) };
  }
  if (v.trade && v.trade.from !== me.id && v.trade.responses[me.id] === undefined) {
    return { type: 'respondTrade', accept: judgeTrade(v, me, v.trade, goal.cost, cfg, r), tradeId: v.trade.id };
  }
  if (!me.acting) return null;
  if (v.trade && v.trade.from === me.id) return handleOwnOffer(v, ctx);

  // un po' di imprevedibilità per il livello medio
  if (cfg.randomRate && v.phase === 'main' && r() < cfg.randomRate) {
    const a = easyAction(v, r);
    if (a && a.type !== 'offerTrade') return a;
  }

  if (v.phase === 'setup') {
    const L = me.legal;
    if (v.setup.step === 'settlement') {
      const scored = L.settlements.map(x => ({ x, s: vertexScore(v, x, prod) + (cfg.noise ? r() * cfg.noise : 0) }));
      return { type: 'placeSettlement', vertex: scored.sort((a, b) => b.s - a.s)[0].x };
    }
    let best = L.roads[0], bestS = -Infinity;
    for (const e of L.roads) {
      const ed = v.board.edges[e];
      const far = v.buildings[ed.a]?.owner === me.id ? ed.b : ed.a;
      const near = v.board.vertices[far].neighbors.filter(n => buildableVertex(v, n) && vertexFree(v, n));
      const s = Math.max(0, ...near.map(n => vertexScore(v, n, prod)));
      if (s > bestS) { bestS = s; best = e; }
    }
    return { type: 'placeRoad', edge: best };
  }
  if (v.phase === 'roll') return playDevCard(v, ctx, goal) || easyAction(v, r);
  if (v.phase === 'robber') return chooseRobber(v, me, me.legal.robberHexes);

  if (v.phase === 'main' || v.phase === 'extraBuild') {
    memory.actions++;
    const pass = v.phase === 'main' ? { type: 'endTurn' } : { type: 'passExtra' };
    if (memory.actions > 80) return pass;
    if (v.phase === 'main') {
      const dev = playDevCard(v, ctx, goal);
      if (dev) return dev;
    }
    const build = buildForGoal(v, ctx, goal);
    if (build) return build;
    if (v.phase === 'main') {
      const bank = bankTradeForGoal(v, me, goal);
      if (bank) return bank;
      const offer = proposeTrade(v, ctx, goal);
      if (offer) { memory.offers++; memory.offerAt = memory.now; return offer; }
    }
    if (memory.moduleActions < cfg.moduleActions) {
      const mods = moduleOptions(v, r);
      if (mods.length) { memory.moduleActions++; return mods[0]; }
    }
    // troppe carte in mano: meglio spenderle che scartarle col pirata
    const cards = Object.values(me.hand).reduce((a, b) => a + b, 0);
    if (cards > 7) {
      if (me.canBuy.dev) return { type: 'buyDev' };
      if (me.legal.roads.length && me.piecesLeft.road > 0) {
        return { type: 'buildRoad', edge: bestRoad(v, me.id, me.legal.roads, goal.target ?? goal.spots?.[0]?.vertex) };
      }
    }
    return pass;
  }
  return easyAction(v, r);
}
