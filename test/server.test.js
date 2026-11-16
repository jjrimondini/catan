// Test di integrazione: avvia il server e simula i telefoni che giocano molti turni via Socket.IO.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { botAction } from './bot.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(5); }
}

function startServer(port, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => { if (String(d).includes('in esecuzione')) resolve(proc); });
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('exit', code => reject(new Error(`server uscito con codice ${code}`)));
  });
}

async function playGame({ port, modules, names, turns }) {
  const URL = `http://localhost:${port}`;
  const server = await startServer(port);
  const sockets = [];
  const connect = () => { const s = io(URL, { transports: ['websocket'], forceNew: true }); sockets.push(s); return s; };
  try {
    const board = connect();
    let boardView = null;
    const boardErrors = [];
    board.on('connect', () => board.emit('hello', { role: 'board' }));
    board.on('state', v => { boardView = v; });
    board.on('error-msg', m => boardErrors.push(m));
    await until(() => boardView);

    // Impostazioni dal tabellone
    board.emit('settings', { modules, players: names.length });
    await until(() => boardView.settings.players === names.length && boardView.settings.modules.length === modules.length);

    const colors = ['red', 'blue', 'yellow', 'violet', 'green', 'orange'];
    const clients = names.map((name, i) => {
      const s = connect();
      const c = { s, name, view: null, errors: [] };
      s.on('connect', () => s.emit('hello', { role: 'hand', token: c.token }));
      s.on('need-join', () => s.emit('join', { name, color: colors[i] }));
      s.on('joined', ({ token }) => { c.token = token; });
      s.on('state', v => { c.view = v; });
      s.on('error-msg', m => c.errors.push(m));
      return c;
    });
    await until(() => clients.every(c => c.view?.me));
    // un telefono non può cambiare le impostazioni
    clients[0].s.emit('settings', { players: 2 });
    await until(() => clients[0].errors.length === 1);
    clients[0].errors.length = 0;

    clients[0].s.emit('start');
    await until(() => boardView.phase === 'setup');
    assert.ok(boardView.players.every(p => p.hand === undefined), 'le mani non arrivano al tabellone');

    let r = 1;
    const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    let lastVersion = -1;
    for (let steps = 0; steps < 6000; steps++) {
      await until(() => clients.every(c => c.view && c.view.version === boardView.version) && boardView.version !== lastVersion, 4000)
        .catch(() => { throw new Error(`stallo alla fase ${boardView.phase}, versione ${boardView.version}`); });
      lastVersion = boardView.version;
      if (boardView.phase === 'ended' || boardView.turn > turns) break;
      let sent = false;
      for (const c of clients) {
        const a = botAction(c.view, rand);
        if (a) { c.s.emit('action', a); sent = true; break; }
      }
      if (!sent) throw new Error(`nessuno può agire in fase ${boardView.phase}`);
    }

    const allErrors = clients.flatMap(c => c.errors);
    assert.deepEqual(allErrors, [], `errori dal server: ${allErrors.join('; ')}`);
    assert.deepEqual(boardErrors, []);
    assert.ok(boardView.turn > 10 || boardView.phase === 'ended', `troppo pochi turni: ${boardView.turn}`);

    // Riconnessione con lo stesso token
    const token = clients[1].token;
    clients[1].s.disconnect();
    await until(() => boardView.players.some(p => !p.connected));
    const again = connect();
    let reView = null;
    again.on('connect', () => again.emit('hello', { role: 'hand', token }));
    again.on('state', v => { reView = v; });
    await until(() => reView?.me?.name === names[1]);
    await until(() => boardView.players.every(p => p.connected));

    // Nuova partita: le impostazioni restano
    board.emit('new-game');
    await until(() => boardView.phase === 'lobby');
    assert.deepEqual(boardView.settings.modules, modules);
    return boardView;
  } finally {
    for (const s of sockets) s.disconnect();
    server.kill();
  }
}

test('partita via socket: gioco base con 3 telefoni', { timeout: 90000 }, async () => {
  await playGame({ port: 3917, modules: [], names: ['Ada', 'Bo', 'Cy'], turns: 60 });
});

test('partita via socket: tutte le espansioni con 5 telefoni', { timeout: 120000 }, async () => {
  await playGame({ port: 3918, modules: ['galaxy', 'deepspace', 'empires', 'convoys', 'missions', 'events'], names: ['Ada', 'Bo', 'Cy', 'Di', 'Ed'], turns: 30 });
});

test('partita via socket: 1 telefono contro 3 bot', { timeout: 120000 }, async () => {
  const port = 3919;
  const URL = `http://localhost:${port}`;
  const server = await startServer(port, { BOT_DELAY: '0' });
  const sockets = [];
  const connect = () => { const s = io(URL, { transports: ['websocket'], forceNew: true }); sockets.push(s); return s; };
  try {
    const board = connect();
    let boardView = null;
    const boardErrors = [];
    board.on('connect', () => board.emit('hello', { role: 'board' }));
    board.on('state', v => { boardView = v; });
    board.on('error-msg', m => boardErrors.push(m));
    await until(() => boardView);
    board.emit('settings', { players: 4 });
    await until(() => boardView.settings.players === 4);

    const human = { s: connect(), view: null, errors: [] };
    human.s.on('connect', () => human.s.emit('hello', { role: 'hand' }));
    human.s.on('need-join', () => human.s.emit('join', { name: 'Ada', color: 'red' }));
    human.s.on('state', v => { human.view = v; });
    human.s.on('error-msg', m => human.errors.push(m));
    await until(() => human.view?.me);

    // solo il tabellone può aggiungere bot
    human.s.emit('add-bot', { level: 'hard' });
    await until(() => human.errors.length === 1);
    human.errors.length = 0;

    for (const level of ['hard', 'medium', 'easy']) board.emit('add-bot', { level });
    await until(() => boardView.players.length === 4);
    assert.deepEqual(boardView.players.map(p => p.bot), [null, 'hard', 'medium', 'easy']);
    assert.ok(boardView.players.every(p => p.connected));

    board.emit('start');
    await until(() => boardView.phase === 'setup');

    let r = 7;
    const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    let humanTurns = 0, lastKey = '';
    const t0 = Date.now();
    while (boardView.phase !== 'ended' && boardView.turn < 40 && Date.now() - t0 < 90000) {
      await wait(10);
      const v = human.view;
      if (!v || v.version !== boardView.version) continue;
      const key = `${v.version}`;
      if (key === lastKey) continue;
      const a = botAction(v, rand);
      if (!a) continue;
      lastKey = key;
      if (a.type === 'endTurn') humanTurns++;
      human.s.emit('action', a);
    }
    assert.deepEqual(human.errors, [], `errori: ${human.errors.join('; ')}`);
    assert.deepEqual(boardErrors, []);
    assert.ok(boardView.turn >= 40 || boardView.phase === 'ended', `la partita si è fermata al turno ${boardView.turn} (fase ${boardView.phase})`);
    assert.ok(humanTurns > 3, 'il turno torna al telefono');

    // Nuova partita: i bot restano al loro posto
    board.emit('new-game');
    await until(() => boardView.phase === 'lobby');
    assert.deepEqual(boardView.players.map(p => p.bot).sort(), ['easy', 'hard', 'medium', null].sort());
  } finally {
    for (const s of sockets) s.disconnect();
    server.kill();
  }
});
