# Mappa su mobile

Aggiornamento: 12 ottobre 2026.

## Interfaccia

- Fino a 900 px: ricerca e hamburger in alto. Lingua, tema, livelli, filtri, proiezione, zoom e stato dati sono nel menu.
- Un pannello alla volta, ancorato in basso, alto al massimo il 46% dello schermo anche in orizzontale. La mappa rimane interattiva; nessun oscuramento o blocco dei gesti sul resto della vista.
- La scheda nave presenta subito nome e azioni. Foto e crediti sono espandibili. «Riduci scheda» conserva la selezione; «Chiudi scheda» la rimuove.
- «Mostra traccia» sostituisce la scheda con la timeline. Cursore, periodo, riproduzione e centratura rimangono nello stesso pannello; copertura, legenda e spiegazioni sono nei dettagli. «Riduci traccia» conserva traccia e tempo scelto; «Nascondi traccia» li disattiva.
- I pulsanti «Nave» e «Traccia» riaprono i pannelli ridotti. Aprire il menu, i livelli, i filtri o un dettaglio cartografico nasconde il pannello precedente.
- Ricerca: risultati da tastiera o tocco, chiusura della tastiera dopo la scelta, chiusura dei risultati aprendo un pannello o toccando fuori. I risultati in attesa non riaprono il menu senza focus.
- Focus visibile, ritorno al menu dopo la chiusura, Escape, controlli principali di almeno 44 px e rispetto delle aree sicure del telefono.

## Dati e preferenze

Menu e pannelli condividono un coordinatore React; i controlli esistenti sono spostati nel menu tramite portal. Aprire o chiudere un menu non ricrea la mappa né cambia l'acquisizione, la cache o gli intervalli AIS. Il cambio di dimensione conserva i dettagli cartografici selezionati.

Tema, lingua, livelli e fondali mantengono le preferenze già previste. Le pagine complete conservano il tema e il ritorno alla nave. Un piccolo indicatore segnala demo, dati non aggiornati o l'area AIS Mediterraneo; i dettagli sono in «Stato dati». Fonti, licenze e limiti restano consultabili nei dettagli.

Il desktop mantiene i suoi controlli. Le descrizioni dei livelli sono più brevi anche sul desktop, con le spiegazioni complete nelle sezioni espandibili.

## Verifiche

Prove riproducibili in `tests/browser/mobile.spec.ts`: 360×740, 390×844 e 844×390; spazio libero, nessun overflow orizzontale, pannelli esclusivi, ricerca touch/tastiera, menu, lingua/tema, filtri/livelli, timeline e vuoti AIS, riduzione/riapertura, dettagli portuali e ritorno dalla pagina completa.

La suite usa dati dimostrativi e risposte locali controllate con il vero worker MapLibre. Controlla l'interazione e la geometria dei pannelli; non certifica il funzionamento di fonti esterne, né sostituisce una prova su dispositivi fisici. Esiti e pubblicazione in [STATUS.md](STATUS.md).
