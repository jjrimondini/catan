// Modulo "Grande Galassia": 5-6 giocatori, mappa da 30 settori (vedi board.js),
// banca e mazzo più grandi (vedi game.js) e fase di costruzione extra a fine turno.

export default {
  id: 'galaxy',

  onEndTurn(state, p, ctx) {
    const n = state.players.length;
    const queue = [];
    for (let i = 1; i < n; i++) queue.push(state.players[(state.current + i) % n].id);
    state.extraBuild = { queue };
    state.phase = 'extraBuild';
    ctx.log(state, `Costruzione extra: a turno, gli altri giocatori possono costruire.`);
    return true;
  },

  handlers: {
    passExtra(state, p, _a, ctx) {
      ctx.requirePhase(state, 'extraBuild');
      if (ctx.actorId(state) !== p.id) ctx.fail('Non è il tuo momento di costruire.');
      state.extraBuild.queue.shift();
      if (state.extraBuild.queue.length === 0) ctx.advanceTurn(state);
    },
  },
};
