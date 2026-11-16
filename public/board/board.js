import { renderBoard, colorHex } from '/shared/render.js';
import {
  RESOURCE_INFO, PHASE_NAMES, MIN_PLAYERS, MODULE_INFO, MODULE_ORDER, MAP_MODES,
  TRACKS, STATIONS, BOT_LEVELS, suggestedVp,
} from '/shared/constants.js';
import { RULES } from '/shared/rules.js';

const socket = io();
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let view = null;
let botLevel = 'medium'; // livello scelto per il prossimo bot
let joinInfo = null;
let lastDiceSeq = null;
let overlayClosed = false;
let rulesOpen = false;
let rulesTab = 'base';

socket.on('connect', () => socket.emit('hello', { role: 'board' }));
socket.on('state', v => { view = v; render(); });
socket.on('error-msg', toast);

fetch('/api/join-info').then(r => r.json()).then(j => { joinInfo = j; render(); });

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

const bundle = b => Object.entries(b).filter(([, n]) => n > 0).map(([r, n]) => `${n}${RESOURCE_INFO[r].icon}`).join(' ');
const playerById = id => view.players.find(p => p.id === id);
const has = m => view.settings.modules.includes(m);
const pname = id => { const p = playerById(id); return p ? `<b style="color:${colorHex(p.color)}">${esc(p.name)}</b>` : '?'; };

function render() {
  if (!view) return;
  renderBanner();
  if (view.phase === 'lobby') return renderLobby();
  $('#app').classList.remove('lobby-mode');
  $('#board-wrap').innerHTML = renderBoard(view) + diceHtml() + eventHtml() + tradeHtml();
  animateDice();
  renderSide();
  renderOverlay();
}

// ---------- Banner ----------

function renderBanner() {
  const cur = view.players[view.current];
  let status = '';
  if (view.phase === 'lobby') status = `<span class="phase">In attesa dei giocatori…</span>`;
  else if (view.phase === 'ended') status = `🏆 Vince ${pname(view.winner)}`;
  else if (view.phase === 'discard') {
    const names = Object.keys(view.discardPending).map(id => esc(playerById(id).name)).join(', ');
    status = `<span class="phase">${PHASE_NAMES.discard}</span> devono scartare: <b>${names}</b>`;
  } else if (view.phase === 'extraBuild') {
    status = `<span class="phase">Costruzione extra:</span> ${pname(view.actorId)}`;
  } else if (cur) {
    let what = PHASE_NAMES[view.phase];
    if (view.phase === 'setup') what = view.setup.step === 'settlement' ? `Piazza un avamposto (giro ${view.setup.round})` : 'Piazza un\'iperlinea';
    status = `<span class="dot" style="background:${colorHex(cur.color)}"></span><b>${esc(cur.name)}</b><span class="phase">${what}</span>`;
  }
  const right = view.phase === 'ended' ? '<button id="again-top">Nuova partita</button>' : view.turn ? `<span class="phase">Turno ${view.turn}</span>` : '';
  $('#banner').innerHTML = `<h1>✦ Frontiera <span>Stellare</span></h1><div class="status">${status}</div>
    <div class="right">${right}<button id="rules-btn">📖 Regole</button></div>`;
  $('#rules-btn').onclick = () => { rulesOpen = true; renderRules(); };
  const again = document.getElementById('again-top');
  if (again) again.onclick = () => socket.emit('new-game');
}

// ---------- Lobby e impostazioni ----------

function renderLobby() {
  $('#overlay').hidden = true;
  $('#side').innerHTML = '';
  $('#app').classList.add('lobby-mode');
  const s = view.settings;
  const slots = [];
  for (let i = 0; i < s.players; i++) {
    const p = view.players[i];
    slots.push(p
      ? `<div class="lp"><span class="dot" style="background:${colorHex(p.color)}"></span>${esc(p.name)}
          ${p.bot ? `<small class="bot-level">${BOT_LEVELS[p.bot]}</small>` : ''}
          ${p.connected ? '' : '<small style="color:var(--bad)">(disconnesso)</small>'}<button data-kick="${p.id}" title="Rimuovi">✕</button></div>`
      : `<div class="lp empty"><span class="dot"></span>Posto libero…</div>`);
  }
  const ready = view.players.length === s.players;
  const levels = Object.entries(BOT_LEVELS).map(([k, label]) =>
    `<button class="${k === botLevel ? 'on' : ''}" data-bot-level="${k}">${label}</button>`).join('');
  const botRow = ready ? '' : `<div class="add-bot"><span>🤖 Posto libero a un bot</span>
      <div class="seg">${levels}</div><button class="primary" id="add-bot">Aggiungi bot</button></div>`;
  const modules = MODULE_ORDER.map(m => {
    const info = MODULE_INFO[m];
    const on = s.modules.includes(m);
    return `<label class="mod ${on ? 'on' : ''}">
      <input type="checkbox" data-mod="${m}" ${on ? 'checked' : ''}>
      <span class="mi">${info.icon}</span>
      <span><b>${info.name}</b>${info.vp ? ` <small class="muted">(+${info.vp} PV)</small>` : ''}<br><small>${info.desc}</small>
      ${info.requires ? `<br><small class="warn">Richiede ${info.requires.map(r => MODULE_INFO[r].name).join(', ')}</small>` : ''}</span></label>`;
  }).join('');
  const mapModes = Object.entries(MAP_MODES).map(([k, label]) =>
    `<label class="radio"><input type="radio" name="mapMode" value="${k}" ${s.mapMode === k ? 'checked' : ''}> ${label}</label>`).join('');

  $('#board-wrap').innerHTML = `<div class="lobby">
    <div class="lobby-join">
      <div class="qr">${joinInfo ? `<img src="${joinInfo.qr}" alt="QR code per entrare">` : ''}</div>
      <div class="url">${joinInfo ? esc(joinInfo.url) : '…'}</div>
      <div class="hint">Inquadra il QR con il telefono, sulla stessa Wi-Fi di questo PC.</div>
      <h3>Giocatori ${view.players.length}/${s.players}</h3>
      <div class="players">${slots.join('')}</div>
      ${botRow}
      <button class="primary big" id="start" ${ready ? '' : 'disabled'}>🚀 Inizia la partita</button>
      ${ready ? '' : `<div class="hint">La partita inizia quando entrano ${s.players} giocatori.</div>`}
    </div>
    <div class="settings">
      <h2>⚙️ Impostazioni della partita</h2>
      <div class="set-row"><span>Numero di giocatori</span>
        <div class="stepper"><button data-players="-1" ${s.players <= Math.max(MIN_PLAYERS, view.players.length) ? 'disabled' : ''}>−</button>
        <b>${s.players}</b><button data-players="1" ${s.players >= view.maxPlayers ? 'disabled' : ''}>+</button></div></div>
      ${!has('galaxy') ? '<div class="hint small">Per 5–6 giocatori attiva <b>Grande Galassia</b>.</div>' : ''}
      <div class="set-row"><span>Punti vittoria per vincere</span>
        <div class="stepper"><button data-vp="-1" ${s.winVp <= 5 ? 'disabled' : ''}>−</button><b>${s.winVp}</b>
        <button data-vp="1" ${s.winVp >= 20 ? 'disabled' : ''}>+</button></div></div>
      <div class="hint small">${s.winVpAuto ? `Valore consigliato per le espansioni scelte.` : `Valore scelto a mano · <a href="#" id="vp-auto">usa il consigliato (${suggestedVp(s.modules)})</a>`}</div>
      <div class="set-row col"><span>Creazione della mappa</span><div class="radios">${mapModes}</div></div>
      <h3>Espansioni</h3>
      <div class="mods">${modules}</div>
    </div></div>`;

  $('#start').onclick = () => socket.emit('start');
  const addBot = document.getElementById('add-bot');
  if (addBot) addBot.onclick = () => socket.emit('add-bot', { level: botLevel });
  document.querySelectorAll('[data-bot-level]').forEach(b => b.onclick = () => { botLevel = b.dataset.botLevel; render(); });
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => socket.emit('kick', { playerId: b.dataset.kick }));
  document.querySelectorAll('[data-players]').forEach(b => b.onclick = () => socket.emit('settings', { players: s.players + Number(b.dataset.players) }));
  document.querySelectorAll('[data-vp]').forEach(b => b.onclick = () => socket.emit('settings', { winVp: s.winVp + Number(b.dataset.vp) }));
  const auto = document.getElementById('vp-auto');
  if (auto) auto.onclick = e => { e.preventDefault(); socket.emit('settings', { winVpAuto: true }); };
  document.querySelectorAll('input[name=mapMode]').forEach(r => r.onchange = () => socket.emit('settings', { mapMode: r.value }));
  document.querySelectorAll('[data-mod]').forEach(cb => cb.onchange = () => {
    const mods = new Set(s.modules);
    const m = cb.dataset.mod;
    if (cb.checked) {
      mods.add(m);
      for (const r of MODULE_INFO[m].requires || []) mods.add(r); // attiva le dipendenze
    } else {
      mods.delete(m);
      for (const [k, info] of Object.entries(MODULE_INFO)) if ((info.requires || []).includes(m)) mods.delete(k); // e disattiva chi dipende
    }
    const input = { modules: [...mods] };
    if (m === 'galaxy' && !cb.checked && s.players > 4) input.players = 4;
    socket.emit('settings', input);
  });
}

// ---------- Partita ----------

function diceHtml() {
  if (!view.dice?.values) return '';
  const [a, b] = view.dice.values;
  const ev = view.dice.event;
  const evFace = ev ? `<div class="die event" title="Dado evento">${ev === 'ship' ? '👾' : TRACKS[ev].icon}</div>` : '';
  return `<div class="dice"><div class="die ${has('empires') ? 'red' : ''}">${a}</div><div class="die">${b}</div>${evFace}
    <div class="sum ${view.dice.sum === 7 ? 'seven' : ''}">= ${view.dice.sum}${view.dice.sum === 7 ? ' ☠️' : ''}</div></div>`;
}

function eventHtml() {
  const e = view.event;
  if (!e) return '';
  return `<div class="event-card"><div class="ei">${e.icon}</div><div><b>${esc(e.name)}</b><br><small>${esc(e.desc)}</small></div></div>`;
}

function animateDice() {
  if (!view.dice?.values) return;
  if (view.dice.seq !== lastDiceSeq) {
    if (lastDiceSeq !== null) document.querySelectorAll('.die, .event-card').forEach(d => d.classList.add('rolling'));
    lastDiceSeq = view.dice.seq;
  }
}

function tradeHtml() {
  const t = view.trade;
  if (!t) return '';
  const resp = view.players.filter(p => p.id !== t.from).map(p => {
    const r = t.responses[p.id];
    return `${esc(p.name)}: ${r === true ? '✅' : r === false ? '❌' : '⏳'}`;
  }).join(' · ');
  return `<div class="trade-box"><div class="resp">Proposta di scambio di ${pname(t.from)}</div>
    <div class="row">Offre ${bundle(t.give)} → chiede ${bundle(t.want)}</div><div class="resp">${resp}</div></div>`;
}

function playerExtras(p) {
  const parts = [];
  const ex = view.playerExtras?.[p.id];
  if (ex) {
    parts.push(`<span title="Tracciati Commercio/Scienza/Difesa">🪙${ex.tracks.trade} 🧬${ex.tracks.science} 🔥${ex.tracks.defense}</span>`);
    parts.push(`<span title="Difesa attiva">🛡️ ${ex.defense}</span>`);
    parts.push(`<span title="Carte progresso">📜 ${ex.progressCount}</span>`);
  }
  if (view.convoys) {
    const u = view.convoys.units[p.id];
    parts.push(`<span title="Crediti del convoglio">💰 ${view.convoys.credits[p.id]}</span><span title="Punti commercio">🚚 ${u.points}</span>`);
  }
  if (view.missions) {
    const m = view.missions.players[p.id];
    if (m.nectar) parts.push(`<span title="Nettare">🍯 ${m.nectar}</span>`);
    if (m.artifacts) parts.push(`<span title="Artefatti">📦 ${m.artifacts}</span>`);
  }
  if (p.freePicks) parts.push(`<span class="badge" title="Risorse a scelta da prendere">🎁 ${p.freePicks}</span>`);
  return parts.join('');
}

function modulesPanel() {
  let html = '';
  if (view.empires) {
    const e = view.empires;
    const steps = Array.from({ length: e.length }, (_, i) => `<span class="step ${i < e.invasion ? 'on' : ''}">${i === e.length - 1 ? '👾' : ''}</span>`).join('');
    html += `<div class="card"><h2>🛡️ Invasione aliena</h2>
      <div class="track">${steps}</div>
      <div class="inv-stats"><span>Forza aliena <b>${e.strength}</b></span><span>Difesa <b class="${e.defense >= e.strength ? 'ok' : 'ko'}">${e.defense}</b></span></div>
      <div class="hint small">${e.firstInvasion ? 'La flotta pirata è libera di muoversi.' : 'La flotta pirata è ferma fino alla prima invasione.'}</div>
      <div class="metros">${Object.entries(TRACKS).map(([k, t]) => {
        const v = e.metros[k];
        const owner = v != null ? view.buildings[v]?.owner : null;
        return `<span>${t.icon} Metropoli ${t.name}: ${owner ? pname(owner) : '<span class="muted">libera</span>'}</span>`;
      }).join('')}</div></div>`;
  }
  if (view.convoys) {
    html += `<div class="card"><h2>🚚 Contratti</h2>${view.players.map(p => {
      const u = view.convoys.units[p.id];
      if (!u.contract) return '';
      const f = STATIONS.find(s => s.id === u.contract.from), t = STATIONS.find(s => s.id === u.contract.to);
      return `<div class="contract"><span class="dot" style="background:${colorHex(p.color)}"></span>${f.icon} ${f.name} → ${t.icon} ${t.name} ${u.contract.loaded ? '📦' : ''}</div>`;
    }).join('')}</div>`;
  }
  return html;
}

function renderSide() {
  const players = view.players.map((p, i) => {
    const badges = [];
    if (view.longestRoad.owner === p.id) badges.push(`<span class="badge">🛤️ Rete ${view.longestRoad.length}</span>`);
    if (view.largestArmy.owner === p.id) badges.push(`<span class="badge">🪖 Flotta</span>`);
    const isCur = (view.phase === 'extraBuild' ? view.actorId === p.id : i === view.current) && view.phase !== 'ended';
    return `<div class="player ${isCur ? 'current' : ''}">
      <span class="dot" style="background:${colorHex(p.color)}"></span>
      <span class="name">${esc(p.name)}${p.bot ? `<span class="botlvl" title="Bot">🤖 ${BOT_LEVELS[p.bot]}</span>` : ''}${p.connected ? '' : '<span class="off">disconnesso</span>'}</span>
      <span class="vp">${p.vp}</span>
      <span class="meta"><span title="Carte in mano">🃏 ${p.cards}</span>${has('empires') ? '' : `<span title="Carte tecnologia">🔬 ${p.devCards}</span><span title="Marines giocati">🪖 ${p.playedMarines}</span>`}${badges.join('')}</span>
      <span class="meta">${playerExtras(p)}</span>
    </div>`;
  }).join('');
  const bank = Object.entries(view.bank).map(([r, n]) => `<span title="${RESOURCE_INFO[r].name}">${RESOURCE_INFO[r].icon} ${n}</span>`).join('')
    + (has('empires') ? '' : `<span title="Carte tecnologia">🔬 ${view.devDeckCount}</span>`);
  const mods = view.settings.modules.map(m => `<span class="badge">${MODULE_INFO[m].icon} ${MODULE_INFO[m].name}</span>`).join(' ');
  const log = view.log.map(l => `<div>${esc(l.text)}</div>`).join('');
  $('#side').innerHTML = `
    <div class="card"><h2>Giocatori · obiettivo ${view.winVp} PV</h2>${players}</div>
    ${modulesPanel()}
    <div class="card"><h2>Banca</h2><div class="bank">${bank}</div>${mods ? `<div class="mods-active">${mods}</div>` : ''}</div>
    <div class="card"><h2>Diario di bordo</h2><div class="log">${log}</div></div>`;
}

function renderOverlay() {
  const ov = $('#overlay');
  if (view.phase !== 'ended') { ov.hidden = true; overlayClosed = false; return; }
  if (overlayClosed) return;
  const w = playerById(view.winner);
  const rows = [...view.players].sort((a, b) => b.vp - a.vp)
    .map(p => `<tr><td><span class="dot" style="background:${colorHex(p.color)}"></span> ${esc(p.name)}</td><td><b>${p.vp}</b> PV</td></tr>`).join('');
  ov.hidden = false;
  ov.innerHTML = `<div class="win"><h2>🏆 ${esc(w.name)} conquista la galassia!</h2><table>${rows}</table>
    <button class="primary" id="again">Nuova partita</button> <button id="close">Guarda il tabellone</button></div>`;
  $('#again').onclick = () => socket.emit('new-game');
  $('#close').onclick = () => { ov.hidden = true; overlayClosed = true; };
}

// ---------- Regolamento ----------

function renderRules() {
  const m = $('#rules-modal');
  if (!rulesOpen) { m.hidden = true; return; }
  m.hidden = false;
  const active = new Set(view?.settings.modules || []);
  const keys = ['base', ...MODULE_ORDER];
  const tabs = keys.map(k => `<button class="rtab ${k === rulesTab ? 'on' : ''}" data-rtab="${k}">${RULES[k].icon} ${RULES[k].title}
    ${k !== 'base' && active.has(k) ? '<span class="badge">attiva</span>' : ''}</button>`).join('');
  const r = RULES[rulesTab];
  m.innerHTML = `<div class="rules-box">
    <nav>${tabs}</nav>
    <article class="rules"><button class="close" id="rules-close">✕</button>
      <h2>${r.icon} ${r.title}</h2>${r.sections.map(s => `<h3>${s.title}</h3>${s.html}`).join('')}</article></div>`;
  m.querySelectorAll('[data-rtab]').forEach(b => b.onclick = () => { rulesTab = b.dataset.rtab; renderRules(); });
  $('#rules-close').onclick = () => { rulesOpen = false; renderRules(); };
  m.onclick = e => { if (e.target === m) { rulesOpen = false; renderRules(); } };
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; renderRules(); } });
