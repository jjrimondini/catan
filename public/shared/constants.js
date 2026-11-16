// Costanti condivise tra server, tabellone e telefoni.

export const RESOURCES = ['ore', 'energy', 'crystal', 'water', 'bio'];
export const COMMODITIES = ['credits', 'data', 'plasma']; // solo con "Imperi e Invasione"

export const RESOURCE_INFO = {
  ore:     { name: 'Minerale', icon: '🪨', color: '#a1887f' },
  energy:  { name: 'Energia',  icon: '⚡', color: '#ffb703' },
  crystal: { name: 'Cristalli', icon: '💎', color: '#c77dff' },
  water:   { name: 'Acqua',    icon: '💧', color: '#48cae4' },
  bio:     { name: 'Biomassa', icon: '🌿', color: '#52b788' },
  credits: { name: 'Crediti',  icon: '🪙', color: '#e9c46a' },
  data:    { name: 'Dati',     icon: '🧬', color: '#4cc9f0' },
  plasma:  { name: 'Plasma',   icon: '🔥', color: '#f77f00' },
};

// Tipi di settore -> risorsa prodotta
export const TERRAIN = {
  asteroids: { name: 'Fascia di asteroidi', resource: 'ore',     color: '#6d5d4b', accent: '#a1887f', icon: '🪨' },
  solar:     { name: 'Campo solare',        resource: 'energy',  color: '#c76b1a', accent: '#ffb703', icon: '☀️' },
  crystal:   { name: 'Pianeta di cristallo', resource: 'crystal', color: '#5a189a', accent: '#c77dff', icon: '💎' },
  ice:       { name: 'Luna ghiacciata',     resource: 'water',   color: '#1d6f8c', accent: '#90e0ef', icon: '🧊' },
  jungle:    { name: 'Mondo giungla',       resource: 'bio',     color: '#1b5e3f', accent: '#52b788', icon: '🌿' },
  nebula:    { name: 'Nebulosa',            resource: null,      color: '#241e4e', accent: '#7b6cf6', icon: '🌌' },
  nectar:    { name: 'Campo di nettare',    resource: null,      color: '#7a4a00', accent: '#ffd166', icon: '🍯' },
};

export const TERRAIN_RES = { asteroids: 'ore', solar: 'energy', crystal: 'crystal', ice: 'water', jungle: 'bio', nebula: null, nectar: null };

// Merce prodotta da una colonia ("Imperi e Invasione")
export const TERRAIN_COMMODITY = { asteroids: 'credits', crystal: 'data', solar: 'plasma' };

export const TERRAIN_COUNTS = { asteroids: 4, solar: 3, crystal: 3, ice: 4, jungle: 4, nebula: 1 };
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const COSTS = {
  road:       { ore: 1, energy: 1 },
  settlement: { ore: 1, energy: 1, water: 1, bio: 1 },
  city:       { crystal: 3, bio: 2 },
  dev:        { crystal: 1, water: 1, bio: 1 },
  ship:       { energy: 1, water: 1 },           // Spazio profondo
  guardian:   { bio: 1, ore: 1 },                // Imperi e Invasione
  upgradeGuardian: { bio: 1, ore: 1 },
  activateGuardian: { water: 1 },
  shield:     { energy: 2 },
  engine:     { energy: 1, ore: 1 },             // Convogli mercantili
  crew:       { bio: 1, ore: 1 },                // Missioni di frontiera
  artifact:   { water: 2, energy: 1 },
};

export const BUILD_NAMES = {
  road: 'Iperlinea',
  settlement: 'Avamposto',
  city: 'Colonia',
  dev: 'Carta tecnologia',
  ship: 'Astronave',
  guardian: 'Guardiano',
  upgradeGuardian: 'Potenzia guardiano',
  activateGuardian: 'Attiva guardiano',
  shield: 'Scudo planetario',
  engine: 'Motori del convoglio',
  crew: 'Equipaggio',
  artifact: 'Consegna artefatto',
};

export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4, ship: 15, shield: 3 };

export const DEV_CARDS = {
  marines:  { name: 'Marines', count: 14, desc: 'Sposta la flotta pirata e ruba una risorsa a un vicino.' },
  shortcut: { name: 'Scorciatoia iperspaziale', count: 2, desc: 'Costruisci 2 iperlinee gratis.' },
  rapid:    { name: 'Estrazione rapida', count: 2, desc: 'Prendi 2 risorse a scelta dalla banca.' },
  embargo:  { name: 'Embargo', count: 2, desc: 'Scegli una risorsa: tutti gli altri ti cedono quelle che hanno.' },
  relic:    { name: 'Reliquia aliena', count: 5, desc: '1 punto vittoria (resta nascosto fino alla fine).' },
};

export const PLAYER_COLORS = [
  { id: 'red',    name: 'Rosso',   hex: '#ff5d73' },
  { id: 'blue',   name: 'Azzurro', hex: '#4cc9f0' },
  { id: 'yellow', name: 'Giallo',  hex: '#ffd166' },
  { id: 'violet', name: 'Viola',   hex: '#b388ff' },
  { id: 'green',  name: 'Verde',   hex: '#06d6a0' },
  { id: 'orange', name: 'Arancio', hex: '#ff9f1c' },
];

// Livelli dei bot giocatori
export const BOT_LEVELS = { easy: 'Facile', medium: 'Medio', hard: 'Difficile' };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MAX_PLAYERS_GALAXY = 6;
export const WIN_VP = 10;
export const BANK_PER_RESOURCE = 19;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

// Moduli-espansione (metadati condivisi con l'interfaccia)
export const MODULE_INFO = {
  galaxy:    { name: 'Grande Galassia', icon: '🌠', vp: 0, desc: 'Da 5 a 6 giocatori: mappa di 30 settori e fase di costruzione extra fra un turno e l\'altro.' },
  deepspace: { name: 'Spazio profondo', icon: '🚀', vp: 3, desc: 'Sistemi stellari separati dal vuoto: astronavi, settori inesplorati e predoni del vuoto.' },
  empires:   { name: 'Imperi e Invasione', icon: '🛡️', vp: 3, desc: 'Merci, tracciati di progresso, metropoli, guardiani e un\'invasione aliena da respingere insieme.' },
  convoys:   { name: 'Convogli mercantili', icon: '🚚', vp: 2, desc: 'Stazioni industriali e convogli che consegnano contratti lungo le iperlinee, pagando pedaggi.' },
  missions:  { name: 'Missioni di frontiera', icon: '🏴', vp: 2, requires: ['deepspace'], desc: 'Nei sistemi esterni: basi pirata da distruggere, relitti alieni e campi di nettare stellare.' },
  events:    { name: 'Eventi cosmici', icon: '☄️', vp: 0, desc: 'A ogni tiro si pesca una carta evento che cambia produzione, scambi o regole del turno.' },
};
export const MODULE_ORDER = ['galaxy', 'deepspace', 'empires', 'convoys', 'missions', 'events'];

export const MAP_MODES = {
  random: 'Completamente casuale',
  center: 'Nebulosa al centro',
};

export function suggestedVp(modules) {
  return WIN_VP + modules.reduce((s, m) => s + (MODULE_INFO[m]?.vp || 0), 0);
}

export const PHASE_NAMES = {
  lobby: 'Sala d\'attesa',
  setup: 'Piazzamento iniziale',
  roll: 'Tiro dei dadi',
  discard: 'Raid pirata: scarti',
  robber: 'Sposta la flotta pirata',
  main: 'Commercio e costruzione',
  extraBuild: 'Costruzione extra',
  ended: 'Partita finita',
};

// ---- Imperi e Invasione ----
export const TRACKS = {
  trade:   { name: 'Commercio', commodity: 'credits', icon: '🪙', perk: 'Livello 3: scambi le merci con la banca 2:1.' },
  science: { name: 'Scienza',   commodity: 'data',    icon: '🧬', perk: 'Livello 3: quando un tiro non ti dà nulla ricevi 1 risorsa a scelta.' },
  defense: { name: 'Difesa',    commodity: 'plasma',  icon: '🔥', perk: 'Livello 3: puoi potenziare i guardiani al livello 3.' },
};
export const INVASION_LENGTH = 7;

export const PROGRESS_CARDS = {
  // Scienza
  orbital:    { deck: 'science', name: 'Ingegneria orbitale', count: 2, desc: 'Costruisci 2 iperlinee gratis.' },
  extractor:  { deck: 'science', name: 'Estrattore', count: 2, desc: 'Ricevi 2 Minerale.' },
  greenhouse: { deck: 'science', name: 'Bioserre', count: 2, desc: 'Ricevi 2 Biomassa.' },
  shieldgen:  { deck: 'science', name: 'Scudo prototipo', count: 2, desc: 'Uno scudo planetario gratis su una tua colonia.' },
  predictive: { deck: 'science', name: 'Calcolo predittivo', count: 2, desc: 'Prima di tirare: scegli tu il risultato dei due dadi.', when: 'roll' },
  medicine:   { deck: 'science', name: 'Medicina avanzata', count: 2, desc: 'Questo turno una colonia costa 2 Cristalli + 1 Biomassa.' },
  epochal:    { deck: 'science', name: 'Scoperta epocale', count: 1, desc: '+1 punto vittoria (si rivela subito).', vp: true },
  // Commercio
  resmono:    { deck: 'trade', name: 'Monopolio di risorsa', count: 3, desc: 'Scegli una risorsa: ogni avversario te ne dà fino a 2.' },
  commono:    { deck: 'trade', name: 'Monopolio di merce', count: 2, desc: 'Scegli una merce: ogni avversario te ne dà 1.' },
  tradefleet: { deck: 'trade', name: 'Flotta mercantile', count: 3, desc: 'Per questo turno scambi una risorsa o merce a scelta 2:1 con la banca.' },
  requisition:{ deck: 'trade', name: 'Requisizione', count: 3, desc: 'Prendi 2 carte a caso a un giocatore con più punti di te.' },
  windfall:   { deck: 'trade', name: 'Profitti inattesi', count: 2, desc: 'Ricevi 2 risorse a scelta.' },
  // Difesa
  commander:  { deck: 'defense', name: 'Comandante', count: 2, desc: 'Attiva gratis tutti i tuoi guardiani.' },
  training:   { deck: 'defense', name: 'Addestramento', count: 2, desc: 'Potenzia gratis un tuo guardiano.' },
  sabotage:   { deck: 'defense', name: 'Sabotaggio', count: 2, desc: 'Chi ha almeno i tuoi punti scarta metà delle carte.' },
  spy:        { deck: 'defense', name: 'Spia', count: 3, desc: 'Ruba una carta progresso a caso a un avversario.' },
  diplomacy:  { deck: 'defense', name: 'Diplomazia', count: 2, desc: 'Rimuovi un\'iperlinea aperta di un avversario.' },
  treaty:     { deck: 'defense', name: 'Trattato galattico', count: 1, desc: '+1 punto vittoria (si rivela subito).', vp: true },
};
export const PROGRESS_HAND_LIMIT = 4;

// ---- Convogli mercantili ----
export const STATIONS = [
  { id: 'foundry', name: 'Fonderia', icon: '🏭' },
  { id: 'lab',     name: 'Laboratorio', icon: '🔬' },
  { id: 'capital', name: 'Capitale', icon: '🏛️' },
];
export const CONVOY_BASE_MOVES = 4;

// ---- Eventi cosmici ----
export const EVENT_CARDS = {
  solarstorm: { name: 'Tempesta solare', count: 3, icon: '🌞', desc: 'I campi solari non producono in questo tiro.' },
  meteors:    { name: 'Pioggia di meteore', count: 3, icon: '☄️', desc: 'Le fasce di asteroidi producono il doppio in questo tiro.' },
  boom:       { name: 'Mercato in fermento', count: 3, icon: '📈', desc: 'Per questo turno tutti scambiano con la banca almeno 3:1.' },
  epidemic:   { name: 'Epidemia', count: 2, icon: '🦠', desc: 'Ogni giocatore perde 1 Biomassa, se ne ha.' },
  discovery:  { name: 'Scoperta scientifica', count: 3, icon: '🔭', desc: 'Il giocatore di turno riceve 1 risorsa a scelta.' },
  truce:      { name: 'Tregua', count: 2, icon: '🕊️', desc: 'Se esce il 7 non c\'è raid pirata in questo turno.' },
  aid:        { name: 'Aiuti umanitari', count: 3, icon: '🎁', desc: 'Chi ha meno punti riceve 1 risorsa a scelta.' },
  migration:  { name: 'Ondata migratoria', count: 2, icon: '🧳', desc: 'Chi possiede almeno una colonia riceve 1 Acqua.' },
  blackout:   { name: 'Blackout delle comunicazioni', count: 2, icon: '📵', desc: 'Niente scambi tra giocatori in questo turno.' },
  calm:       { name: 'Quiete cosmica', count: 5, icon: '✨', desc: 'Nessun effetto.' },
  gravity:    { name: 'Corridoio gravitazionale', count: 2, icon: '🌀', desc: 'Per questo turno le iperlinee costano solo 1 Energia.' },
  ionstorm:   { name: 'Tempesta ionica', count: 2, icon: '⛈️', desc: 'La flotta pirata torna in una nebulosa.' },
  harvest:    { name: 'Raccolto abbondante', count: 2, icon: '🌾', desc: 'I mondi giungla producono il doppio in questo tiro.' },
  unstable:   { name: 'Cristalli instabili', count: 2, icon: '💥', desc: 'I pianeti di cristallo non producono in questo tiro.' },
};
