# Nave selezionata e ultima posizione osservata — 14 ottobre 2026

Una nave cercata o aperta sulla mappa deve restare visibile alla sua ultima
posizione AIS disponibile quando la traccia è nascosta. Il simbolo porta l'orario
dell'osservazione; non implica che la nave si trovi ancora esattamente lì.

## Causa verificata

`/api/map/live` include soltanto posizioni entro dieci minuti (`LIVE_TTL_MS`).
Scheda e storico conservano osservazioni precedenti. Il vecchio frontend mostrava
il simbolo della nave assente dal live soltanto con la traccia attiva; nascondere
la traccia lo eliminava, anche se la scheda aveva una posizione valida.

RDO CONCORD, MMSI 636092919: ultima posizione 14 ottobre 18:25:52 UTC,
44.4047 / 8.8963, ormeggiata. Successiva osservazione 18:46:53 UTC, circa
21 minuti dopo. Alle 18:53 UTC il backend era operativo e riceveva altre navi
nell'area di Genova. Questo esclude un'interruzione generale in quel controllo;
non identifica la causa specifica del vuoto della singola nave. AIS Stream
segnala possibili interruzioni delle fonti e consegne mancanti:
[documentazione del servizio](https://aisstream.io/documentation).

## Comportamento corretto

- La scheda aggiorna separatamente l'ultima posizione selezionata ogni quindici
  secondi; la ricerca e i collegamenti diretti centrano la nave una sola volta.
- La mappa disegna un simbolo per quella posizione anche quando manca dal live,
  senza aggiungerla ai conteggi live. Una posizione live più nuova ha precedenza.
- La selezione esplicita mantiene il simbolo visibile anche fuori dai gruppi o
  dai filtri delle tipologie. Orario e coordinate restano quelli osservati.
- Una traccia valida usa il proprio cursore ed evita simboli duplicati. Nascondere
  lo storico, uno storico vuoto o un errore dell'archivio lasciano il punto selezionato.
- Chiudere la scheda rimuove il simbolo di selezione; un aggiornamento con posizione
  assente non inventa coordinate. La riproduzione storica continua a distinguere
  osservazioni precedenti e intervalli senza dati.

Nessuna modifica al backend, alla soglia live, all'acquisizione o agli archivi.
La finestra di qualificazione backend avviata il 14 ottobre resta valida.

## Verifiche

TypeScript, lint e build frontend riusciti. Cinque prove mirate riuscite:
ricerca con live vuoto, mostra/nascondi traccia, chiusura, storico vuoto/fallito,
aggiornamento/null della posizione, riproduzione mobile con vuoti. Due scenari
eseguiti su desktop e telefono; il test della timeline è soltanto mobile.
La [pipeline completa](https://github.com/Snaporaz6/ais-vessel-tracker/actions/runs/38619932247)
è riuscita sul commit `1231c0a`; PR [#16](https://github.com/Snaporaz6/ais-vessel-tracker/pull/16)
integrato in `main` (`a39d457`). Ramo di produzione aggiornato con fast-forward.
Vercel Production **Ready/success**, deployment `7074648038`, sorgente `a39d457`,
14 ottobre 2026 alle **21:06 italiane (19:06 UTC)**.

Prova sul sito pubblico con RDO CONCORD: senza traccia un simbolo selezionato;
con traccia un cursore e nessun duplicato; dopo “Nascondi traccia” torna un solo
simbolo selezionato. Osservazione aggiornata alle 19:10 UTC: il simbolo rimane
visibile anche nel controllo successivo delle 19:22 UTC, oltre la soglia live.
Il backend resta `c7c2a34`, operativo; nessuna ridistribuzione Railway.
La schermata della verifica è conservata con i rapporti locali, fuori da Git.
