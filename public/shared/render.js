// Rendering SVG del tabellone, condiviso tra PC e telefono.
import { TERRAIN, RESOURCE_INFO, PLAYER_COLORS, STATIONS } from './constants.js';

export const S = 60; // dimensione dell'esagono in unità SVG
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const colorHex = id => PLAYER_COLORS.find(c => c.id === id)?.hex || '#ccc';

function hexPoints(h, scale = 0.97) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${((h.x + Math.cos(a) * scale) * S).toFixed(1)},${((h.y + Math.sin(a) * scale) * S).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Limiti della mappa in unità SVG: [x, y, w, h]. */
export function boardBounds(view) {
  const b = view.board;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of b.hexes) {
    minX = Math.min(minX, h.x - 1); maxX = Math.max(maxX, h.x + 1);
    minY = Math.min(minY, h.y - 1.1); maxY = Math.max(maxY, h.y + 1.1);
  }
  for (const p of b.ports) {
    minX = Math.min(minX, p.x - 0.4); maxX = Math.max(maxX, p.x + 0.4);
    minY = Math.min(minY, p.y - 0.4); maxY = Math.max(maxY, p.y + 0.4);
  }
  const pad = 0.15;
  return [(minX - pad) * S, (minY - pad) * S, (maxX - minX + 2 * pad) * S, (maxY - minY + 2 * pad) * S];
}

function defs() {
  let g = '';
  for (const [k, t] of Object.entries(TERRAIN)) {
    g += `<radialGradient id="g-${k}" cx="40%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${t.accent}"/><stop offset="70%" stop-color="${t.color}"/><stop offset="100%" stop-color="#0b0c1e"/></radialGradient>`;
  }
  return `<defs>${g}
    <radialGradient id="g-hidden" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="#3a3f6b"/><stop offset="100%" stop-color="#161936"/></radialGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".7"/></filter>
  </defs>`;
}

const pcolor = (view, id) => colorHex(view.players.find(p => p.id === id)?.color);

/**
 * @param {object} view vista pubblica/privata
 * @param {object} opt { vertices:Set, edges:Set, hexes:Set (evidenziati e cliccabili), selected:{kind,id}, compact, viewBox }
 */
export function renderBoard(view, opt = {}) {
  const b = view.board;
  if (!b) return '';
  const hv = opt.vertices || new Set();
  const he = opt.edges || new Set();
  const hh = opt.hexes || new Set();
  const sel = opt.selected || {};
  const tr = opt.compact ? 26 : 18; // raggio dei bersagli toccabili
  const vb = opt.viewBox || boardBounds(view);

  let out = `<svg class="board-svg" viewBox="${vb.map(n => n.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${defs()}`;

  // Vuoto (sotto tutto)
  for (const h of b.hexes) {
    if (h.kind !== 'void') continue;
    const isHL = hh.has(h.id), isSel = sel.kind === 'hex' && sel.id === h.id;
    out += `<polygon points="${hexPoints(h)}" fill="#0c0f2e" fill-opacity=".55" stroke="${isSel ? '#fff' : isHL ? '#ffe066' : '#1f2560'}" stroke-width="${isSel ? 5 : isHL ? 3 : 1}" stroke-dasharray="${isHL || isSel ? '' : '3 5'}"/>`;
  }

  // Stazioni commerciali
  for (const port of b.ports) {
    const px = port.x * S, py = port.y * S;
    for (const v of port.vertices) {
      const vv = b.vertices[v];
      out += `<line x1="${px}" y1="${py}" x2="${vv.x * S}" y2="${vv.y * S}" stroke="#8ecae6" stroke-width="3" stroke-dasharray="4 4" opacity=".6"/>`;
    }
    const label = port.type === 'any' ? '3:1' : '2:1';
    const icon = port.type === 'any' ? '✦' : RESOURCE_INFO[port.type].icon;
    out += `<g filter="url(#shadow)"><circle cx="${px}" cy="${py}" r="19" fill="#13163a" stroke="#8ecae6" stroke-width="2"/>
      <text x="${px}" y="${py - 2}" class="port-icon" text-anchor="middle">${icon}</text>
      <text x="${px}" y="${py + 13}" class="port-label" text-anchor="middle">${label}</text></g>`;
  }

  // Settori di terra
  const markers = view.missions?.markers || {};
  for (const h of b.hexes) {
    if (h.kind === 'void') continue;
    const cx = h.x * S, cy = h.y * S;
    const isHL = hh.has(h.id);
    const isSel = sel.kind === 'hex' && sel.id === h.id;
    const stroke = isSel ? '#fff' : isHL ? '#ffe066' : '#0b0c1e';
    const sw = isSel ? 6 : isHL ? 4 : 3;
    if (h.hidden) {
      out += `<g class="hex"><polygon points="${hexPoints(h)}" fill="url(#g-hidden)" stroke="${stroke}" stroke-width="${sw}"/>
        <text x="${cx}" y="${cy + 12}" class="hex-hidden" text-anchor="middle">?</text></g>`;
      continue;
    }
    const t = TERRAIN[h.terrain] || TERRAIN.nebula;
    out += `<g class="hex ${isHL ? 'hl' : ''}">
      <polygon points="${hexPoints(h)}" fill="url(#g-${h.terrain || 'nebula'})" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${cx}" y="${cy - 18}" class="hex-icon" text-anchor="middle">${t.icon}</text>`;
    if (h.number) {
      const hot = h.number === 6 || h.number === 8;
      out += `<circle cx="${cx}" cy="${cy + 12}" r="17" fill="#f1ead8" stroke="#0b0c1e" stroke-width="1.5"/>
        <text x="${cx}" y="${cy + 18}" class="hex-num ${hot ? 'hot' : ''}" text-anchor="middle">${h.number}</text>`;
      const n = PIPS[h.number];
      for (let i = 0; i < n; i++) out += `<circle cx="${cx + (i - (n - 1) / 2) * 4.5}" cy="${cy + 24}" r="1.4" fill="${hot ? '#d62828' : '#333'}"/>`;
    }
    const m = markers[h.id];
    if (m) {
      const icon = m.type === 'base' ? '🏴' : '📦';
      out += `<g filter="url(#shadow)"><circle cx="${cx - 24}" cy="${cy - 18}" r="13" fill="#111" stroke="${m.type === 'base' ? '#e63946' : '#ffd166'}" stroke-width="2"/>
        <text x="${cx - 24}" y="${cy - 13}" text-anchor="middle" class="marker-icon">${icon}</text></g>`;
      if (m.type === 'base') {
        const crew = Object.entries(m.crew || {}).filter(([, n]) => n > 0);
        crew.forEach(([pid, n], i) => {
          out += `<circle cx="${cx - 34 + i * 12}" cy="${cy + 2}" r="6" fill="${pcolor(view, pid)}" stroke="#000"/><text x="${cx - 34 + i * 12}" y="${cy + 5}" text-anchor="middle" class="crew-num">${n}</text>`;
        });
      }
    }
    out += `</g>`;
  }

  // Flotta pirata e predoni
  if (view.robberHex != null) {
    const h = b.hexes[view.robberHex];
    out += `<g class="robber" filter="url(#shadow)"><circle cx="${h.x * S + 26}" cy="${h.y * S - 20}" r="15" fill="#111" stroke="#e63946" stroke-width="2.5"/>
      <text x="${h.x * S + 26}" y="${h.y * S - 14}" text-anchor="middle" class="robber-icon">☠️</text></g>`;
  }
  if (view.raidersHex != null && b.hexes[view.raidersHex]) {
    const h = b.hexes[view.raidersHex];
    out += `<g filter="url(#shadow)"><circle cx="${h.x * S}" cy="${h.y * S}" r="17" fill="#2b0a3d" stroke="#c77dff" stroke-width="2.5"/>
      <text x="${h.x * S}" y="${h.y * S + 7}" text-anchor="middle" class="raiders-icon">👾</text></g>`;
  }

  // Iperlinee
  for (const [e, owner] of Object.entries(view.roads || {})) {
    const ed = b.edges[e];
    const va = b.vertices[ed.a], vb2 = b.vertices[ed.b];
    out += `<line x1="${va.x * S}" y1="${va.y * S}" x2="${vb2.x * S}" y2="${vb2.y * S}" stroke="#0b0c1e" stroke-width="11" stroke-linecap="round"/>
      <line x1="${va.x * S}" y1="${va.y * S}" x2="${vb2.x * S}" y2="${vb2.y * S}" stroke="${pcolor(view, owner)}" stroke-width="7" stroke-linecap="round"/>`;
  }

  // Astronavi
  for (const [e, owner] of Object.entries(view.ships || {})) {
    const ed = b.edges[e];
    const va = b.vertices[ed.a], vb2 = b.vertices[ed.b];
    const mx = (va.x + vb2.x) / 2 * S, my = (va.y + vb2.y) / 2 * S;
    const ang = Math.atan2(vb2.y - va.y, vb2.x - va.x) * 180 / Math.PI;
    const c = pcolor(view, owner);
    out += `<line x1="${va.x * S}" y1="${va.y * S}" x2="${vb2.x * S}" y2="${vb2.y * S}" stroke="${c}" stroke-width="3" stroke-dasharray="3 5" opacity=".8"/>
      <g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${ang.toFixed(1)})" filter="url(#shadow)">
      <polygon points="16,0 -10,-8 -5,0 -10,8" fill="${c}" stroke="#0b0c1e" stroke-width="2"/></g>`;
  }

  // Lati evidenziati
  for (const e of he) {
    const ed = b.edges[e];
    const va = b.vertices[ed.a], vb2 = b.vertices[ed.b];
    const isSel = sel.kind === 'edge' && sel.id === e;
    out += `<line x1="${va.x * S}" y1="${va.y * S}" x2="${vb2.x * S}" y2="${vb2.y * S}" stroke="${isSel ? '#fff' : '#ffe066'}" stroke-width="${isSel ? 9 : 5}" stroke-linecap="round" class="${isSel ? '' : 'pulse'}" stroke-dasharray="${isSel ? '' : '6 5'}"/>`;
  }

  // Stazioni industriali (Convogli)
  for (const st of view.convoys?.stations || []) {
    if (st.vertex == null) continue;
    const vv = b.vertices[st.vertex];
    const info = STATIONS.find(s => s.id === st.id);
    out += `<g filter="url(#shadow)"><rect x="${vv.x * S - 15}" y="${vv.y * S - 15}" width="30" height="30" rx="7" fill="#f1ead8" stroke="#0b0c1e" stroke-width="2"/>
      <text x="${vv.x * S}" y="${vv.y * S + 7}" text-anchor="middle" class="station-icon">${info?.icon || '🏭'}</text></g>`;
  }

  // Edifici
  for (const [v, bl] of Object.entries(view.buildings || {})) {
    const vv = b.vertices[v];
    const c = pcolor(view, bl.owner);
    const x = vv.x * S, y = vv.y * S;
    if (bl.type === 'settlement') {
      out += `<g filter="url(#shadow)"><circle cx="${x}" cy="${y}" r="10" fill="${c}" stroke="#0b0c1e" stroke-width="2.5"/>
        <circle cx="${x}" cy="${y}" r="3.5" fill="#0b0c1e" opacity=".5"/></g>`;
    } else {
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; pts.push(`${x + Math.cos(a) * 15},${y + Math.sin(a) * 15}`); }
      if (bl.shield) out += `<circle cx="${x}" cy="${y}" r="21" fill="none" stroke="#8ecae6" stroke-width="3" opacity=".9"/>`;
      out += `<g filter="url(#shadow)"><polygon points="${pts.join(' ')}" fill="${c}" stroke="#0b0c1e" stroke-width="2.5"/>
        <circle cx="${x}" cy="${y}" r="6" fill="#fff" opacity=".85"/><circle cx="${x}" cy="${y}" r="3" fill="${c}"/></g>`;
      if (bl.metro) out += `<text x="${x}" y="${y - 17}" text-anchor="middle" class="metro-icon">⭐</text>`;
    }
  }

  // Guardiani
  for (const [v, g] of Object.entries(view.guardians || {})) {
    const vv = b.vertices[v];
    const c = pcolor(view, g.owner);
    const x = vv.x * S, y = vv.y * S;
    out += `<g filter="url(#shadow)"><polygon points="${x},${y - 13} ${x + 13},${y} ${x},${y + 13} ${x - 13},${y}" fill="${g.active ? c : '#1a1d45'}" stroke="${c}" stroke-width="3"/>
      <text x="${x}" y="${y + 5}" text-anchor="middle" class="guardian-num" fill="${g.active ? '#0b0c1e' : c}">${g.level}</text></g>`;
  }

  // Convogli
  const atVertex = {};
  for (const [pid, u] of Object.entries(view.convoys?.units || {})) {
    if (u.vertex == null) continue;
    const i = (atVertex[u.vertex] = (atVertex[u.vertex] || 0) + 1) - 1;
    const vv = b.vertices[u.vertex];
    const x = vv.x * S + 14 + i * 9, y = vv.y * S + 14 + i * 4;
    out += `<g filter="url(#shadow)"><circle cx="${x}" cy="${y}" r="10" fill="#0b0c1e" stroke="${pcolor(view, pid)}" stroke-width="3"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="convoy-icon">${u.contract?.loaded ? '📦' : '🚚'}</text></g>`;
  }

  // Vertici evidenziati
  for (const v of hv) {
    const vv = b.vertices[v];
    const isSel = sel.kind === 'vertex' && sel.id === v;
    out += `<circle cx="${vv.x * S}" cy="${vv.y * S}" r="${isSel ? 13 : 9}" fill="${isSel ? '#fff' : 'rgba(255,224,102,.35)'}" stroke="#ffe066" stroke-width="3" class="${isSel ? '' : 'pulse'}"/>`;
  }

  // Bersagli toccabili (trasparenti, sopra tutto)
  for (const e of he) {
    const ed = b.edges[e];
    const va = b.vertices[ed.a], vb2 = b.vertices[ed.b];
    out += `<line data-edge="${e}" class="target" x1="${va.x * S}" y1="${va.y * S}" x2="${vb2.x * S}" y2="${vb2.y * S}" stroke="transparent" stroke-width="${tr}"/>`;
  }
  for (const v of hv) {
    const vv = b.vertices[v];
    out += `<circle data-vertex="${v}" class="target" cx="${vv.x * S}" cy="${vv.y * S}" r="${tr}" fill="transparent"/>`;
  }
  for (const h of hh) {
    const hx = b.hexes[h];
    out += `<circle data-hex="${h}" class="target" cx="${hx.x * S}" cy="${hx.y * S}" r="${S * 0.75}" fill="transparent"/>`;
  }

  out += `</svg>`;
  return out;
}
