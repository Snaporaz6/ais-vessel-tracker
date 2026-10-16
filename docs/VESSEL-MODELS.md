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

## Ormeggi, sovrapposizioni e osservazioni vecchie — 16 ottobre

- Dimensioni della versione ingrandita conservate: nessuna ulteriore riduzione delle piccole imbarcazioni. La sagoma rimane indicativa e non è un'impronta fisica.
- Le osservazioni oltre dieci minuti hanno una sagoma 2D attenuata. Il passaggio del cursore mostra la data; selezionando la nave si può vedere il modello, con il riferimento temporale della scheda e del marcatore. Questo evita di rappresentare come simultanee due navi osservate nello stesso ormeggio in momenti diversi. La traccia e le coordinate ricevute non vengono modificate.
- Ingombri di tutte le mesh, sovrastrutture comprese, verificati con assi separatori. In caso di sovrapposizione si cercano posizioni grafiche affiancate, con dimensioni invariate, entro 44 pixel desktop / 36 mobile e comunque 60 metri. Priorità alla nave selezionata e ai dati recenti; ordine MMSI stabile e riuso dell'offset precedente. Un puntino sulla posizione AIS e un collegamento tratteggiato rendono esplicito lo spostamento della sola sagoma. Se non c'è spazio sicuro nel raggio consentito resta l'icona 2D, senza forzare una mesh attraverso terra o altre navi.
- La prua AIS valida, incluso 0°, ha precedenza; la rotta si usa soltanto da 1 kn. Per una nave ferma senza prua, vicino a una costa cartografata, si stima l'asse parallelo alla riva. Per piccole barche in fila si ammette l'asse perpendicolare soltanto con almeno due vicine recenti, ferme, con prua ricevuta coerente: entro 60 m e con scarto trasversale fra le posizioni entro 12 m. Sono stime della rappresentazione, indicate da **≈** e «Orientamento stimato» al cursore; non sono nuovi dati AIS o una certificazione dell'ormeggio. La stima in mare aperto e l'orientamento ricavato da posizioni vecchie di altre barche sono esclusi.
- Poligoni acqua già caricati: controllo dei vertici, campioni sui lati, intersezioni con le rive e isole interne all'ingombro. I bordi delle tessere non vengono interpretati come moli. Il dettaglio del basemap può essere insufficiente e una riva non identifica da sola un porto: in assenza di evidenza si conserva il simbolo 2D senza direzione geografica.
- Icone 2D di categoria senza cornice anche per prua assente e budget 3D esaurito; nessuna categoria richiede di scaricare un modello. Le 16 immagini 64×64 e il piccolo indicatore ≈ sono generati una volta e condivisi: 266.240 byte di pixel non compressi, oltre alle risorse e alle copie gestite da MapLibre/driver.
- Disposizione ricalcolata sui dati, al termine dei movimenti della camera o al caricamento dell'acqua. Durante il movimento vengono riutilizzati gli ingombri; nessuna simulazione fisica o animazione permanente, nessuna richiesta aggiuntiva al provider. Limiti di 96 modelli desktop e 32 mobile conservati e conteggiati dopo i controlli geometrici.
- Le API produttive `57c8be9` espongono già prua, lunghezza e larghezza. Nessuna nuova modifica backend o migrazione. Gli scostamenti fra antenna AIS e centro scafo non sono ancora conservati; rimane un limite di precisione, insieme alla possibile inesattezza dei dati trasmessi.

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
- Risorse e ascoltatori rimossi alla chiusura della mappa; ritorno alle icone sul guasto e ripristino dopo perdita del contesto grafico. L'API live espone i tre campi già acquisiti; acquisizione e copertura AIS mediterranea conservate.

## Peso e verifiche

Le otto geometrie hanno 4.136 triangoli, 12.408 vertici e **347.424 byte** complessivi di buffer GPU. L'atlante 512×256 a 16 bit occupa **262.144 byte**. Circa **595 KiB** complessivi per queste due risorse condivise, non per nave. Programmi grafici, driver e MapLibre aggiungono memoria: questo conteggio non è una misura della RAM totale o delle prestazioni su dispositivi fisici.

Typecheck, lint e build frontend riusciti localmente. Anteprima browser del renderer reale con otto posizioni dimostrative, separata dal sito: controllati sagome, colori, proporzioni, ombre e proiezione globo; nessun errore grafico segnalato nella console osservata. Non sono stati aggiunti o eseguiti manualmente nuovi test automatici per questa funzione. Esito della pipeline preesistente e pubblicazione sono riportati in [STATUS.md](STATUS.md).

Il 16 ottobre sono riusciti lint e compilazioni frontend/backend. Verifica visiva locale delle barche ingrandite e di un porto dimostrativo: una nave con prua 90° e rotta 246° mantiene l'allineamento dato dalla prua, una nave ferma senza prua conserva il punto, una sagoma oltre il bordo dell'acqua viene sostituita dal punto. Clic sul modello confermato, senza cambio di camera. Questi scenari non sono dati AIS reali. Il precedente backend era fermo ed è stato poi riattivato dall'utente: gli endpoint sono tornati HTTP 200; versione e aggiornamento dei campi API sono riportati in [STATUS.md](STATUS.md).

Controllo finale anche sul sito pubblico il 16 ottobre: modello cargo GSL EFFIE visibile allo zoom ravvicinato e selezionabile; osservazione datata esplicitamente. Confermati 358 record live a Genova con i tre campi aggiuntivi, 185 con prua nota. Nessun ulteriore rilascio backend è stato eseguito perché la versione attiva li comprendeva già.
