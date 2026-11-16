// Regolamento: testo completo (PC) e schede riassuntive (telefono). Contenuto statico e fidato.

export const RULES = {
  base: {
    title: 'Gioco base',
    icon: '✦',
    sections: [
      {
        title: 'Obiettivo',
        html: `<p>Siete coloni ai confini della galassia. Raccogliete risorse, costruite iperlinee, avamposti e colonie.
        Vince chi raggiunge per primo i <b>punti vittoria (PV)</b> stabiliti nelle impostazioni, durante il proprio turno.</p>`,
      },
      {
        title: 'La mappa',
        html: `<p>La mappa è fatta di settori esagonali. Ognuno ha un numero da 2 a 12 e produce una risorsa quando i dadi danno quel numero:</p>
        <ul><li>🪨 <b>Fascia di asteroidi</b> → Minerale</li><li>☀️ <b>Campo solare</b> → ⚡ Energia</li>
        <li>💎 <b>Pianeta di cristallo</b> → Cristalli</li><li>🧊 <b>Luna ghiacciata</b> → 💧 Acqua</li>
        <li>🌿 <b>Mondo giungla</b> → Biomassa</li><li>🌌 <b>Nebulosa</b> → niente (lì parte la flotta pirata)</li></ul>
        <p>I puntini sotto il numero indicano quanto è probabile: 6 e 8 (in rosso) escono più spesso e non sono mai vicini.
        Con la modalità <i>Nebulosa al centro</i>, la nebulosa occupa il settore centrale.</p>`,
      },
      {
        title: 'Costruzioni',
        html: `<table><tr><th>Pezzo</th><th>Costo</th><th>Effetto</th></tr>
        <tr><td>Iperlinea</td><td>🪨 ⚡</td><td>Si costruisce sui lati e collega i tuoi edifici.</td></tr>
        <tr><td>Avamposto</td><td>🪨 ⚡ 💧 🌿</td><td>1 PV; produce 1 risorsa dai settori vicini.</td></tr>
        <tr><td>Colonia</td><td>💎💎💎 🌿🌿</td><td>Potenzia un avamposto: 2 PV e produzione doppia.</td></tr>
        <tr><td>Carta tecnologia</td><td>💎 💧 🌿</td><td>Pesca una carta dal mazzo.</td></tr></table>
        <p><b>Regola della distanza</b>: tra due edifici deve esserci almeno un incrocio libero. Un nuovo avamposto deve toccare una tua iperlinea.
        Pezzi a disposizione: 15 iperlinee, 5 avamposti, 4 colonie.</p>`,
      },
      {
        title: 'Preparazione',
        html: `<p>A turno ognuno piazza un avamposto e un'iperlinea (in ordine 1→N), poi un secondo avamposto con iperlinea
        in ordine inverso (N→1). Il secondo avamposto fornisce subito 1 risorsa per ogni settore vicino.</p>`,
      },
      {
        title: 'Il turno',
        html: `<ol><li><b>Tira i dadi</b>: tutti gli edifici accanto ai settori con quel numero producono.</li>
        <li><b>Commercia</b>: proponi scambi agli altri giocatori dal telefono, oppure scambia con la banca:
        4:1, oppure 3:1 o 2:1 se hai un edificio su una <b>stazione commerciale</b> (i cerchi sulla costa).</li>
        <li><b>Costruisci</b> e gioca al massimo una carta tecnologia, ma non quella comprata in questo turno.</li>
        <li><b>Fine turno</b>.</li></ol>`,
      },
      {
        title: 'Raid pirata (7)',
        html: `<p>Se esce 7 nessuno produce. Chi ha più di 7 carte ne scarta metà, arrotondando per difetto.
        Chi ha tirato sposta la <b>flotta pirata ☠️</b> su un altro settore, che smette di produrre, e ruba una carta a caso
        a un giocatore con un edificio lì.</p>`,
      },
      {
        title: 'Carte tecnologia',
        html: `<ul><li><b>Marines</b> (14): sposta la flotta pirata e ruba; si può giocare anche prima di tirare.</li>
        <li><b>Scorciatoia iperspaziale</b> (2): 2 iperlinee gratis.</li><li><b>Estrazione rapida</b> (2): 2 risorse a scelta dalla banca.</li>
        <li><b>Embargo</b> (2): scegli una risorsa e tutti ti cedono quelle che hanno.</li>
        <li><b>Reliquia aliena</b> (5): 1 PV nascosto fino a fine partita.</li></ul>`,
      },
      {
        title: 'Bonus',
        html: `<ul><li><b>Rete più estesa</b> (+2 PV): la prima rotta continua di almeno 5 tratti. Passa a chi ne fa una più lunga.
        Edifici e guardiani avversari interrompono la rete.</li>
        <li><b>Flotta più forte</b> (+2 PV): il primo a giocare 3 Marines. Passa a chi ne gioca di più.</li></ul>`,
      },
    ],
    summary: [
      { title: 'Turno', items: ['🎲 Tira i dadi → produzione', '🤝 Scambia con giocatori o banca (4:1, stazioni 3:1/2:1)', '🏗️ Costruisci, gioca 1 carta', '⏭️ Fine turno'] },
      { title: 'Il 7', items: ['Chi ha più di 7 carte ne scarta metà', 'Sposta la flotta pirata ☠️ e ruba 1 carta'] },
      { title: 'Bonus', items: ['Rete più estesa (≥5): +2 PV', 'Flotta più forte (≥3 Marines): +2 PV'] },
    ],
  },

  galaxy: {
    title: 'Grande Galassia',
    icon: '🌠',
    sections: [
      { title: 'Panoramica', html: `<p>Permette di giocare in <b>5 o 6</b>. La mappa ha 30 settori, 2 nebulose e 11 stazioni commerciali.
        La banca ha 24 carte per risorsa e il mazzo tecnologie ha 34 carte.</p>` },
      { title: 'Costruzione extra', html: `<p>Quando un giocatore termina il turno, ognuno degli altri, in ordine, può <b>costruire o comprare</b>
        con le carte che ha in mano. Durante questa fase non si commercia e non si giocano carte. Si chiude con <i>Passa</i>.</p>` },
    ],
    summary: [{ title: 'Grande Galassia', items: ['Dopo ogni turno: costruzione extra per gli altri', 'Niente scambi né carte nella fase extra'] }],
  },

  deepspace: {
    title: 'Spazio profondo',
    icon: '🚀',
    sections: [
      { title: 'Panoramica', html: `<p>Il sistema principale è circondato dal <b>vuoto</b>. Oltre ci sono sistemi esterni <b>inesplorati</b> (❓).
        Il piazzamento iniziale avviene solo nel sistema principale.</p>` },
      { title: 'Astronavi', html: `<p><b>Astronave</b>: ⚡ + 💧 (massimo 15). Si piazza sui lati che toccano il vuoto, collegata a un tuo edificio
        o a un'altra tua astronave. Si passa da iperlinee ad astronavi solo su un tuo edificio.
        Le astronavi contano per la Rete più estesa.</p>
        <p>Una volta per turno puoi <b>spostare</b> l'astronave all'estremità di una rotta aperta, purché non l'abbia costruita in questo turno.</p>` },
      { title: 'Esplorazione', html: `<p>Quando una tua iperlinea o astronave tocca un settore inesplorato, il settore si rivela
        e ricevi 1 risorsa del tipo scoperto. Il <b>primo avamposto in ogni sistema esterno</b> vale +2 PV.</p>` },
      { title: 'Predoni del vuoto', html: `<p>Con un 7 o con i Marines puoi spostare la flotta pirata su un settore di terra
        oppure i <b>predoni 👾</b> su un settore di vuoto. I predoni impediscono di costruire o spostare astronavi sui lati vicini
        e rubano a chi ha un'astronave lì.</p>` },
    ],
    summary: [{ title: 'Spazio profondo', items: ['Astronave: ⚡💧 sui lati del vuoto', '1 spostamento di astronave per turno', 'Esplora i settori ❓: +1 risorsa', 'Primo avamposto in un sistema esterno: +2 PV', 'Predoni 👾: bloccano e derubano le astronavi'] }],
  },

  empires: {
    title: 'Imperi e Invasione',
    icon: '🛡️',
    sections: [
      { title: 'Merci', html: `<p>Le colonie su asteroidi, pianeti di cristallo e campi solari producono 1 risorsa + 1 <b>merce</b>:
        🪙 Crediti (asteroidi), 🧬 Dati (cristallo), 🔥 Plasma (solare). Sugli altri settori una colonia produce 2 risorse.
        Le merci si scambiano e si rubano come le risorse.</p>` },
      { title: 'Tracciati di progresso', html: `<p>Tre tracciati: <b>Commercio</b> (🪙), <b>Scienza</b> (🧬) e <b>Difesa</b> (🔥).
        Passare al livello N costa N merci del tipo giusto e richiede almeno una colonia.</p>
        <ul><li>Livello 3 di Commercio: merci 2:1 con la banca. Livello 3 di Scienza: se un tiro non ti dà nulla, ricevi 1 risorsa a scelta.
        Livello 3 di Difesa: puoi portare i guardiani al livello 3.</li>
        <li>Il primo che arriva al livello 4 di un tracciato fonda la <b>Metropoli</b> su una sua colonia (+2 PV). Chi arriva al 5 la sottrae a chi è fermo al 4.</li></ul>` },
      { title: 'Dado evento e carte progresso', html: `<p>A ogni tiro si lancia anche un dado evento. Con l'<b>astronave aliena</b> (3 facce su 6) l'invasione avanza di 1.
        Con un <b>colore</b> (Commercio, Scienza o Difesa) pesca una carta progresso di quel tipo chi ha il tracciato almeno al livello 1
        e il primo dado non supera il suo livello + 1.
        Puoi avere al massimo 4 carte progresso; i punti vittoria si rivelano subito. Le carte progresso sostituiscono le carte tecnologia.</p>` },
      { title: 'Guardiani', html: `<p><b>Guardiano</b>: 🌿 + 🪨, su un incrocio libero della tua rete (massimo 2 per livello). Potenziamento: 🌿 + 🪨.
        Attivazione: 💧. Un guardiano attivo da almeno un turno può: spostarsi, scacciare un guardiano avversario più debole
        (che torna nella riserva) o scacciare la flotta pirata se le è accanto. Dopo l'azione torna inattivo. I guardiani interrompono le reti avversarie.</p>` },
      { title: 'Invasione aliena', html: `<p>Quando la flotta aliena arriva in fondo al tracciato (7 caselle) attacca.
        La sua <b>forza</b> è pari al numero di colonie in gioco; la <b>difesa</b> è la somma dei livelli dei guardiani attivi.</p>
        <ul><li>Se non ci sono colonie in gioco, gli invasori passano oltre: nessun PV e nessuna perdita.</li><li>Se la difesa vince o pareggia, il miglior difensore diventa <b>Difensore della galassia</b> (+1 PV). In caso di pari merito, ognuno dei migliori pesca una carta progresso Difesa.</li>
        <li>Se la difesa perde, chi ha contribuito meno perde una colonia, che torna avamposto. Le metropoli sono immuni e uno scudo assorbe l'attacco al posto della colonia.</li></ul>
        <p>Dopo l'attacco tutti i guardiani tornano inattivi. La flotta pirata resta ferma fino alla prima invasione; con Spazio profondo, con un 7 si possono comunque spostare i predoni del vuoto.</p>` },
      { title: 'Scudi planetari', html: `<p>⚡⚡ su una tua colonia (massimo 3): ogni scudo alza di 2 il limite di carte per il raid pirata.</p>` },
    ],
    summary: [
      { title: 'Imperi: merci', items: ['Colonia su 🪨 → +🪙, su 💎 → +🧬, su ☀️ → +🔥', 'Tracciato livello N = N merci', 'Livello 4 per primo = Metropoli (+2 PV)'] },
      { title: 'Imperi: invasione', items: ['Dado evento: 👾 avanza (7 = attacco)', 'Forza = colonie in gioco; difesa = guardiani attivi', 'Vittoria: miglior difensore +1 PV', 'Sconfitta: chi difende meno perde una colonia'] },
      { title: 'Guardiani', items: ['Schiera 🌿🪨 · Potenzia 🌿🪨 · Attiva 💧', 'Attivo da un turno: sposta / scaccia / caccia i pirati'] },
    ],
  },

  convoys: {
    title: 'Convogli mercantili',
    icon: '🚚',
    sections: [
      { title: 'Panoramica', html: `<p>Sulla mappa ci sono 3 <b>stazioni industriali</b>: 🏭 Fonderia, 🔬 Laboratorio e 🏛️ Capitale.
        Non si può costruire sul loro incrocio. Ogni giocatore ha un <b>convoglio</b> che parte dal suo primo avamposto, e 2 💰 Fondi.</p>` },
      { title: 'Movimento', html: `<p>Il convoglio si muove lungo le iperlinee esistenti, di chiunque siano, con 4 movimenti per turno.
        Sulle tue iperlinee viaggia gratis; su quelle altrui paga <b>1 Fondo di pedaggio</b> al proprietario.
        I <b>motori</b> (⚡ + 🪨, massimo 2) danno +2 movimenti ciascuno.</p>` },
      { title: 'Contratti', html: `<p>Ogni convoglio ha un contratto: <i>carica</i> alla stazione A e <i>consegna</i> alla stazione B.
        Ogni consegna dà 2 Fondi e 1 punto commercio; ogni 2 punti commercio = 1 PV. Una volta per turno puoi convertire 2 Fondi in 1 risorsa.</p>` },
    ],
    summary: [{ title: 'Convogli', items: ['4 movimenti/turno lungo le iperlinee', 'Iperlinee altrui: 1 💰 di pedaggio', 'Carica in A, consegna in B: +2 💰 e 1 punto', '2 punti commercio = 1 PV', 'Motori ⚡🪨: +2 movimenti'] }],
  },

  missions: {
    title: 'Missioni di frontiera',
    icon: '🏴',
    sections: [
      { title: 'Panoramica', html: `<p>Richiede <b>Spazio profondo</b>. Esplorando i sistemi esterni si possono scoprire basi pirata,
        relitti alieni e campi di nettare stellare.</p>` },
      { title: 'Basi pirata 🏴', html: `<p>Il settore non produce finché la base resta in piedi. Con un'astronave accanto puoi inviare
        <b>equipaggi</b> (🌿 + 🪨). Chi porta per primo 3 equipaggi distrugge la base: +2 PV e 2 risorse a scelta.</p>` },
      { title: 'Relitti alieni 📦', html: `<p>Con un'astronave accanto puoi recuperare l'artefatto.
        Consegnarlo al Consiglio costa 💧💧 ⚡ e vale +1 PV.</p>` },
      { title: 'Nettare stellare 🍯', html: `<p>Il campo di nettare produce <b>nettare</b> per gli edifici vicini quando esce il suo numero
        (2 per una colonia). Consegnare 3 nettari al Consiglio vale +1 PV.</p>` },
    ],
    summary: [{ title: 'Missioni', items: ['Base 🏴: 3 equipaggi (🌿🪨) = +2 PV', 'Relitto 📦: recupera, poi consegna (💧💧⚡) = +1 PV', 'Nettare 🍯: 3 nettari = +1 PV'] }],
  },

  events: {
    title: 'Eventi cosmici',
    icon: '☄️',
    sections: [
      { title: 'Panoramica', html: `<p>Dopo ogni tiro si pesca una carta evento, valida fino alla fine del turno e mostrata sul tabellone.
        Il mazzo ha 36 carte e si rimescola quando finisce.</p>` },
      { title: 'Le carte', html: `<ul>
        <li>🌞 <b>Tempesta solare</b> (3): i campi solari non producono.</li><li>☄️ <b>Pioggia di meteore</b> (3): asteroidi doppi.</li>
        <li>🌾 <b>Raccolto abbondante</b> (2): giungle doppie.</li><li>💥 <b>Cristalli instabili</b> (2): il cristallo non produce.</li>
        <li>📈 <b>Mercato in fermento</b> (3): tutti scambiano con la banca almeno 3:1.</li><li>🦠 <b>Epidemia</b> (2): tutti perdono 1 Biomassa.</li>
        <li>🔭 <b>Scoperta scientifica</b> (3): chi è di turno riceve 1 risorsa a scelta.</li><li>🎁 <b>Aiuti umanitari</b> (3): chi ha meno punti riceve 1 risorsa a scelta.</li>
        <li>🧳 <b>Ondata migratoria</b> (2): chi ha una colonia riceve 1 Acqua.</li><li>🕊️ <b>Tregua</b> (2): un 7 non provoca il raid.</li>
        <li>📵 <b>Blackout</b> (2): niente scambi tra giocatori.</li><li>🌀 <b>Corridoio gravitazionale</b> (2): iperlinee a 1 ⚡.</li>
        <li>⛈️ <b>Tempesta ionica</b> (2): la flotta pirata torna in una nebulosa.</li><li>✨ <b>Quiete cosmica</b> (5): nessun effetto.</li></ul>` },
    ],
    summary: [{ title: 'Eventi', items: ['Dopo ogni tiro si pesca un evento', 'Vale fino a fine turno', 'Guarda il tabellone per l\'evento attivo'] }],
  },
};
