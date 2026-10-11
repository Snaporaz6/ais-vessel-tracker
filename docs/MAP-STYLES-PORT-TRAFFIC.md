# Stili mappa, cache e traffico portuale — 11 ottobre 2026

## Interfaccia

- **Dark** predefinito; preferenza manuale salvata localmente.
- **Light**: terra grigia, mare bianco, pannelli chiari.
- **ECDIS ispirato**: terra gialla, mare azzurro, fasce di profondità panoramiche GEBCO/GMT. È uno stile illustrativo, non una carta ENC certificata.
- Il cambio modifica i colori dello stile MapLibre esistente: camera, selezione, tracce, sorgenti e interazioni restano montate.
- Le fasce GEBCO 2025 (6 minuti d'arco, generalizzate) sono derivate dallo stesso grid già documentato in GLOBAL-BATHYMETRY.md. Quattro intervalli: 0–200, 200–1.000, 1.000–4.000, 4.000–12.000 m. Tiles 0–5; nascoste a zoom 7 e superiori per evitare di presentarle come dettaglio costiero. La costa del grid può differire da quella della mappa di base. Manifest: `frontend/public/bathymetry/depth-bands-manifest.json`; import riproducibile: `scripts/import-bathymetry-bands.py`.

## Perché i livelli sparivano

Il precedente loader svuotava il GeoJSON prima di ogni richiesta, interrogava la vista esatta dopo ciascun movimento e ripeteva il caricamento ogni cinque minuti. La cache server durava 30 minuti ma coordinate/zoom diversi producevano chiavi nuove. Cambiare un filtro ricreava anche sorgenti e livelli non coinvolti.

Ora le sorgenti restano montate e le geometrie precedenti rimangono visibili durante il caricamento e in caso di errore. Le risposte di aree vicine vengono unite per ID della fonte, con limiti di memoria e scadenza. Un movimento dentro un'area già caricata non richiede nuovi dati. Le sorgenti disabilitate sono rimosse; una nuova area richiede il suo primo caricamento.

### Frequenze e limiti effettivi

| Dati | Riuso |
| --- | --- |
| Cartografia marina OSM/EMODnet per area | Fino alla fine del giorno UTC, massimo 24 ore; cache browser IndexedDB, memoria server/CDN e fetch Next.js alla fonte con chiave giornaliera |
| Snapshot NGA/VLIZ e fondali pubblicati con l'app | File della release, nessuna interrogazione al fornitore durante la visita; non diventano nuovi dataset automaticamente ogni giorno |
| Risposta parziale di un fornitore | 15 minuti, poi nuovo tentativo; conserva la geometria precedente |
| Warning NGA/MARAD | Blocchi UTC di 30 minuti; cache CDN e browser allineate alla stessa scadenza |
| UKMTO | Snapshot dichiarato, non un feed aggiornato ogni 30 minuti |
| Onde/correnti | 15 minuti e validità della previsione già documentata |
| Traffico portuale AIS | 60 secondi mentre la scheda è aperta; posizioni recenti entro 10 minuti |

Non è un download giornaliero completo dell'intero globo. È una cache giornaliera delle **aree consultate**, con rettangoli stabilizzati e deduplicazione. La cache Vercel è soggetta a limiti e sfratto: non garantisce una singola chiamata mondiale a un provider tra tutte le istanze. Non aggiunge scheduler, storage a pagamento né acquisizione AIS fuori Mediterraneo.

Il frontend controlla le scadenze ogni minuto quando visibile e quando cambia vista; questo controllo usa i dati locali validi. L'errore del provider resta esplicito. Gli avvisi conservati dopo un errore diventano non verificati, senza mantenere una classificazione di avviso attivo.

## Porti

Il catalogo NGA resta lo stesso a tutti gli zoom: le richieste Overpass aggiuntive non sostituiscono più i punti dei porti. Icone ad ancora senza soglia massima di zoom; etichette dal livello 6. Quando il punto NGA si trova nel mare della mappa di base, il renderer cerca la terra vicina (entro 80 px e 3 km), mostra l'ancora lì e un tratto verso la posizione originale. Le coordinate NGA rimangono nei dati; non viene inventata una banchina né modificato il catalogo. Se il dettaglio della mappa non è pronto o non trova terra vicina, conserva il punto NGA.

### Scheda AIS

Endpoint backend `/api/port-traffic/:id` con ID validato contro il catalogo NGA condiviso; proxy frontend `/api/port-traffic?id=...`. Non richiede migrazioni o modifiche alla sottoscrizione AIS.

- **Attese**: corrispondenza esatta della destinazione AIS con nome/UNLOCODE; metadati dichiarati nelle ultime 24 ore, posizione entro 10 minuti. Alias espliciti per Genova/Genoa, Napoli/Naples e Marseille/Marseilles. ETA dichiarata, non orario ufficiale del porto.
- **Arrivi rilevati**: inizio di una sosta di almeno 30 minuti, entro 3 km dal punto NGA, nelle ultime 48 ore.
- **Partenze rilevate**: termine di quella sosta, esclusi i termini incerti dovuti a vuoti di ricezione, nelle ultime 48 ore.
- **In porto / rada**: posizione entro 3 km e ultimi 10 minuti, ormeggiata/ancorata oppure velocità ≤0,5 kn. È presenza nelle vicinanze, non verifica dell'ormeggio né congestione ufficiale.
- Le query delle soste sono limitate per rettangolo e numero di risultati; errore archivio distinto da elenco vuoto. Massimo 200 righe per categoria, limite segnalato.
- Ricerca nome/MMSI/IMO, tipo, bandiera e intervallo di lunghezza; link alla nave, dimensioni e distanza diretta dall'ultima posizione. Elenchi indipendenti dalla vista e dai filtri AIS della mappa.
- Distanza diretta **non** equivale a rotta navigabile o tempo di percorrenza. Ultimo porto ufficiale, GT, DWT e anno di costruzione non disponibili dalla fonte AIS attuale; nessun dato commerciale copiato dallo screenshot.
- Fuori Mediterraneo la scheda dichiara l'assenza di copertura AIS della demo e offre le informazioni cartografiche/servizi NGA.

Fonti e licenze: [NGA World Port Index](https://msi.nga.mil/Publications/WPI), [GEBCO/GMT](https://www.generic-mapping-tools.org/remote-datasets/earth-gebco.html), [Next.js fetch cache](https://nextjs.org/docs/app/api-reference/functions/fetch). Il diagramma nautico allegato è un riferimento visivo; non viene ripubblicata cartografia C-MAP.
