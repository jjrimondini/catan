import { renderBoard, colorHex, boardBounds } from '/shared/render.js';
import {
  RESOURCES, COMMODITIES, RESOURCE_INFO, COSTS, BUILD_NAMES, DEV_CARDS, PLAYER_COLORS, PHASE_NAMES,
  MODULE_INFO, MODULE_ORDER, MAP_MODES, TRACKS, PROGRESS_CARDS, STATIONS, TERRAIN,
} from '/shared/constants.js';
import { RULES } from '/shared/rules.js';

const socket = io();
const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignora */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignora */ } },
};

let view = null;
let joinColor = null;
let prevHand = null;
let wasActing = false;
let tab = 'game';
let ui = freshUi();
let uiKey = '';
let zoom = null; // { scale, cx, cy } per la scheda Mappa

function freshUi() {
  return { mode: 'home', sel: null, from: null, victim: null, discard: {}, give: {}, want: {}, bankGive: null, bankGet: null, picks: [], card: null, dice: [3, 4] };
}

socket.on('connect', () => socket.emit('hello', { role: 'hand', token: store.get('fs-token') }));
socket.on('need-join', () => { store.del('fs-token'); render(); });
socket.on('joined', ({ token }) => store.set('fs-token', token));
socket.on('state', v => onState(v));
socket.on('error-msg', toast);
socket.on('disconnect', () => toast('Connessione persa, riconnessione…'));

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

const send = action => socket.emit('action', action);
const has = m => view.settings.modules.includes(m);

const PERSISTENT_MODES = new Set(['trade', 'convoy', 'tracks', 'bank', 'cards', 'progress']);

function onState(v) {
  view = v;
  const key = `${v.phase}|${v.current}|${v.turn}|${v.setup?.step || ''}|${v.trade?.id || ''}|${v.actorId}`;
  if (key !== uiKey) {
    const keep = PERSISTENT_MODES.has(ui.mode) && v.phase === 'main' && v.me?.myTurn && (ui.mode !== 'trade' || v.trade?.from === v.me?.id);
    uiKey = key;
    ui = { ...freshUi(), mode: keep ? ui.mode : 'home' };
  }
  if (v.me && !v.me.lobby) {
    if (v.me.acting && !wasActing && v.phase !== 'ended' && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    wasActing = v.me.acting;
    if (v.freeRoads > 0 && v.me.myTurn && v.phase === 'main' && ui.mode === 'home') ui.mode = 'road';
  }
  render();
  flashGains(v);
}

function flashGains(v) {
  if (!v.me?.hand) return;
  if (prevHand) {
    for (const r of Object.keys(v.me.hand)) {
      if (v.me.hand[r] > (prevHand[r] || 0)) document.querySelector(`.res[data-r="${r}"]`)?.classList.add('flash');
    }
  }
  prevHand = { ...v.me.hand };
}

// ---------- Helper di rendering ----------

const costHtml = cost => Object.entries(cost).map(([r, n]) => `${n > 1 ? n : ''}${RESOURCE_INFO[r].icon}`).join(' ');
const bundleHtml = b => Object.entries(b).filter(([, n]) => n > 0).map(([r, n]) => `${n}${RESOURCE_INFO[r].icon}`).join(' ') || '—';
const playerById = id => view.players.find(p => p.id === id);
const pname = id => { const p = playerById(id); return p ? `<b style="color:${colorHex(p.color)}">${esc(p.name)}</b>` : '?'; };
const cardTypes = () => Object.keys(view.me.hand);

function render() {
  if (!view) return;
  const inGame = view.me && !view.me.lobby && view.phase !== 'lobby';
  tabbar.hidden = !inGame;
  if (!view.me) {
    if (view.phase !== 'lobby') {
      app.innerHTML = `<h1>✦ Frontiera <span>Stellare</span></h1><div class="panel center">La partita è già in corso.<br><span class="muted">Aspetta la prossima!</span></div>`;
      return;
    }
    return renderJoin();
  }
  if (view.phase === 'lobby') return renderLobby();
  tabbar.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const badge = tabbar.querySelector('[data-tab=game] .dotbadge');
  if (badge) badge.hidden = !(view.me.acting || view.me.mustDiscard || view.me.freePicks || (view.trade && view.trade.from !== view.me.id && view.trade.responses[view.me.id] === undefined));
  if (tab === 'map') return renderMapTab();
  if (tab === 'cards') return renderCardsTab();
  renderGame();
}

// ---------- Ingresso e sala d'attesa ----------

function settingsSummary() {
  const s = view.settings;
  const mods = s.modules.length ? s.modules.map(m => `${MODULE_INFO[m].icon} ${MODULE_INFO[m].name}`).join(' · ') : 'Nessuna espansione';
  return `<div class="panel"><h3>Impostazioni (scelte dal tabellone)</h3>
    <div>👥 ${s.players} giocatori · 🏆 ${s.winVp} PV · 🗺️ ${MAP_MODES[s.mapMode]}</div><div class="muted">${mods}</div></div>`;
}

function renderJoin() {
  const taken = new Set(view.players.map(p => p.color));
  const colors = PLAYER_COLORS.slice(0, view.maxPlayers);
  if (!joinColor || taken.has(joinColor) || !colors.some(c => c.id === joinColor)) joinColor = colors.find(c => !taken.has(c.id))?.id || null;
  const full = view.players.length >= view.settings.players;
  app.innerHTML = `<h1>✦ Frontiera <span>Stellare</span></h1>
    <div class="panel">
      <h3>Il tuo nome</h3>
      <input type="text" id="name" maxlength="16" placeholder="Comandante…" value="${esc(store.get('fs-name') || '')}">
      <h3>Il tuo colore</h3>
      <div class="colors">${colors.map(c => `<button class="color ${c.id === joinColor ? 'on' : ''}" data-color="${c.id}" style="background:${c.hex}" ${taken.has(c.id) ? 'disabled' : ''} aria-label="${c.name}"></button>`).join('')}</div>
      <button class="primary big" data-act="join" ${full || !joinColor ? 'disabled' : ''}>${full ? 'Partita piena' : 'Entra in partita'}</button>
    </div>
    ${settingsSummary()}${playersMini()}`;
}

function renderLobby() {
  const ready = view.players.length === view.settings.players;
  app.innerHTML = `<h1>✦ Frontiera <span>Stellare</span></h1>
    <div class="top"><span class="dot" style="background:${colorHex(view.me.color)}"></span><span class="name">${esc(view.me.name)}</span></div>
    <div class="status">Sei a bordo! ${ready ? 'Si può partire.' : `In attesa di altri giocatori (${view.players.length}/${view.settings.players})…`}</div>
    ${settingsSummary()}${playersMini()}
    <button class="primary big" data-act="start" ${ready ? '' : 'disabled'}>🚀 Inizia la partita</button>
    <button data-act="leave">Esci</button>`;
}

function playersMini() {
  if (!view.players.length) return '';
  return `<div class="panel"><h3>Giocatori</h3><div class="players-mini">${view.players.map(p =>
    `<div class="pm"><span class="dot" style="background:${colorHex(p.color)}"></span>${esc(p.name)}${p.connected ? '' : ' <small class="muted">(offline)</small>'}
     ${view.phase !== 'lobby' ? `<span class="muted">🃏${p.cards}</span><span class="vp">${p.vp} PV</span>` : ''}</div>`).join('')}</div></div>`;
}

// ---------- Selezione sulla mappa ----------

/** Cosa si può toccare sulla mappa in questo momento. */
function currentPick() {
  const me = view.me, L = me.legal, ph = view.phase;
  if (!me.acting && ph !== 'robber') return null;
  if (ph === 'setup') {
    return view.setup.step === 'settlement'
      ? { kind: 'vertex', targets: L.settlements, label: 'Piazza avamposto', act: id => ({ type: 'placeSettlement', vertex: id }) }
      : { kind: 'edge', targets: L.roads, label: 'Piazza iperlinea', act: id => ({ type: 'placeRoad', edge: id }) };
  }
  if (ph === 'robber' && me.myTurn) {
    return { kind: 'hex', targets: L.robberHexes.map(o => o.hex), label: 'Sposta qui', robber: true };
  }
  if (ph !== 'main' && ph !== 'extraBuild') return null;
  const m = ui.mode;
  const simple = {
    road: ['edge', L.roads, 'Costruisci iperlinea', id => ({ type: 'buildRoad', edge: id })],
    settlement: ['vertex', L.settlements, 'Costruisci avamposto', id => ({ type: 'buildSettlement', vertex: id })],
    city: ['vertex', L.cities, 'Fonda colonia', id => ({ type: 'buildCity', vertex: id })],
    ship: ['edge', L.ships, 'Lancia astronave', id => ({ type: 'buildShip', edge: id })],
    guardian: ['vertex', L.guardians, 'Schiera guardiano', id => ({ type: 'buildGuardian', vertex: id })],
    upgradeGuardian: ['vertex', L.upgradeGuardians, 'Potenzia', id => ({ type: 'upgradeGuardian', vertex: id })],
    activateGuardian: ['vertex', L.activateGuardians, 'Attiva', id => ({ type: 'activateGuardian', vertex: id })],
    shield: ['vertex', L.shields, 'Installa scudo', id => ({ type: 'buildShield', vertex: id })],
    chase: ['vertex', L.chase, 'Scaccia i pirati', id => ({ type: 'chaseRobber', from: id })],
    convoy: ['vertex', L.convoySteps, 'Muovi qui', id => ({ type: 'moveConvoy', to: id })],
    crew: ['hex', L.crewHexes, 'Invia equipaggio', id => ({ type: 'sendCrew', hex: id })],
    salvage: ['hex', L.salvageHexes, 'Recupera relitto', id => ({ type: 'salvage', hex: id })],
    diplomacy: ['edge', L.diplomacy, 'Smantella iperlinea', id => ({ type: 'playProgress', card: 'diplomacy', edge: id })],
  };
  if (simple[m]) {
    const [kind, targets, label, act] = simple[m];
    return { kind, targets: targets || [], label, act };
  }
  const twoStep = {
    moveShip: ['edge', L.shipMoves, 'Sposta astronave', (f, t) => ({ type: 'moveShip', from: f, to: t })],
    moveGuardian: ['vertex', L.guardianMoves, 'Sposta guardiano', (f, t) => ({ type: 'moveGuardian', from: f, to: t })],
    displace: ['vertex', L.displace, 'Scaccia guardiano', (f, t) => ({ type: 'displaceGuardian', from: f, to: t })],
  };
  if (twoStep[m]) {
    const [kind, list, label, act] = twoStep[m];
    if (ui.from == null) return { kind, targets: (list || []).map(x => x.from), label: 'Scegli il pezzo', stage: 'from' };
    const opt = (list || []).find(x => x.from === ui.from);
    return { kind, targets: opt ? opt.to : [], label, act: id => act(ui.from, id), fromMark: ui.from };
  }
  return null;
}

function mapOptions(pick) {
  if (!pick) return {};
  const set = new Set(pick.targets);
  const opt = { selected: ui.sel };
  if (pick.kind === 'vertex') opt.vertices = set;
  if (pick.kind === 'edge') opt.edges = set;
  if (pick.kind === 'hex') opt.hexes = set;
  if (pick.fromMark != null && !ui.sel) opt.selected = { kind: pick.kind, id: pick.fromMark };
  return opt;
}

function pickControls(pick) {
  if (!pick) return '';
  if (!pick.targets.length) return `<div class="note">Nessuna posizione disponibile.</div>${pick.robber ? '' : '<button data-act="home">Indietro</button>'}`;
  if (pick.robber) return robberControls();
  const selOk = ui.sel && ui.sel.kind === pick.kind && pick.targets.includes(ui.sel.id);
  const back = view.phase === 'setup' ? '' : `<button data-act="home">${view.freeRoads > 0 && ui.mode === 'road' ? 'Salta' : 'Annulla'}</button>`;
  return `<div class="row">${back}<button class="primary" data-act="confirm-pick" ${selOk ? '' : 'disabled'}>${selOk ? pick.label : pick.stage === 'from' ? 'Tocca un tuo pezzo' : 'Tocca un punto evidenziato'}</button></div>`;
}

function robberControls() {
  const opts = view.me.legal.robberHexes;
  const selHex = ui.sel?.kind === 'hex' ? ui.sel.id : null;
  const victims = selHex != null ? opts.find(o => o.hex === selHex)?.victims || [] : [];
  let html = '';
  if (victims.length > 1) {
    html = `<h3>A chi rubi?</h3><div class="chips">${victims.map(id => {
      const p = playerById(id);
      return `<button class="chip ${ui.victim === id ? 'on' : ''}" data-victim="${id}"><span class="dot" style="background:${colorHex(p.color)}"></span> ${esc(p.name)} (${p.cards})</button>`;
    }).join('')}</div>`;
  }
  const isVoid = selHex != null && view.board.hexes[selHex].kind === 'void';
  const ready = selHex != null && (victims.length <= 1 || ui.victim);
  return `${html}<button class="primary big" data-act="robber" ${ready ? '' : 'disabled'}>${selHex == null ? 'Tocca un settore' : `${isVoid ? 'Sposta i predoni' : 'Sposta la flotta'}${victims.length ? ' e ruba' : ''}`}</button>`;
}

// ---------- Scheda Gioco ----------

function handHtml() {
  return `<div class="hand cols-${cardTypes().length}">${cardTypes().map(r => {
    const n = view.me.hand[r];
    return `<div class="res ${n ? '' : 'zero'}" data-r="${r}"><div class="ic">${RESOURCE_INFO[r].icon}</div><div class="n">${n}</div><div class="lb">${RESOURCE_INFO[r].name}</div></div>`;
  }).join('')}</div>`;
}

function statusText() {
  const me = view.me;
  const cur = view.players[view.current];
  if (view.phase === 'ended') return view.winner === me.id ? '🏆 Hai vinto!' : `Partita finita: vince ${pname(view.winner)}`;
  if (view.phase === 'discard') return me.mustDiscard ? `Raid pirata! Scarta ${me.mustDiscard} carte` : 'Raid pirata: attendi gli scarti…';
  if (view.phase === 'extraBuild') return me.acting ? '🌠 Costruzione extra: puoi costruire' : `Costruzione extra di ${pname(view.actorId)}`;
  if (me.myTurn) {
    if (view.phase === 'setup') return view.setup.step === 'settlement' ? `Piazza un avamposto (giro ${view.setup.round})` : 'Piazza un\'iperlinea vicino al nuovo avamposto';
    if (view.phase === 'roll') return 'Tocca a te: tira i dadi!';
    if (view.phase === 'robber') {
      const kinds = new Set(me.legal.robberHexes.map(o => view.board.hexes[o.hex].kind === 'void' ? 'void' : 'land'));
      return kinds.has('land') && kinds.has('void') ? 'Sposta la flotta pirata o i predoni' : kinds.has('void') ? 'Sposta i predoni del vuoto' : 'Sposta la flotta pirata';
    }
    return 'Tocca a te';
  }
  return `Turno di ${pname(cur.id)} · <span class="muted">${PHASE_NAMES[view.phase]}</span>`;
}

function renderGame() {
  const me = view.me;
  const mine = (me.acting || me.mustDiscard) && view.phase !== 'ended';
  const pick = currentPick();
  const ev = view.event ? `<div class="eventbar">${view.event.icon} <b>${esc(view.event.name)}</b> · ${esc(view.event.desc)}</div>` : '';
  app.innerHTML = `
    <div class="top"><span class="dot" style="background:${colorHex(me.color)}"></span><span class="name">${esc(me.name)}</span>
      ${me.progress ? `<span class="muted">📜${me.progress.length}</span>` : `<span class="muted">🔬${me.devCards.length}</span>`}
      <span class="vp">★ ${me.vp}<small>/${view.winVp}</small></span></div>
    <div class="status ${mine ? 'mine' : ''}">${statusText()}</div>
    ${ev}
    ${handHtml()}
    <div class="map ${pick ? 'picking' : ''}">${renderBoard(view, { ...mapOptions(pick), compact: true })}
      <button class="map-zoom" data-tab-go="map" title="Mappa a tutto schermo">🔍</button></div>
    ${pick ? `<div class="panel pickbar">${pickControls(pick)}</div>` : ''}
    ${freePicksHtml()}
    ${pick ? '' : panelHtml()}`;
}

function freePicksHtml() {
  const n = view.me.freePicks;
  if (!n) return '';
  return `<div class="panel gift"><h3>🎁 Scegli ${n} risors${n > 1 ? 'e' : 'a'} in regalo</h3>
    <div class="chips">${RESOURCES.map(r => `<button class="chip" data-free="${r}" ${view.bank[r] > 0 ? '' : 'disabled'}>${RESOURCE_INFO[r].icon} ${RESOURCE_INFO[r].name}</button>`).join('')}</div></div>`;
}

function panelHtml() {
  const me = view.me;
  const ph = view.phase;
  if (ph === 'ended') return playersMini();
  if (me.mustDiscard) return discardPanel();
  if (!me.acting) return waitingPanel();
  if (ph === 'roll') return rollPanel();
  if (ph === 'discard') return `<div class="panel center muted">Attendi che gli altri giocatori scartino…</div>`;
  if (ph === 'main' || ph === 'extraBuild') return mainPanel();
  return '';
}

function rollPanel() {
  const me = view.me;
  if (ui.mode === 'predictive') {
    return `<div class="panel"><h3>Calcolo predittivo: scegli i dadi</h3>
      ${[0, 1].map(i => `<div class="chips">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip ${ui.dice[i] === n ? 'on' : ''}" data-die="${i}" data-val="${n}">${n}</button>`).join('')}</div>`).join('')}
      <div class="row"><button data-act="home">Annulla</button><button class="primary" data-act="play-predictive">Tira ${ui.dice[0]} + ${ui.dice[1]}</button></div></div>`;
  }
  const marines = canPlayDev('marines');
  const predictive = me.progress?.includes('predictive');
  return `<div class="panel"><button class="primary big" data-act="roll">🎲 Tira i dadi</button>
    ${marines ? `<button data-act="play" data-card="marines">🪖 Gioca Marines prima di tirare</button>` : ''}
    ${predictive ? `<button data-mode="predictive">🔮 Calcolo predittivo</button>` : ''}</div>`;
}

function canPlayDev(type) {
  const me = view.me;
  return !me.devPlayedThisTurn && me.devCards.some(c => c.type === type && c.playable);
}

function waitingPanel() {
  const t = view.trade;
  let offer = '';
  if (t && t.from !== view.me.id) {
    const r = t.responses[view.me.id];
    const canAcc = Object.entries(t.want).every(([res, n]) => (view.me.hand[res] || 0) >= n);
    offer = `<div class="panel offer"><h3>Proposta di ${pname(t.from)}</h3>
      <div class="big-line">Ti dà ${bundleHtml(t.give)}</div>
      <div class="big-line">Vuole ${bundleHtml(t.want)}</div>
      ${r === undefined ? `<div class="row"><button class="primary" data-act="accept" ${canAcc ? '' : 'disabled'}>✅ Accetta</button><button data-act="decline">❌ Rifiuta</button></div>
        ${canAcc ? '' : '<div class="note">Non hai le carte richieste.</div>'}`
        : `<div class="note">${r ? '✅ Hai accettato: in attesa di conferma' : '❌ Hai rifiutato'}</div>`}
    </div>`;
  }
  return `${offer}${myStatusPanel()}${playersMini()}`;
}

/** Riepilogo dei propri elementi di espansione (sempre visibile). */
function myStatusPanel() {
  const me = view.me;
  const rows = [];
  if (me.tracks) rows.push(`<div>Tracciati: ${Object.entries(TRACKS).map(([k, t]) => `${t.icon} ${t.name} <b>${me.tracks[k]}</b>`).join(' · ')}</div>`);
  if (view.convoys) {
    const u = view.convoys.units[me.id];
    const c = u.contract;
    const f = c && STATIONS.find(s => s.id === c.from), t = c && STATIONS.find(s => s.id === c.to);
    rows.push(`<div>🚚 Convoglio: 💰 ${me.credits} Fondi · punti commercio <b>${u.points}</b> · movimenti ${u.moves}</div>`);
    if (c) rows.push(`<div class="muted">Contratto: ${c.loaded ? '✅' : '⬜'} carica a ${f.icon} ${f.name} → consegna a ${t.icon} ${t.name}</div>`);
  }
  if (view.missions) rows.push(`<div>🍯 Nettare ${me.nectar} · 📦 Artefatti ${me.artifacts}</div>`);
  if (view.empires) rows.push(`<div class="muted">👾 Invasione ${view.empires.invasion}/${view.empires.length} · forza ${view.empires.strength} vs difesa ${view.empires.defense}</div>`);
  return rows.length ? `<div class="panel mystatus">${rows.join('')}</div>` : '';
}

function discardPanel() {
  const need = view.me.mustDiscard;
  const tot = Object.values(ui.discard).reduce((a, b) => a + b, 0);
  return `<div class="panel"><h3>Scegli ${need} carte da scartare (${tot}/${need})</h3>
    ${cardTypes().filter(r => view.me.hand[r] > 0).map(r => stepper('discard', r, ui.discard[r] || 0, view.me.hand[r])).join('')}
    <button class="primary big" data-act="discard" ${tot === need ? '' : 'disabled'}>Scarta</button></div>`;
}

function stepper(group, r, v, max) {
  return `<div class="stepper"><span class="ic">${RESOURCE_INFO[r].icon}</span>
    <span>${RESOURCE_INFO[r].name}${max != null ? ` <span class="own">(hai ${view.me.hand[r]})</span>` : ''}</span>
    <button data-step="${group}" data-r="${r}" data-d="-1" ${v <= 0 ? 'disabled' : ''}>−</button>
    <span class="v">${v}</span>
    <button data-step="${group}" data-r="${r}" data-d="1" ${max != null && v >= max ? 'disabled' : ''}>+</button></div>`;
}

function actBtn({ mode, act, title, sub, enabled = true, cls = '' }) {
  const attr = mode ? `data-mode="${mode}"` : `data-act="${act}"`;
  return `<button class="act ${cls}" ${attr} ${enabled ? '' : 'disabled'}><span class="t">${title}</span><span class="c">${sub || ''}</span></button>`;
}

function mainPanel() {
  const me = view.me;
  const L = me.legal;
  const m = ui.mode;
  if (m === 'trade') return tradePanel();
  if (m === 'bank') return bankPanel();
  if (m === 'cards') return cardsPanel();
  if (m === 'progress') return progressPanel();
  if (m === 'tracks') return tracksPanel();
  if (m === 'pickres') return pickPanel();
  if (m === 'target') return targetPanel();
  if (m === 'creditTrade') return creditPanel();

  const extra = view.phase === 'extraBuild';
  const left = me.piecesLeft;
  const build = [
    actBtn({ mode: 'road', title: BUILD_NAMES.road, sub: `${costHtml(me.costs.road)} · ${left.road}`, enabled: L.roads.length > 0 }),
    actBtn({ mode: 'settlement', title: BUILD_NAMES.settlement, sub: `${costHtml(me.costs.settlement)} · ${left.settlement}`, enabled: L.settlements.length > 0 }),
    actBtn({ mode: 'city', title: BUILD_NAMES.city, sub: `${costHtml(me.costs.city)} · ${left.city}`, enabled: L.cities.length > 0 }),
  ];
  if (!has('empires')) build.push(actBtn({ act: 'buy-dev', title: BUILD_NAMES.dev, sub: `${costHtml(me.costs.dev)} · ${view.devDeckCount}`, enabled: me.canBuy.dev }));
  if (has('deepspace')) build.push(actBtn({ mode: 'ship', title: '🚀 Astronave', sub: `${costHtml(COSTS.ship)} · ${left.ship}`, enabled: (L.ships || []).length > 0 }));
  if (has('empires')) {
    build.push(actBtn({ mode: 'guardian', title: '🛡️ Guardiano', sub: costHtml(COSTS.guardian), enabled: L.guardians.length > 0 }));
    build.push(actBtn({ mode: 'upgradeGuardian', title: '⬆️ Potenzia', sub: costHtml(COSTS.upgradeGuardian), enabled: L.upgradeGuardians.length > 0 }));
    build.push(actBtn({ mode: 'activateGuardian', title: '✨ Attiva', sub: costHtml(COSTS.activateGuardian), enabled: L.activateGuardians.length > 0 }));
    build.push(actBtn({ mode: 'shield', title: '🔰 Scudo', sub: `${costHtml(COSTS.shield)} · ${left.shield}`, enabled: L.shields.length > 0 }));
  }
  if (has('convoys')) {
    const u = view.convoys.units[me.id];
    build.push(actBtn({ act: 'engine', title: '🔧 Motori', sub: `${costHtml(COSTS.engine)} · ${u.engines}/2`, enabled: u.engines < 2 && Object.entries(COSTS.engine).every(([r, n]) => me.hand[r] >= n) }));
  }
  if (extra) {
    return `<div class="panel"><h3>Costruzione extra</h3><div class="grid2">${build.join('')}</div>
      <button class="primary big" data-act="pass-extra">Passa</button></div>`;
  }

  const actions = [
    actBtn({ mode: 'trade', title: '🤝 Scambia', sub: 'con gli altri giocatori', enabled: view.event?.type !== 'blackout' }),
    actBtn({ mode: 'bank', title: '🏦 Banca', sub: 'e stazioni commerciali' }),
  ];
  if (has('empires')) {
    actions.push(actBtn({ mode: 'tracks', title: '📈 Progresso', sub: Object.entries(TRACKS).map(([k, t]) => `${t.icon}${me.tracks[k]}`).join(' ') }));
    actions.push(actBtn({ mode: 'progress', title: '📜 Carte progresso', sub: `${me.progress.length}/4` }));
    if (L.guardianMoves.length) actions.push(actBtn({ mode: 'moveGuardian', title: '↔️ Muovi guardiano', sub: 'attivo da un turno' }));
    if (L.displace.length) actions.push(actBtn({ mode: 'displace', title: '⚔️ Scaccia guardiano', sub: 'avversario più debole' }));
    if (L.chase.length) actions.push(actBtn({ mode: 'chase', title: '☠️ Caccia i pirati', sub: 'con un guardiano' }));
  } else {
    actions.push(actBtn({ mode: 'cards', title: '🔬 Le mie carte', sub: `${me.devCards.length} · ${me.devCards.filter(c => c.playable).length} giocabili` }));
  }
  if (has('deepspace') && L.shipMoves?.length) actions.push(actBtn({ mode: 'moveShip', title: '🛸 Sposta astronave', sub: '1 volta per turno' }));
  if (has('convoys')) {
    const u = view.convoys.units[me.id];
    actions.push(actBtn({ mode: 'convoy', title: '🚚 Muovi convoglio', sub: `${u.moves} movimenti · 💰${me.credits}`, enabled: L.convoySteps.length > 0 }));
    actions.push(actBtn({ mode: 'creditTrade', title: '💰 Converti Fondi', sub: '2 → 1 risorsa', enabled: me.credits >= 2 && !me.creditTradeUsed }));
  }
  if (has('missions')) {
    if (L.crewHexes.length) actions.push(actBtn({ mode: 'crew', title: '🏴 Equipaggio', sub: costHtml(COSTS.crew), enabled: Object.entries(COSTS.crew).every(([r, n]) => me.hand[r] >= n) }));
    if (L.salvageHexes.length) actions.push(actBtn({ mode: 'salvage', title: '📦 Recupera relitto', sub: 'astronave accanto' }));
    if (me.artifacts > 0) actions.push(actBtn({ act: 'deliver-artifact', title: '🏛️ Consegna artefatto', sub: `${costHtml(COSTS.artifact)} · +1 PV`, enabled: Object.entries(COSTS.artifact).every(([r, n]) => me.hand[r] >= n) }));
    if (me.nectar >= 3) actions.push(actBtn({ act: 'deliver-nectar', title: '🍯 Consegna nettare', sub: '3 nettari · +1 PV' }));
  }
  return `<div class="panel"><h3>Costruisci</h3><div class="grid2">${build.join('')}</div>
    <h3>Azioni</h3><div class="grid2">${actions.join('')}</div>
    <button class="act danger wide" data-act="end"><span class="t">⏭️ Fine turno</span></button></div>
    ${myStatusPanel()}`;
}

function tradePanel() {
  const t = view.trade;
  if (t && t.from === view.me.id) {
    const others = view.players.filter(p => p.id !== view.me.id);
    return `<div class="panel offer"><h3>La tua proposta</h3>
      <div class="big-line">Dai ${bundleHtml(t.give)} · Chiedi ${bundleHtml(t.want)}</div>
      ${others.map(p => {
        const r = t.responses[p.id];
        return `<div class="row" style="align-items:center"><span><span class="dot" style="background:${colorHex(p.color)}"></span> ${esc(p.name)}</span>
          ${r === true ? `<button class="primary" data-confirm="${p.id}">Scambia ✅</button>` : `<span class="muted">${r === false ? '❌ rifiuta' : '⏳ in attesa'}</span>`}</div>`;
      }).join('')}
      <button data-act="cancel-trade">Annulla proposta</button></div>`;
  }
  const g = Object.values(ui.give).reduce((a, b) => a + b, 0), w = Object.values(ui.want).reduce((a, b) => a + b, 0);
  return `<div class="panel"><h3>Offri</h3>${cardTypes().map(r => stepper('give', r, ui.give[r] || 0, view.me.hand[r])).join('')}
    <h3>Chiedi</h3>${cardTypes().map(r => stepper('want', r, ui.want[r] || 0, null)).join('')}
    <div class="row"><button data-act="home">Indietro</button><button class="primary" data-act="offer" ${g && w ? '' : 'disabled'}>Proponi a tutti</button></div></div>`;
}

function bankPanel() {
  const me = view.me;
  return `<div class="panel"><h3>Dai (rapporto)</h3><div class="chips">${cardTypes().map(r =>
      `<button class="chip ${ui.bankGive === r ? 'on' : ''}" data-bgive="${r}" ${me.hand[r] >= me.ratios[r] ? '' : 'disabled'}>${me.ratios[r]}${RESOURCE_INFO[r].icon}</button>`).join('')}</div>
    <h3>Ricevi 1</h3><div class="chips">${cardTypes().map(r =>
      `<button class="chip ${ui.bankGet === r ? 'on' : ''}" data-bget="${r}" ${r === ui.bankGive || view.bank[r] < 1 ? 'disabled' : ''}>${RESOURCE_INFO[r].icon}</button>`).join('')}</div>
    <div class="row"><button data-act="home">Indietro</button><button class="primary" data-act="bank" ${ui.bankGive && ui.bankGet ? '' : 'disabled'}>Scambia</button></div></div>`;
}

function creditPanel() {
  return `<div class="panel"><h3>Converti 2 💰 Fondi in 1 risorsa</h3>
    <div class="chips">${RESOURCES.map(r => `<button class="chip" data-credit="${r}" ${view.bank[r] > 0 ? '' : 'disabled'}>${RESOURCE_INFO[r].icon} ${RESOURCE_INFO[r].name}</button>`).join('')}</div>
    <button data-act="home">Indietro</button></div>`;
}

function cardsPanel() {
  const me = view.me;
  const counts = {};
  for (const c of me.devCards) {
    counts[c.type] ??= { total: 0, playable: 0 };
    counts[c.type].total++;
    if (c.playable) counts[c.type].playable++;
  }
  const list = Object.entries(counts).map(([type, c]) => {
    const info = DEV_CARDS[type];
    const can = type !== 'relic' && c.playable > 0 && !me.devPlayedThisTurn;
    return `<div class="devcard"><div class="info"><div class="t">${info.name} ×${c.total}</div><div class="d">${info.desc}</div></div>
      ${type === 'relic' ? '<span class="muted">+1 PV</span>' : `<button class="primary" data-act="play" data-card="${type}" ${can ? '' : 'disabled'}>Gioca</button>`}</div>`;
  }).join('') || '<div class="note">Non hai carte tecnologia.</div>';
  const note = me.devPlayedThisTurn ? '<div class="note">Hai già giocato una carta in questo turno.</div>' : '<div class="note">Le carte appena comprate si giocano dal turno successivo.</div>';
  return `<div class="panel"><h3>Carte tecnologia</h3>${list}${note}<button data-act="home">Indietro</button></div>`;
}

function progressPanel() {
  const me = view.me;
  const list = me.progress.map((type, i) => {
    const info = PROGRESS_CARDS[type];
    const deckIcon = TRACKS[info.deck].icon;
    const disabled = info.when === 'roll' || (type === 'diplomacy' && !me.legal.diplomacy.length);
    return `<div class="devcard"><div class="info"><div class="t">${deckIcon} ${info.name}</div><div class="d">${info.desc}</div></div>
      <button class="primary" data-progress="${type}" data-idx="${i}" ${disabled ? 'disabled' : ''}>${info.when === 'roll' ? 'Prima del tiro' : 'Gioca'}</button></div>`;
  }).join('') || '<div class="note">Non hai carte progresso. Si pescano con il dado evento.</div>';
  return `<div class="panel"><h3>Carte progresso (${me.progress.length}/4)</h3>${list}<button data-act="home">Indietro</button></div>`;
}

function tracksPanel() {
  const me = view.me;
  const rows = Object.entries(TRACKS).map(([k, t]) => {
    const lvl = me.tracks[k];
    const why = me.legal.improve[k];
    const metroV = view.empires.metros[k];
    const metroOwner = metroV != null ? view.buildings[metroV]?.owner : null;
    return `<div class="trackrow"><div class="info"><div class="t">${t.icon} ${t.name}: livello <b>${lvl}</b>/5</div>
      <div class="pips">${[1, 2, 3, 4, 5].map(n => `<span class="${n <= lvl ? 'on' : ''}">${n}</span>`).join('')}</div>
      <div class="d">${t.perk}${metroOwner ? ` · Metropoli di ${pname(metroOwner)}` : ''}</div>
      ${why ? `<div class="d warn">${esc(why)}</div>` : ''}</div>
      <button class="primary" data-track="${k}" ${why === null ? '' : 'disabled'}>${lvl < 5 ? `+1 (${lvl + 1}${RESOURCE_INFO[t.commodity].icon})` : 'Max'}</button></div>`;
  }).join('');
  return `<div class="panel"><h3>Tracciati di progresso</h3>${rows}<button data-act="home">Indietro</button></div>`;
}

function pickPanel() {
  const c = ui.card;
  const pool = c.kind === 'commodity' ? COMMODITIES : c.kind === 'any' ? [...RESOURCES, ...(has('empires') ? COMMODITIES : [])] : RESOURCES;
  const need = c.count || 1;
  return `<div class="panel"><h3>${esc(c.title)}</h3>
    <div class="chips">${pool.map(r => {
      const n = ui.picks.filter(x => x === r).length;
      return `<button class="chip ${n ? 'on' : ''}" data-pick="${r}">${RESOURCE_INFO[r].icon} ${RESOURCE_INFO[r].name}${n > 1 ? ' ×2' : ''}</button>`;
    }).join('')}</div>
    ${need === 2 ? '<div class="note">Tocca due volte per prenderne 2 uguali; tocca ancora per azzerare.</div>' : ''}
    <div class="row"><button data-act="home">Annulla</button><button class="primary" data-act="play-picked" ${ui.picks.length === need ? '' : 'disabled'}>Gioca</button></div></div>`;
}

function targetPanel() {
  const c = ui.card;
  const myPublicVp = view.players.find(x => x.id === view.me.id).vp;
  const others = view.players.filter(p => p.id !== view.me.id).filter(p => {
    if (c.type === 'requisition') return p.vp > myPublicVp;
    if (c.type === 'spy') return (view.playerExtras?.[p.id]?.progressCount || 0) > 0;
    return true;
  });
  return `<div class="panel"><h3>${esc(c.title)}</h3>
    ${others.length ? `<div class="chips">${others.map(p => `<button class="chip" data-target="${p.id}"><span class="dot" style="background:${colorHex(p.color)}"></span> ${esc(p.name)} (${p.vp} PV)</button>`).join('')}</div>` : '<div class="note">Nessun bersaglio valido.</div>'}
    <button data-act="home">Annulla</button></div>`;
}

// ---------- Scheda Mappa ----------

function renderMapTab() {
  const full = boardBounds(view);
  if (!zoom) zoom = { scale: 1, cx: full[0] + full[2] / 2, cy: full[1] + full[3] / 2 };
  const pick = currentPick();
  const legend = Object.entries(TERRAIN).filter(([k]) => k !== 'nectar' || has('missions'))
    .map(([, t]) => `<span>${t.icon} ${t.name}${t.resource ? ` → ${RESOURCE_INFO[t.resource].icon}` : ''}</span>`).join('');
  app.innerHTML = `<div class="mapfull ${pick ? 'picking' : ''}" id="mapfull">${renderBoard(view, { ...mapOptions(pick), compact: true, viewBox: zoomBox(full) })}
      <div class="zoombar"><button data-zoom="1.4">＋</button><button data-zoom="0.7">－</button><button data-zoom="reset">⟲</button></div></div>
    ${pick ? `<div class="panel pickbar">${pickControls(pick)}</div>` : ''}
    <div class="panel legend"><h3>Legenda</h3>${legend}
      <span>☠️ Flotta pirata</span>${has('deepspace') ? '<span>👾 Predoni del vuoto · ❓ inesplorato</span>' : ''}
      <span>✦ 3:1 · icona 2:1 stazioni commerciali</span>
      ${has('empires') ? '<span>◆ Guardiano (numero = livello, pieno = attivo) · ⭐ Metropoli · anello = scudo</span>' : ''}
      ${has('convoys') ? '<span>🏭🔬🏛️ Stazioni industriali · 🚚 convoglio (📦 = carico)</span>' : ''}
      ${has('missions') ? '<span>🏴 Base pirata · 📦 Relitto · 🍯 Nettare</span>' : ''}</div>`;
  attachPanZoom(document.getElementById('mapfull'), full);
}

function zoomBox(full) {
  const w = full[2] / zoom.scale, h = full[3] / zoom.scale;
  return [zoom.cx - w / 2, zoom.cy - h / 2, w, h];
}

let suppressClick = false;
function attachPanZoom(el, full) {
  const svg = el.querySelector('svg');
  const pointers = new Map();
  let start = null;
  const apply = () => svg.setAttribute('viewBox', zoomBox(full).map(n => n.toFixed(1)).join(' '));
  const clamp = () => {
    zoom.scale = Math.min(5, Math.max(1, zoom.scale));
    const w = full[2] / zoom.scale, h = full[3] / zoom.scale;
    zoom.cx = Math.min(full[0] + full[2] - w / 2, Math.max(full[0] + w / 2, zoom.cx));
    zoom.cy = Math.min(full[1] + full[3] - h / 2, Math.max(full[1] + h / 2, zoom.cy));
  };
  const unitsPerPx = () => (full[2] / zoom.scale) / svg.getBoundingClientRect().width;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('.zoombar')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = { zoom: { ...zoom }, pts: new Map(pointers), moved: false };
  });
  el.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !start) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()], s0 = [...start.pts.values()];
    if (pts.length === 1 && s0.length === 1) {
      const dx = pts[0].x - s0[0].x, dy = pts[0].y - s0[0].y;
      if (Math.hypot(dx, dy) > 8) start.moved = true;
      if (!start.moved) return;
      zoom.cx = start.zoom.cx - dx * unitsPerPx();
      zoom.cy = start.zoom.cy - dy * unitsPerPx();
    } else if (pts.length === 2 && s0.length === 2) {
      start.moved = true;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const d0 = Math.hypot(s0[0].x - s0[1].x, s0[0].y - s0[1].y) || 1;
      zoom.scale = start.zoom.scale * d / d0;
    }
    clamp(); apply();
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (start?.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 50); }
    if (!pointers.size) start = null; else start = { zoom: { ...zoom }, pts: new Map(pointers), moved: true };
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { e.preventDefault(); zoom.scale *= e.deltaY < 0 ? 1.15 : 0.87; clamp(); apply(); }, { passive: false });
  el.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
    if (b.dataset.zoom === 'reset') zoom = { scale: 1, cx: full[0] + full[2] / 2, cy: full[1] + full[3] / 2 };
    else zoom.scale *= Number(b.dataset.zoom);
    clamp(); apply();
  });
}

// ---------- Scheda Schede (riassunti) ----------

function renderCardsTab() {
  const mods = ['base', ...MODULE_ORDER.filter(m => has(m))];
  const costRows = [
    ['road', view.me.costs.road], ['settlement', view.me.costs.settlement], ['city', view.me.costs.city],
    ...(has('empires') ? [] : [['dev', view.me.costs.dev]]),
    ...(has('deepspace') ? [['ship', COSTS.ship]] : []),
    ...(has('empires') ? [['guardian', COSTS.guardian], ['upgradeGuardian', COSTS.upgradeGuardian], ['activateGuardian', COSTS.activateGuardian], ['shield', COSTS.shield]] : []),
    ...(has('convoys') ? [['engine', COSTS.engine]] : []),
    ...(has('missions') ? [['crew', COSTS.crew], ['artifact', COSTS.artifact]] : []),
  ];
  const vpNote = { settlement: '1 PV', city: '2 PV' };
  const cards = mods.flatMap(m => RULES[m].summary.map(s => `<div class="sumcard"><h3>${RULES[m].icon} ${s.title}</h3><ul>${s.items.map(i => `<li>${i}</li>`).join('')}</ul></div>`)).join('');
  const full = mods.map(m => `<details class="rulesec"><summary>${RULES[m].icon} Regole complete: ${RULES[m].title}</summary>
    <div class="rules">${RULES[m].sections.map(s => `<h3>${s.title}</h3>${s.html}`).join('')}</div></details>`).join('');
  app.innerHTML = `<h2 class="tabtitle">📋 Schede riassuntive</h2>
    <div class="sumcard"><h3>🏗️ Costi</h3><table class="costs">${costRows.map(([k, c]) => `<tr><td>${BUILD_NAMES[k]}</td><td>${costHtml(c)}</td><td class="muted">${vpNote[k] || ''}</td></tr>`).join('')}</table></div>
    <div class="sumcard"><h3>🏆 Obiettivo</h3><ul><li>Vince chi arriva a <b>${view.winVp} PV</b> nel proprio turno</li>
      <li>Tu sei a <b>${view.me.vp} PV</b></li></ul></div>
    ${cards}${full}`;
}

// ---------- Interazione ----------

tabbar.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

app.addEventListener('click', e => {
  if (suppressClick) return;
  const el = e.target.closest('button, [data-vertex], [data-edge], [data-hex]');
  if (!el || el.disabled) return;
  const d = el.dataset;

  if (d.tabGo) { tab = d.tabGo; render(); window.scrollTo(0, 0); return; }
  if (d.vertex !== undefined) { ui.sel = { kind: 'vertex', id: Number(d.vertex) }; return selectTarget(); }
  if (d.edge !== undefined) { ui.sel = { kind: 'edge', id: Number(d.edge) }; return selectTarget(); }
  if (d.hex !== undefined) { ui.sel = { kind: 'hex', id: Number(d.hex) }; ui.victim = null; return selectTarget(); }
  if (d.color) { joinColor = d.color; document.querySelectorAll('.color').forEach(b => b.classList.toggle('on', b.dataset.color === joinColor)); return; }
  if (d.mode) { ui = { ...freshUi(), mode: d.mode }; if (tab !== 'game' && !['road', 'settlement', 'city'].includes(d.mode)) tab = 'game'; return render(); }
  if (d.step) {
    const obj = ui[d.step];
    obj[d.r] = Math.max(0, (obj[d.r] || 0) + Number(d.d));
    if (d.step === 'give' && obj[d.r]) ui.want[d.r] = 0;
    if (d.step === 'want' && obj[d.r]) ui.give[d.r] = 0;
    return render();
  }
  if (d.victim) { ui.victim = d.victim; return render(); }
  if (d.bgive) { ui.bankGive = d.bgive; if (ui.bankGet === d.bgive) ui.bankGet = null; return render(); }
  if (d.bget) { ui.bankGet = d.bget; return render(); }
  if (d.confirm) return send({ type: 'confirmTrade', with: d.confirm });
  if (d.free) return send({ type: 'pickFree', resource: d.free });
  if (d.credit) { send({ type: 'creditTrade', resource: d.credit }); ui = freshUi(); return; }
  if (d.track) return send({ type: 'improve', track: d.track });
  if (d.die !== undefined) { ui.dice[Number(d.die)] = Number(d.val); return render(); }
  if (d.target) {
    send({ type: 'playProgress', card: ui.card.type, target: d.target });
    ui = freshUi();
    return render();
  }
  if (d.progress) return playProgress(d.progress);
  if (d.pick) {
    const need = ui.card?.count || 1;
    if (need === 1) ui.picks = [d.pick];
    else {
      const n = ui.picks.filter(x => x === d.pick).length;
      if (n >= 2 || (n === 1 && ui.picks.length === 2)) ui.picks = ui.picks.filter(x => x !== d.pick);
      else if (ui.picks.length < 2) ui.picks.push(d.pick);
    }
    return render();
  }

  switch (d.act) {
    case 'join': {
      const name = document.getElementById('name').value.trim();
      if (!name) return toast('Inserisci un nome.');
      store.set('fs-name', name);
      socket.emit('join', { name, color: joinColor });
      break;
    }
    case 'start': socket.emit('start'); break;
    case 'leave': socket.emit('leave'); store.del('fs-token'); break;
    case 'home': ui = freshUi(); render(); break;
    case 'confirm-pick': {
      const pick = currentPick();
      if (!pick || !ui.sel) return;
      if (pick.stage === 'from') { ui.from = ui.sel.id; ui.sel = null; return render(); }
      send(pick.act(ui.sel.id));
      const stay = (ui.mode === 'road' && view.freeRoads > 1) || ui.mode === 'convoy';
      ui = { ...freshUi(), mode: stay ? ui.mode : 'home' };
      break;
    }
    case 'roll': send({ type: 'roll' }); break;
    case 'play-predictive': send({ type: 'playProgress', card: 'predictive', values: ui.dice }); ui = freshUi(); break;
    case 'robber': send({ type: 'moveRobber', hex: ui.sel.id, victim: ui.victim }); break;
    case 'discard': send({ type: 'discard', cards: clean(ui.discard) }); break;
    case 'buy-dev': send({ type: 'buyDev' }); break;
    case 'engine': send({ type: 'buildEngine' }); break;
    case 'pass-extra': send({ type: 'passExtra' }); break;
    case 'deliver-artifact': send({ type: 'deliverArtifact' }); break;
    case 'deliver-nectar': send({ type: 'deliverNectar' }); break;
    case 'end': send({ type: 'endTurn' }); break;
    case 'offer': send({ type: 'offerTrade', give: clean(ui.give), want: clean(ui.want) }); break;
    case 'cancel-trade': send({ type: 'cancelTrade' }); break;
    case 'accept': send({ type: 'respondTrade', accept: true, tradeId: view.trade.id }); break;
    case 'decline': send({ type: 'respondTrade', accept: false, tradeId: view.trade.id }); break;
    case 'bank': send({ type: 'bankTrade', give: ui.bankGive, get: ui.bankGet }); ui.bankGive = ui.bankGet = null; break;
    case 'play': {
      const card = d.card;
      if (card === 'rapid') { ui = { ...freshUi(), mode: 'pickres', card: { dev: true, type: card, title: 'Estrazione rapida: scegli 2 risorse', count: 2 } }; render(); }
      else if (card === 'embargo') { ui = { ...freshUi(), mode: 'pickres', card: { dev: true, type: card, title: 'Embargo: scegli la risorsa', count: 1 } }; render(); }
      else { send({ type: 'playDev', card }); ui = freshUi(); }
      break;
    }
    case 'play-picked': {
      const c = ui.card;
      if (c.dev) send(c.type === 'rapid' ? { type: 'playDev', card: 'rapid', resources: ui.picks } : { type: 'playDev', card: 'embargo', resource: ui.picks[0] });
      else send({ type: 'playProgress', card: c.type, resource: ui.picks[0] });
      ui = freshUi();
      render();
      break;
    }
  }
});

/** Tocco su un bersaglio: nelle mosse a due fasi il primo tocco sceglie direttamente il pezzo. */
function selectTarget() {
  const pick = currentPick();
  if (pick?.stage === 'from' && ui.sel && pick.targets.includes(ui.sel.id)) { ui.from = ui.sel.id; ui.sel = null; }
  render();
}

function playProgress(type) {
  const info = PROGRESS_CARDS[type];
  const withRes = { resmono: ['resource', 'Monopolio di risorsa: scegli la risorsa'], commono: ['commodity', 'Monopolio di merce: scegli la merce'], tradefleet: ['any', 'Flotta mercantile: scegli cosa scambiare 2:1'] };
  if (withRes[type]) { ui = { ...freshUi(), mode: 'pickres', card: { type, kind: withRes[type][0], title: withRes[type][1], count: 1 } }; return render(); }
  if (type === 'requisition' || type === 'spy') { ui = { ...freshUi(), mode: 'target', card: { type, title: `${info.name}: scegli il bersaglio` } }; return render(); }
  if (type === 'diplomacy') { ui = { ...freshUi(), mode: 'diplomacy' }; return render(); }
  send({ type: 'playProgress', card: type });
}

function clean(b) {
  return Object.fromEntries(Object.entries(b).filter(([, n]) => n > 0));
}
