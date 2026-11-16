# ✦ Frontiera Stellare

Gioco da tavolo di colonizzazione spaziale su esagoni per 2–6 giocatori.
**Il PC è il tabellone**, mentre **ogni telefono è la mano privata** di un giocatore. Basta il browser, senza installare app.

## Avvio

```bash
npm install
npm start
```

1. Sul PC apri **http://localhost:3000/board/**, meglio a schermo intero (F11) o collegato alla TV.
2. Nella sala d'attesa scegli le **impostazioni della partita** (vedi sotto).
3. Collega i telefoni alla **stessa rete Wi-Fi** del PC e inquadra il QR code.
4. Quando sono entrati tutti i giocatori previsti, premi **Inizia la partita**.

> **Windows**: al primo avvio il firewall chiede se consentire Node.js. Spunta **Reti private** e consenti,
> altrimenti i telefoni non riescono a collegarsi. Se il QR mostra un indirizzo sbagliato (VPN, WSL…),
> apri dal telefono `http://<IP-del-PC>:3000/hand/`. L'IP si trova con `ipconfig`.

Se un telefono si spegne o ricarica la pagina, rientra automaticamente al suo posto. "Nuova partita" mantiene le impostazioni.

## Impostazioni della partita (dal PC)

- **Numero di giocatori**: da 2 a 4, oppure fino a 6 con *Grande Galassia*. La partita parte quando sono entrati tutti.
- **Espansioni**: si attivano solo quelle spuntate.
- **Creazione della mappa**: *Completamente casuale* oppure *Nebulosa al centro*.
- **Punti vittoria per vincere**: da 5 a 20. Il valore consigliato si aggiorna con le espansioni scelte; puoi cambiarlo a mano.

## Giocare contro i bot

Nella sala d'attesa del PC, sotto l'elenco dei giocatori, scegli un livello e premi **🤖 Aggiungi bot**:
ogni bot occupa un posto libero (puoi anche giocare da solo contro 1–5 bot). Il ✕ accanto al nome lo rimuove.

| Livello | Come gioca |
|---|---|
| **Facile** | mosse legali quasi a caso |
| **Medio** | segue una strategia, ma con qualche imprecisione e mossa impulsiva |
| **Difficile** | sceglie i piazzamenti migliori (probabilità, varietà di risorse, porti), punta a colonie e avamposti, usa bene la flotta pirata e le carte |

I bot giocano sul server, con le stesse informazioni di un telefono (non vedono le mani degli altri), con una breve pausa
tra una mossa e l'altra così si seguono sul tabellone. **Scambiano** con la banca, **rispondono** alle tue offerte
(accettano solo se conviene loro e mai con chi sta per vincere) e **propongono** offerte: le vedi sul telefono e le
accetti o rifiuti come quelle degli altri giocatori (senza risposta l'offerta scade dopo ~20 secondi).
"Nuova partita" mantiene i bot al loro posto. La pausa tra le mosse si cambia con la variabile d'ambiente `BOT_DELAY` (ms).

## Espansioni

Sono moduli originali, ispirati ai classici tipi di espansione per questo genere di gioco:

| Modulo | Tipo | In breve |
|---|---|---|
| 🌠 **Grande Galassia** | 5–6 giocatori | Mappa da 30 settori, banca e mazzo più grandi, fase di costruzione extra a fine turno |
| 🚀 **Spazio profondo** | navigazione | Vuoto, sistemi esterni inesplorati, astronavi, predoni del vuoto, +2 PV per ogni nuovo sistema colonizzato |
| 🛡️ **Imperi e Invasione** | colonie e difesa | Merci, tre tracciati di progresso, metropoli, guardiani, scudi, dado evento, invasione aliena, carte progresso |
| 🚚 **Convogli mercantili** | commercio | Stazioni industriali, convogli sulle iperlinee, pedaggi in Fondi, contratti di consegna |
| 🏴 **Missioni di frontiera** | esplorazione | Richiede Spazio profondo: basi pirata, relitti alieni, nettare stellare |
| ☄️ **Eventi cosmici** | eventi | Una carta evento a ogni tiro (tempeste solari, mercati, tregue…) |

Le espansioni si possono combinare tutte insieme.

## Regole e schede

- **Dal PC**: il pulsante **📖 Regole** nel banner apre il regolamento completo del gioco base e di ogni espansione (le espansioni attive sono segnalate). Il pulsante è disponibile anche in sala d'attesa.
- **Dal telefono**: la barra in basso ha tre schede:
  - **🎮 Gioco**: la tua mano, la **mappa sempre visibile** (che diventa interattiva quando devi piazzare qualcosa) e le azioni;
  - **🗺️ Mappa**: la mappa a tutto schermo con zoom (pizzica o tasti +/−), trascinamento e legenda;
  - **📋 Schede**: schede riassuntive con costi, turno, bonus e una scheda per ogni espansione attiva, più il regolamento completo.

Il testo del regolamento è in `public/shared/rules.js`.

## Struttura del progetto

```
server/index.js            server Express + Socket.IO, QR, impostazioni, riconnessione
server/engine/             motore di gioco puro (testato)
  board.js                 layout base / 30 settori / spazio profondo, grafo vertici-lati
  rules.js                 piazzamento, costi, scambi
  game.js                  macchina a stati, azioni, sistema di hook per i moduli
  longestRoad.js           rotta più lunga (iperlinee + astronavi)
  view.js                  vista pubblica (tabellone) e privata (telefono)
  modules/                 galaxy, deepspace, empires, convoys, missions, events
server/bots/               bot giocatori: easy (casuale), strategy (medio/difficile), index (scelta del livello)
public/board/              tabellone e impostazioni (PC)
public/hand/               mano del giocatore (telefono)
public/shared/             costanti, renderer SVG, regolamento
test/                      test del motore, dei moduli, partite simulate e test via socket
```

Il server è autoritativo: i telefoni inviano azioni, il server le valida e invia a ciascuno solo
ciò che può vedere. Le mani degli altri non arrivano mai ai telefoni né al tabellone.

## Test

```bash
npm test
```

Ci sono test unitari per ogni regola ed espansione. Un bot gioca poi partite complete con ogni combinazione
di moduli usando solo mosse legali, e si verifica che nessuna mossa venga rifiutata e che le risorse si conservino.
I bot giocatori hanno test propri (`test/bots.test.js`): partite complete per ogni espansione e verifica che il livello
Difficile vinca più spesso del Facile.
Infine partite vere via Socket.IO (anche un telefono contro 3 bot) (gioco base e tutte le espansioni) controllano privacy, riconnessione e impostazioni.
