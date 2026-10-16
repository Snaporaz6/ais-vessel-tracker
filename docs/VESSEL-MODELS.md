# Modelli nave 3D — aggiornamento 16 ottobre 2026

La mappa mostra modelli WebGL leggeri da zoom 13. «Navi 3D» e «Ombre» sono attivi per impostazione predefinita e conservati nel browser; sul telefono si trovano nel menu hamburger. Da lontano, con il livello disattivato o in caso di errore grafico restano le icone esistenti.

## Sagome e dimensioni

Otto geometrie procedurali condivise coprono tutte le categorie dei filtri. Le sette illustrazioni JPG fornite dall'utente sono i riferimenti visivi per scafo e sovrastrutture; non vengono caricate come texture dei modelli. «Altro» usa una sagoma neutra. Colori dei filtri e dei modelli provengono dalla stessa tabella.

| Categoria     | Colore        | Riferimento                                     | Lunghezza nominale senza metadati |
| ------------- | ------------- | ----------------------------------------------- | --------------------------------: |
| Cargo         | Verde         | `cargo.jpg`, ponte a poppa e container          |                             180 m |
| Petroliera    | Arancione     | `tanker.jpg`, serbatoi e tubazioni              |                             170 m |
| Passeggeri    | Blu           | `passenger.jpg`, ponti e scialuppe              |                             140 m |
| Pesca         | Ciano         | `fishing.jpg`, ponte e attrezzatura di pesca    |                              30 m |
| Rimorchiatore | Viola         | `tug.jpg`, parabordi e ponte compatto           |                              24 m |
| Diporto       | Rosa          | `pleasure.jpg`, cabina a terrazze               |                              32 m |
| Militare      | Grigio        | `military.jpg`, sovrastruttura angolare e radar |                             130 m |
| Altro         | Grigio chiaro | Scafo generico                                  |                              40 m |

Le dimensioni AIS disponibili hanno precedenza; in loro assenza si usano le dimensioni nominali di categoria. Dal 16 ottobre la scala è volutamente compressa: pesca, rimorchiatori e diporto sono più grandi e leggibili rispetto alla prima versione proporzionale, conservando una differenza rispetto alle grandi navi. Il riferimento cargo varia fra 84 e 144 pixel desktop (68–112 mobile), con rapporto fra le lunghezze elevato a 0,55 e minimo di 30 pixel (26 mobile). La scala non cambia quando entra nella vista una nave più grande. Le sagome non rappresentano l'impronta fisica della nave.

## Orientamento e costa

- Prua AIS valida (`heading`, incluso 0°) prioritaria. La rotta di movimento (`course`) viene usata soltanto con velocità almeno 1 kn. Nessuna prua fissata arbitrariamente a nord: da ferme o con dati non validi, le navi senza prua hanno un simbolo senza orientamento. Anche selezione e aggiornamento della traccia conservano la prua ricevuta.
- La risposta `/api/map/live` è estesa con `heading`, `length`, `width`, già presenti nei dati in memoria del backend. Campi facoltativi nel contratto, nessuna nuova richiesta per nave, query al database o migrazione; frontend compatibile con risposte precedenti.
- I poligoni acqua della cartografia già caricata controllano centro e bordo dello scafo. Vicino ai moli si riduce il modello finché rientra nell'acqua; sotto 20 pixel o con punto sulla terra resta il simbolo semplice. Nessuna rotazione automatica verso il molo, nessuno spostamento delle coordinate AIS.
- Il controllo dipende dai poligoni acqua disponibili e dal loro dettaglio. In assenza della cartografia il vincolo costiero non viene applicato. Non corregge posizioni AIS inesatte né garantisce un allineamento esatto al singolo ormeggio; non sono disponibili gli scostamenti fra antenna e centro dello scafo.
- Poligoni riutilizzati fra i disegni, lettura dopo movimento/caricamento cartografico e cache dei risultati limitata a 512 elementi. Nessuna nuova sorgente o texture della costa.

## Materiale e ombre

Finitura satinata ispirata al vetro opaco: riflesso ampio e tenue, schiarimento sui bordi e opacità del 95%. I colori delle categorie restano riconoscibili. Nessuna rifrazione o sfocatura dello sfondo: l'effetto si calcola nello shader senza texture o passaggi aggiuntivi sullo schermo.

Illuminazione direzionale stilizzata, fissa rispetto al modello, con ombre delle sovrastrutture sullo scafo. Le ombre usano un unico atlante di profondità e un filtro di nove campioni; l'atlante viene generato una volta, senza ricalcolarlo per ogni nave o fotogramma. Non simula il sole del luogo e dell'ora osservata e non proietta ombre sull'acqua. «Ombre» disattiva le ombre geometriche, conservando la normale illuminazione del volume.

## Rendering e interazioni

- Livello personalizzato MapLibre nel suo contesto WebGL2: nessun secondo canvas, motore 3D o nuova dipendenza. Caricamento del modulo e allocazione delle risorse soltanto al primo zoom ravvicinato con livello attivo.
- Massimo 96 modelli nella vista desktop, 32 sul telefono; priorità alla nave selezionata e al cursore della traccia. Le altre navi restano visibili come icone. Filtri di categoria applicati alle navi live.
- Geometrie GPU riutilizzate, nessun ciclo di animazione permanente. Disegno sui cambi di camera, dati e timeline già previsti dalla mappa. Proiezioni piana e globo supportate.
- Posizioni e orientamento da AIS; nessuna interpolazione nei vuoti della traccia. Il modello sostituisce la freccia del cursore, conservando etichetta, data e pulsante accessibile. Il riferimento quadrato all'ultima posizione durante lo storico resta distinto.
- Osservazioni oltre dieci minuti attenuate anche in 3D; le regole di opacità delle icone sottostanti vengono conservate, compresi eventuali punti meno recenti restituiti dall'API.
- Nome al passaggio del cursore, clic senza cambi di zoom. Indicatore rosso delle sanzioni conservato accanto ai modelli delle navi live. Le posizioni selezionate già escluse dalla sorgente live conservano il controllo sanzioni nella scheda.
- Risorse e ascoltatori rimossi alla chiusura della mappa; ritorno alle icone sul guasto e ripristino dopo perdita del contesto grafico. Nessun cambiamento alle API, all'acquisizione o alla copertura AIS mediterranea.

## Peso e verifiche

Le otto geometrie hanno 4.136 triangoli, 12.408 vertici e **347.424 byte** complessivi di buffer GPU. L'atlante 512×256 a 16 bit occupa **262.144 byte**. Circa **595 KiB** complessivi per queste due risorse condivise, non per nave. Programmi grafici, driver e MapLibre aggiungono memoria: questo conteggio non è una misura della RAM totale o delle prestazioni su dispositivi fisici.

Typecheck, lint e build frontend riusciti localmente. Anteprima browser del renderer reale con otto posizioni dimostrative, separata dal sito: controllati sagome, colori, proporzioni, ombre e proiezione globo; nessun errore grafico segnalato nella console osservata. Non sono stati aggiunti o eseguiti manualmente nuovi test automatici per questa funzione. Esito della pipeline preesistente e pubblicazione sono riportati in [STATUS.md](STATUS.md).

Il 16 ottobre sono riusciti lint e compilazioni frontend/backend. Verifica visiva locale delle barche ingrandite e di un porto dimostrativo: una nave con prua 90° e rotta 246° mantiene l'allineamento dato dalla prua, una nave ferma senza prua conserva il punto, una sagoma oltre il bordo dell'acqua viene sostituita dal punto. Clic sul modello confermato, senza cambio di camera. Questi scenari non sono dati AIS reali. Il precedente backend pubblico restituisce HTTP 404 «Application not found» e Railway dichiara il servizio fermo: nessun backend è stato ridistribuito; verifica con dati reali e attivazione dei nuovi campi API in attesa dell'ambiente corretto.
