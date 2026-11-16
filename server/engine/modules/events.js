// Modulo "Eventi cosmici": a ogni tiro si pesca una carta evento.
import { EVENT_CARDS } from '../../../public/shared/constants.js';
import { shuffle } from '../rng.js';
import { gain } from '../rules.js';

function newDeck(state) {
  const deck = [];
  for (const [type, info] of Object.entries(EVENT_CARDS)) for (let i = 0; i < info.count; i++) deck.push(type);
  return shuffle(state, deck);
}

const MULT = {
  solarstorm: { solar: 0 },
  meteors: { asteroids: 2 },
  harvest: { jungle: 2 },
  unstable: { crystal: 0 },
};

export default {
  id: 'events',

  onStart(state) {
    state.events = { deck: newDeck(state), drawn: 0 };
  },

  // Si pesca subito dopo il tiro, prima di produzione e raid
  onDice(state, p, dice, ctx) {
    if (!state.events.deck.length) state.events.deck = newDeck(state);
    const type = state.events.deck.pop();
    state.events.drawn++;
    const info = EVENT_CARDS[type];
    state.event = { type, name: info.name, icon: info.icon, desc: info.desc, seq: state.events.drawn };
    ctx.log(state, `☄️ Evento: ${info.name} — ${info.desc}`);

    if (type === 'epidemic') {
      for (const pl of state.players) if (pl.hand.bio > 0) { pl.hand.bio--; state.bank.bio++; }
    } else if (type === 'discovery') {
      p.freePicks++;
    } else if (type === 'aid') {
      const vps = state.players.map(pl => ctx.victoryPoints(state, pl.id, { includeHidden: false }));
      const min = Math.min(...vps);
      state.players.forEach((pl, i) => { if (vps[i] === min) pl.freePicks++; });
    } else if (type === 'migration') {
      for (const pl of state.players) {
        if (Object.values(state.buildings).some(b => b.owner === pl.id && b.type === 'city')) gain(state, pl, 'water');
      }
    } else if (type === 'ionstorm') {
      const neb = state.board.hexes.find(h => h.terrain === 'nebula' && h.id !== state.robberHex)
        || state.board.hexes.find(h => h.terrain === 'nebula');
      if (neb) state.robberHex = neb.id;
    }
  },

  productionMultiplier(state, hex) {
    const m = state.event && MULT[state.event.type];
    return m && m[hex.terrain] !== undefined ? m[hex.terrain] : 1;
  },

  publicExtra(state) {
    return { event: state.event, eventDeck: state.events?.deck.length ?? 0 };
  },
};
