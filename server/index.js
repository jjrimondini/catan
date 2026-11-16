// Server: Express serve le pagine, Socket.IO sincronizza tabellone e telefoni.
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { createGame, addPlayer, removePlayer, startGame, applyAction, findPlayer, setSettings, maxPlayers, GameError } from './engine/game.js';
import { publicView, privateView } from './engine/view.js';
import { botDecide, BOT_LEVELS, BOT_NAMES } from './bots/index.js';
import { PLAYER_COLORS } from '../public/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

function lanAddress() {
  const candidates = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      // Evita adattatori virtuali comuni (WSL, Hyper-V, VirtualBox, VPN)
      const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier/i.test(name);
      candidates.push({ address: i.address, score: (virtual ? 0 : 2) + (i.address.startsWith('192.168.') ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => res.redirect('/board/'));
app.get('/board', (_req, res) => res.redirect('/board/'));
app.get('/hand', (_req, res) => res.redirect('/hand/'));

const handUrl = () => `http://${lanAddress()}:${PORT}/hand/`;
app.get('/api/join-info', async (_req, res) => {
  const url = handUrl();
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0c1e', light: '#ffffff' } });
  res.json({ url, qr });
});

// ---------- Stato della partita (una sola stanza) ----------

let state = createGame();
const tokens = new Map(); // token -> playerId
const sockets = new Map(); // playerId -> Set<socket>

function broadcast() {
  try { doBroadcast(); } catch (err) { console.error("Errore durante l'invio dello stato:", err); }
  scheduleBots();
}

/** Applica un'azione su una copia dello stato; se valida la pubblica. Lancia GameError se rifiutata. */
function tryApply(playerId, action) {
  const next = structuredClone(state);
  applyAction(next, playerId, action);
  state = next;
  broadcast();
}

// ---------- Bot ----------
// I bot giocano lato server con la stessa vista privata di un telefono. Agiscono uno alla volta,
// con una breve pausa, così le mosse si vedono sul tabellone.

const BOT_DELAY = Number(process.env.BOT_DELAY ?? 900);
const botMemory = new Map(); // playerId -> memoria del bot
let botTimer = null;

function scheduleBots(delay = BOT_DELAY) {
  if (botTimer) return;
  if (!state.players.some(p => p.bot) || state.phase === 'lobby' || state.phase === 'ended') return;
  botTimer = setTimeout(() => { botTimer = null; runBots(); }, delay);
}

function runBots() {
  let waiting = false;
  for (const p of state.players) {
    if (!p.bot) continue;
    if (!botMemory.has(p.id)) botMemory.set(p.id, {});
    const memory = botMemory.get(p.id);
    memory.now = Date.now();
    let action;
    try {
      action = botDecide(privateView(state, p.id), p.bot.level, memory);
    } catch (err) {
      console.error(`Errore del bot ${p.name}:`, err);
      action = null;
    }
    if (!action) {
      if (state.trade?.from === p.id) waiting = true; // aspetta le risposte alla sua offerta
      continue;
    }
    try {
      tryApply(p.id, action); // broadcast() riprogramma il prossimo passo
    } catch (err) {
      console.error(`Mossa del bot ${p.name} rifiutata (${action.type}):`, err.message);
      botFallback(p);
    }
    return;
  }
  if (waiting) scheduleBots(1000);
}

/** Se una mossa del bot viene rifiutata, passa in modo sicuro per non bloccare la partita. */
function botFallback(p) {
  const fallbacks = state.trade?.from === p.id ? [{ type: 'cancelTrade' }] : [];
  fallbacks.push({ type: 'endTurn' }, { type: 'passExtra' });
  try { const a = botDecide(privateView(state, p.id), 'easy'); if (a) fallbacks.push(a); } catch { /* ignora */ }
  for (const a of fallbacks) {
    try { tryApply(p.id, a); return; } catch { /* prova il successivo */ }
  }
  console.error(`Il bot ${p.name} non riesce a proseguire in fase ${state.phase}.`);
}

function addBot(level) {
  if (!BOT_LEVELS[level]) throw new GameError('Livello del bot non valido.');
  if (state.players.length >= state.settings.players) throw new GameError('La partita è piena.');
  const used = new Set(state.players.map(p => p.color));
  const color = PLAYER_COLORS.slice(0, maxPlayers(state.settings)).find(c => !used.has(c.id));
  if (!color) throw new GameError('Non ci sono colori liberi.');
  const names = new Set(state.players.map(p => p.name));
  const name = BOT_NAMES.map(n => `🤖 ${n}`).find(n => !names.has(n)) || `🤖 Bot ${state.players.length + 1}`;
  addPlayer(state, { id: crypto.randomUUID(), name, color: color.id, bot: { level } });
}

function doBroadcast() {
  io.to('boards').emit('state', publicView(state));
  for (const [pid, set] of sockets) {
    const view = privateView(state, pid);
    for (const s of set) s.emit('state', view);
  }
  // telefoni non ancora registrati vedono la lobby
  io.to('guests').emit('state', publicView(state));
}

function setConnected(pid) {
  const p = findPlayer(state, pid);
  if (p && !p.bot) p.connected = (sockets.get(pid)?.size || 0) > 0;
}

function safely(socket, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    if (err instanceof GameError) socket.emit('error-msg', err.message);
    else { console.error(err); socket.emit('error-msg', 'Errore interno del server.'); }
    return false;
  }
}

io.on('connection', socket => {
  let playerId = null;

  socket.on('hello', ({ role, token } = {}) => {
    if (role === 'board') {
      socket.join('boards');
      socket.emit('state', publicView(state));
      return;
    }
    const pid = token && tokens.get(token);
    if (pid && findPlayer(state, pid)) {
      bind(pid);
    } else {
      socket.join('guests');
      socket.emit('need-join');
      socket.emit('state', publicView(state));
    }
  });

  function bind(pid) {
    playerId = pid;
    socket.leave('guests');
    if (!sockets.has(pid)) sockets.set(pid, new Set());
    sockets.get(pid).add(socket);
    setConnected(pid);
    broadcast();
  }

  socket.on('join', ({ name, color } = {}) => {
    if (playerId) return;
    const id = crypto.randomUUID();
    const ok = safely(socket, () => { addPlayer(state, { id, name, color }); });
    if (!ok) return;
    const token = crypto.randomBytes(16).toString('hex');
    tokens.set(token, id);
    socket.emit('joined', { token, playerId: id });
    bind(id);
  });

  socket.on('leave', () => {
    if (!playerId || state.phase !== 'lobby') return;
    if (safely(socket, () => removePlayer(state, playerId))) {
      for (const [t, pid] of tokens) if (pid === playerId) tokens.delete(t);
      sockets.delete(playerId);
      playerId = null;
      socket.join('guests');
      socket.emit('need-join');
      broadcast();
    }
  });

  socket.on('settings', input => {
    if (!socket.rooms.has('boards')) return socket.emit('error-msg', 'Le impostazioni si scelgono dal tabellone.');
    if (safely(socket, () => setSettings(state, input))) broadcast();
  });

  socket.on('add-bot', ({ level } = {}) => {
    if (!socket.rooms.has('boards')) return socket.emit('error-msg', 'I bot si aggiungono dal tabellone.');
    if (safely(socket, () => addBot(level))) broadcast();
  });

  socket.on('start', () => {
    if (safely(socket, () => startGame(state))) broadcast();
  });

  socket.on('new-game', () => {
    // Solo dal tabellone: nuova partita con gli stessi giocatori connessi
    if (!socket.rooms.has('boards')) return;
    const old = state;
    state = createGame({ settings: old.settings });
    botMemory.clear();
    for (const p of old.players) {
      try { addPlayer(state, { id: p.id, name: p.name, color: p.color, bot: p.bot }); } catch { /* ignora */ }
      setConnected(p.id);
    }
    broadcast();
  });

  socket.on('kick', ({ playerId: pid } = {}) => {
    if (!socket.rooms.has('boards') || state.phase !== 'lobby') return;
    if (safely(socket, () => removePlayer(state, pid))) {
      for (const [t, id] of tokens) if (id === pid) tokens.delete(t);
      for (const s of sockets.get(pid) || []) { s.emit('need-join'); s.join('guests'); }
      sockets.delete(pid);
      broadcast();
    }
  });

  socket.on('action', action => {
    if (!playerId) return socket.emit('error-msg', 'Devi prima entrare in partita.');
    safely(socket, () => tryApply(playerId, action));
  });

  socket.on('disconnect', () => {
    if (!playerId) return;
    sockets.get(playerId)?.delete(socket);
    setConnected(playerId);
    broadcast();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const url = handUrl();
  console.log('\n  🚀 Frontiera Stellare è in esecuzione!\n');
  console.log(`  Tabellone (su questo PC):  http://localhost:${PORT}/board/`);
  console.log(`  Telefoni (stessa Wi-Fi):    ${url}\n`);
  QRCode.toString(url, { type: 'terminal', small: true }).then(q => console.log(q)).catch(() => {});
});
