// Proiezioni dello stato: cosa vede il tabellone (pubblico) e cosa vede ogni telefono (privato).

import { victoryPoints, findPlayer, robberVictims, robberTargets, actorId, activeModules, maxPlayers } from './game.js';
import {
  handSize, canAfford, piecesLeft, tradeRatios, costOf, hasModule,
  validSettlementSpots, validRoadSpots, validCitySpots,
} from './rules.js';

export function publicView(state) {
  const ended = state.phase === 'ended';
  const view = {
    version: state.version,
    phase: state.phase,
    settings: state.settings,
    maxPlayers: maxPlayers(state.settings),
    board: state.board && { ...state.board, hiddenPool: undefined },
    buildings: state.buildings,
    roads: state.roads,
    ships: {},
    guardians: {},
    robberHex: state.robberHex,
    raidersHex: state.raidersHex,
    current: state.current,
    currentId: state.players[state.current]?.id ?? null,
    actorId: state.phase === 'lobby' ? null : actorId(state),
    extraBuild: state.extraBuild,
    turn: state.turn,
    setup: state.setup && { step: state.setup.step, round: state.setup.index < state.players.length ? 1 : 2 },
    dice: state.dice,
    event: state.event,
    bank: state.bank,
    devDeckCount: state.devDeck.length,
    discardPending: state.discardPending,
    freeRoads: state.freeRoads,
    trade: state.trade,
    longestRoad: state.longestRoad,
    largestArmy: state.largestArmy,
    winner: state.winner,
    winVp: state.settings.winVp,
    log: state.log.slice(-30),
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected !== false,
      bot: p.bot?.level ?? null,
      cards: handSize(p.hand),
      devCards: p.devCards.length,
      playedMarines: p.playedMarines,
      freePicks: p.freePicks || 0,
      vp: state.phase === 'lobby' ? 0 : victoryPoints(state, p.id, { includeHidden: ended }),
      hand: ended ? p.hand : undefined,
    })),
  };
  if (state.phase !== 'lobby') {
    for (const m of activeModules(state)) if (m.publicExtra) Object.assign(view, m.publicExtra(state));
  }
  return view;
}

export function privateView(state, playerId) {
  const pub = publicView(state);
  const p = findPlayer(state, playerId);
  if (!p) return { ...pub, me: null };
  if (state.phase === 'lobby') return { ...pub, me: { id: p.id, name: p.name, color: p.color, lobby: true } };

  const myTurn = pub.currentId === playerId;
  const acting = pub.actorId === playerId;
  const building = acting && (state.phase === 'main' || state.phase === 'extraBuild');
  const legal = { settlements: [], roads: [], cities: [], robberHexes: [] };

  if (state.phase === 'setup' && myTurn) {
    if (state.setup.step === 'settlement') legal.settlements = validSettlementSpots(state, playerId, { setup: true });
    else legal.roads = validRoadSpots(state, playerId, { mustTouchVertex: state.setup.lastVertex });
  } else if (building) {
    const left = piecesLeft(state, playerId);
    const freeRoad = state.freeRoads > 0 && state.phase === 'main';
    if (left.road > 0 && (freeRoad || canAfford(p.hand, costOf(state, playerId, 'road')))) legal.roads = validRoadSpots(state, playerId);
    if (left.settlement > 0 && canAfford(p.hand, costOf(state, playerId, 'settlement'))) legal.settlements = validSettlementSpots(state, playerId);
    if (left.city > 0 && canAfford(p.hand, costOf(state, playerId, 'city'))) legal.cities = validCitySpots(state, playerId);
  } else if (state.phase === 'robber' && myTurn) {
    legal.robberHexes = robberTargets(state).map(h => ({ hex: h, victims: robberVictims(state, h, playerId) }));
  }
  for (const m of activeModules(state)) if (m.legal) Object.assign(legal, m.legal(state, playerId, { building }));

  const canBuy = {
    road: (state.freeRoads > 0 && state.phase === 'main') || canAfford(p.hand, costOf(state, playerId, 'road')),
    settlement: canAfford(p.hand, costOf(state, playerId, 'settlement')),
    city: canAfford(p.hand, costOf(state, playerId, 'city')),
    dev: !hasModule(state, 'empires') && canAfford(p.hand, costOf(state, playerId, 'dev')) && state.devDeck.length > 0,
  };

  const me = {
    id: p.id,
    name: p.name,
    color: p.color,
    hand: p.hand,
    devCards: p.devCards.map(c => ({ type: c.type, playable: c.type !== 'relic' && c.boughtTurn < state.turn })),
    devPlayedThisTurn: state.devPlayedThisTurn,
    vp: victoryPoints(state, p.id, { includeHidden: true }),
    myTurn,
    acting,
    building,
    freePicks: p.freePicks || 0,
    mustDiscard: state.discardPending[playerId] || 0,
    ratios: tradeRatios(state, playerId),
    piecesLeft: piecesLeft(state, playerId),
    costs: Object.fromEntries(['road', 'settlement', 'city', 'dev'].map(k => [k, costOf(state, playerId, k)])),
    canBuy,
    legal,
  };
  for (const m of activeModules(state)) if (m.privateExtra) Object.assign(me, m.privateExtra(state, playerId));
  return { ...pub, me };
}
