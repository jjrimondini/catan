// Bot "Facile": sceglie un'azione legale quasi a caso a partire dalla vista privata del giocatore.
// Restituisce un'azione { type, ... } oppure null se non ha nulla da fare.
// moduleOptions() è riusato anche dai bot strategici per le azioni delle espansioni.
import { RESOURCES, COMMODITIES, PROGRESS_CARDS } from '../../public/shared/constants.js';

const first = a => (a && a.length ? a[0] : undefined);
const pick = (a, r) => a[Math.floor(r() * a.length)];

/** Azioni proposte dalle espansioni (astronavi, guardiani, convogli, missioni, progresso…). */
export function moduleOptions(v, r = Math.random) {
  const me = v.me;
  const L = me.legal;
  const opts = [];
  if (L.ships?.length && r() < 0.6) opts.push({ type: 'buildShip', edge: pick(L.ships, r) });
  if (L.guardians?.length && r() < 0.5) opts.push({ type: 'buildGuardian', vertex: pick(L.guardians, r) });
  if (L.activateGuardians?.length) opts.push({ type: 'activateGuardian', vertex: first(L.activateGuardians) });
  if (L.upgradeGuardians?.length && r() < 0.4) opts.push({ type: 'upgradeGuardian', vertex: first(L.upgradeGuardians) });
  if (L.shields?.length && r() < 0.3) opts.push({ type: 'buildShield', vertex: first(L.shields) });
  if (v.phase === 'main') {
    for (const [t, why] of Object.entries(L.improve || {})) if (why === null) opts.push({ type: 'improve', track: t });
    if (L.chase?.length && r() < 0.3) opts.push({ type: 'chaseRobber', from: first(L.chase) });
    if (L.guardianMoves?.length && r() < 0.2) { const m = pick(L.guardianMoves, r); opts.push({ type: 'moveGuardian', from: m.from, to: pick(m.to, r) }); }
    if (L.displace?.length) { const m = first(L.displace); opts.push({ type: 'displaceGuardian', from: m.from, to: first(m.to) }); }
    if (L.convoySteps?.length) opts.push({ type: 'moveConvoy', to: pick(L.convoySteps, r) });
    if (L.crewHexes?.length && (me.hand.bio || 0) >= 1 && (me.hand.ore || 0) >= 1) opts.push({ type: 'sendCrew', hex: first(L.crewHexes) });
    if (L.salvageHexes?.length) opts.push({ type: 'salvage', hex: first(L.salvageHexes) });
    if (me.artifacts > 0 && me.hand.water >= 2 && me.hand.energy >= 1) opts.push({ type: 'deliverArtifact' });
    if (me.nectar >= 3) opts.push({ type: 'deliverNectar' });
    if (L.shipMoves?.length && r() < 0.2) { const m = pick(L.shipMoves, r); opts.push({ type: 'moveShip', from: m.from, to: pick(m.to, r) }); }
    if (me.credits >= 2 && !me.creditTradeUsed && r() < 0.3) opts.push({ type: 'creditTrade', resource: pick(RESOURCES, r) });
    for (const c of me.progress || []) {
      const info = PROGRESS_CARDS[c];
      if (info.when === 'roll') continue;
      const simple = ['extractor', 'greenhouse', 'medicine', 'windfall', 'orbital', 'sabotage'];
      if (simple.includes(c)) opts.push({ type: 'playProgress', card: c });
      if (c === 'resmono' || c === 'tradefleet') opts.push({ type: 'playProgress', card: c, resource: pick(RESOURCES, r) });
      if (c === 'commono') opts.push({ type: 'playProgress', card: c, resource: pick(COMMODITIES, r) });
      if (c === 'diplomacy' && L.diplomacy?.length) opts.push({ type: 'playProgress', card: c, edge: first(L.diplomacy) });
    }
  }
  return opts;
}

export function botAction(v, r = Math.random) {
  const me = v.me;
  if (!me || v.phase === 'ended' || v.phase === 'lobby') return null;
  const L = me.legal;

  if (me.freePicks > 0) {
    const res = RESOURCES.filter(x => v.bank[x] > 0);
    if (res.length) return { type: 'pickFree', resource: pick(res, r) };
  }
  if (v.phase === 'discard') {
    if (!me.mustDiscard) return null;
    const cards = {}; let left = me.mustDiscard;
    for (const [k, n] of Object.entries(me.hand)) { const t = Math.min(n, left); if (t) cards[k] = t; left -= t; }
    return { type: 'discard', cards };
  }
  if (v.trade && v.trade.from !== me.id && v.trade.responses[me.id] === undefined) {
    const can = Object.entries(v.trade.want).every(([k, n]) => (me.hand[k] || 0) >= n);
    return { type: 'respondTrade', accept: can && r() < 0.5, tradeId: v.trade.id };
  }
  if (!me.acting) return null;
  // un'offerta propria ancora aperta (es. bot "Facile" in partita con altri): chiudila
  if (v.trade && v.trade.from === me.id) {
    const ok = Object.entries(v.trade.responses).find(([, a]) => a === true);
    return ok ? { type: 'confirmTrade', with: ok[0] } : { type: 'cancelTrade' };
  }

  if (v.phase === 'setup') {
    if (v.setup.step === 'settlement') return { type: 'placeSettlement', vertex: pick(L.settlements, r) };
    return { type: 'placeRoad', edge: pick(L.roads, r) };
  }
  if (v.phase === 'roll') {
    if (me.progress?.includes('predictive') && r() < 0.3) return { type: 'playProgress', card: 'predictive', values: [3, 5] };
    return { type: 'roll' };
  }
  if (v.phase === 'robber') {
    const o = L.robberHexes.find(x => x.victims.length) || pick(L.robberHexes, r);
    return { type: 'moveRobber', hex: o.hex, victim: o.victims[0] };
  }

  const opts = [];
  if (L.cities.length) opts.push({ type: 'buildCity', vertex: first(L.cities) });
  if (L.settlements.length) opts.push({ type: 'buildSettlement', vertex: pick(L.settlements, r) });
  opts.push(...moduleOptions(v, r));
  if (v.phase === 'main') {
    const playable = me.devCards.find(c => c.playable && c.type === 'marines');
    if (playable && !me.devPlayedThisTurn && r() < 0.5) opts.push({ type: 'playDev', card: 'marines' });
  }
  if (L.roads.length && me.piecesLeft.road > 6 && r() < 0.7) opts.push({ type: 'buildRoad', edge: pick(L.roads, r) });
  if (me.canBuy.dev && r() < 0.5) opts.push({ type: 'buyDev' });
  if (opts.length) return opts[0].type.startsWith('build') || opts[0].type === 'improve' ? opts[0] : pick(opts, r);

  if (v.phase === 'main') {
    const give = Object.keys(me.ratios).find(k => me.hand[k] >= me.ratios[k]);
    const need = RESOURCES.find(k => k !== give && me.hand[k] === 0 && v.bank[k] > 0);
    if (give && need && r() < 0.8) return { type: 'bankTrade', give, get: need };
    return { type: 'endTurn' };
  }
  if (v.phase === 'extraBuild') return { type: 'passExtra' };
  return null;
}
