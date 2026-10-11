# Roadmap dei livelli globali della mappa

Aggiornata l’**11 ottobre 2026**. Questo documento raccoglie le funzionalità richieste e i suggerimenti discussi nella chat. Le voci spuntate sono implementate nel frontend, con la copertura specificata sotto. Le voci aperte richiedono fonti o una metodologia aggiuntiva; non vengono simulate.

Lo stato delle funzionalità già distribuite è documentato in [STATUS.md](STATUS.md).

## Ambito concordato

- Estendere a tutto il globo i livelli cartografici e informativi, dove esistono dati utilizzabili.
- Mantenere acquisizione, posizioni e storico AIS della demo nel Mediterraneo.
- Esplicitare fuori dal Mediterraneo il limite della copertura AIS della demo.
- Conservare lo stile scuro, la leggibilità di navi e tracce e le quattro lingue disponibili.
- Mostrare fonte, versione o aggiornamento, copertura e limiti dei livelli.
- Verificare accesso, licenze, prestazioni e costi prima dell'integrazione. Restano validi i limiti economici della beta.
- La copertura globale delle informazioni cartografiche aggiorna l'ambito precedentemente rinviato; non autorizza l'acquisizione AIS globale.

## Elenco delle implementazioni

### Fondali

- [x] Curve batimetriche nel Mediterraneo, con quote, legenda e controllo di visibilità.
- [x] Fondali globali: base GEBCO e integrazione EMODnet dove appropriata.
- [x] Distribuzione per tessere e dettaglio progressivo secondo lo zoom, evitando un unico file mondiale da scaricare nel browser.
- [x] Conservare curve e quote coerenti con lo stile attuale; indicare risoluzione e limiti delle fonti.

### Porti e informazioni nautiche

- [x] Catalogo mondiale dei porti con nome, posizione, codice UN/LOCODE e informazioni disponibili.
- [x] Rade e aree di ancoraggio, posti di fonda e relativi nomi.
- [x] Banchine, moli, terminal e bacini portuali.
- [x] Canali di accesso, corridoi e sistemi di separazione del traffico quando documentati.
- [x] Punti di imbarco pilota.
- [x] Boe, fari e altri segnalamenti.
- [ ] Restrizioni portuali e divieti locali con riferimento alla fonte e validità.
- [ ] Verifica iniziale a Genova/Pra; successiva estensione ai dati disponibili nel mondo.

La presenza di un punto di ancoraggio non giustifica la creazione di un poligono di rada. La posizione di navi ferme non delimita un'area ufficiale. L’import di continuità contiene sei oggetti OSM reali del Golfo Ligure; non è una verifica completa delle rade ufficiali di Genova/Pra.

### Giurisdizioni marittime

- [x] Acque interne e mare territoriale.
- [x] Zone contigue.
- [x] Zone economiche esclusive (ZEE).
- [x] Alto mare.
- [x] Delimitazioni concordate, rivendicazioni e aree controverse rappresentate distintamente.
- [x] Piattaforma continentale come livello avanzato opzionale, chiarendo che riguarda fondale e sottosuolo.

Separare i regimi giuridici e indicare versione e fonte: non ricavare i confini con semplici fasce geometriche attorno alla costa.

### Infrastrutture e patrimonio sommerso

- [x] Cavi sottomarini e punti di approdo, distinguendo tracciati effettivi e schematici.
- [x] Condotte sottomarine.
- [x] Impianti offshore: piattaforme, parchi eolici e altre strutture, distinguendo stato operativo e progetto.
- [x] Relitti.
- [x] Siti archeologici sommersi pubblicamente documentati.

Queste voci fanno parte della roadmap, con copertura globale dove disponibile e livelli attivabili separatamente.

### Ambiente, traffico e condizioni marine

- [x] Aree marine protette e relativa zonizzazione disponibile.
- [x] Densità storica del traffico marittimo, distinguendola dal traffico corrente e dai corridoi ufficiali.
- [x] Onde e correnti con data, validità della previsione e risoluzione.
- [ ] Tempo stimato di permanenza in rada e congestione portuale ricavati dall'AIS disponibile, dopo validazione della metodologia.
- [x] Visualizzazione dell'anzianità delle posizioni e della qualità/copertura AIS, valutando le informazioni già presenti.

Le analisi derivate dal nostro AIS restano limitate al Mediterraneo. La disponibilità di meteo e dati ambientali globali dipende dal prodotto scelto.

### Warning, incidenti e rischio

- [x] Rapporti UKMTO selezionati, incidenti/pericoli NGA e avvisi regionali MARAD, con categoria, date, fonte e stato della conferma.
- [ ] Raccolta completa e aggiornata degli attacchi/pirateria mondiali e degli incidenti a navi civili o militari: le fonti integrate hanno copertura parziale.
- [x] Avvisi attivi: blocchi, chiusure, interdizioni e altri pericoli, con validità, aggiornamenti e revoca.
- [x] Marker e aree di warning con precisione geografica dichiarata; non inventare un'area ufficiale da una posizione approssimata.
- [x] Filtri per categoria e periodo; distinzione fra eventi storici e allerta attuale.
- [ ] Classificazioni delle fonti, ad esempio JMIC o gravità ReCAAP, mantenendo significato e ambito originali.
- [ ] Indice qualitativo sperimentale del sito, solo dopo valutazione e validazione dei dati.
- [x] Evidenziare gli avvisi attivi intersecati da una tratta, indicando il tempo a cui si riferisce l'analisi.

L'indice proposto considera recenza, frequenza, gravità, avvisi attivi, distribuzione geografica, affidabilità e, quando misurabile, esposizione al traffico. Non è una probabilità di attacco validata. Fuori dalla copertura AIS non usare il traffico della demo come denominatore. Mostrare “dati insufficienti” dove necessario: assenza di segnalazioni non significa sicurezza. Gli eventi militari pubblici possono avere copertura incompleta.

### Interfaccia comune

- [x] Pannello dei livelli con attivazione separata, legenda e preferenze persistenti.
- [x] Visibilità progressiva secondo lo zoom; poligoni trasparenti sotto navi e tracce.
- [x] Nome al passaggio del cursore e dettagli consultabili al clic.
- [x] Fonte, aggiornamento, copertura, licenza e limiti consultabili.
- [x] Testi e stati in inglese, italiano, francese e tedesco.
- [x] Stato distinto per fonte indisponibile, assenza di dati e copertura non disponibile.

## Versione implementata — 11 ottobre

Il controllo **Livelli mappa**, sotto i filtri, offre fondali e 20 livelli opzionali,
con preferenze persistenti. Il nome appare al passaggio del cursore e il clic apre
una scheda scura senza spostare o ingrandire la mappa. Etichette, navi e tracce
restano leggibili sopra i livelli informativi.

| Ambito             | Funzione disponibile                                                                | Copertura e limiti                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fondali            | GEBCO 2025 in tessere MVT; EMODnet nel Mediterraneo                                 | Globale fino a ±85,05°; derivato generalizzato, dettaglio portuale non operativo                                    |
| Porti              | 3.807 porti NGA, servizi e profondità quando pubblicati                             | Repertorio mondiale selezionato; data di aggiornamento dei singoli porti sconosciuta                                |
| Rade e navigazione | Geometrie OSM/OpenSeaMap; punti, aree, banchine, boe, fari e piloti                 | Mondiale disomogenea, dettaglio da zoom 9; non sostituisce ordinanze locali                                         |
| Giurisdizioni      | Acque interne, mare territoriale, zona contigua, ZEE, alto mare, piattaforma estesa | Export Marine Regions v4/v12 2023 e v2 2024; geometrie generalizzate; rivendicazioni e regimi congiunti evidenziati |
| Infrastrutture     | Cavi, condotte, offshore; stato dichiarato dalla fonte                              | EMODnet prevalentemente europeo + OSM mondiale incompleto                                                           |
| Patrimonio         | Relitti UKHO, relitti archeologici e siti BGS/OSM                                   | Raccolte selezionate, precisione e aggiornamento variabili                                                          |
| Ambiente           | Aree Natura 2000 marine/costiere e OSM, densità storica 2024                        | Densità nelle acque europee e vicine, AIS satellitare incompleto da giugno 2024                                     |
| Condizioni marine  | Onde e correnti, scelta ora/+3/+6/+12/+24 h                                         | Modello Open-Meteo globale campionato in massimo nove celle per vista; non una mappa continua                       |
| AIS                | Anzianità delle posizioni e osservazioni recenti entro 5 km dai porti               | Solo Mediterraneo; conteggio osservato, non disponibilità degli ormeggi                                             |
| Warning            | Avvisi NGA, contesto MARAD, estratto UKMTO, filtri e intersezioni con tracce        | Fonti parziali; copie datate esplicite; rapporti senza coordinate consultabili in elenco                            |

Gli avvisi ricontrollati e attivi sono distinti da quelli storici o non verificati.
L’intersezione confronta soltanto segmenti AIS osservati con **aree esplicite**
attualmente in vigore; non colma i vuoti delle tracce e non ricostruisce il rischio
al tempo di un viaggio storico. Il risultato riguarda gli avvisi caricati nella
vista corrente.

Restano aperti: raccolta mondiale completa e automatica degli incidenti, ordinanze
portuali locali, classificazioni JMIC/ReCAAP, indice di rischio validato, stime di
attesa/congestione e verifica completa delle geometrie ufficiali Genova/Pra.
Il pannello mostra **dati insufficienti** per il rating; nessuna segnalazione o
intersezione non equivale a una valutazione di sicurezza.

Dettagli tecnici e fonti effettivamente integrate:
[GLOBAL-BATHYMETRY.md](GLOBAL-BATHYMETRY.md),
[MARINE-DATA-SOURCES.md](MARINE-DATA-SOURCES.md),
[MARINE-FORECAST.md](MARINE-FORECAST.md),
[MARITIME-WARNINGS.md](MARITIME-WARNINGS.md).

## Fonti candidate e verifiche aperte

| Ambito                                         | Fonti candidate                                                                                                                                                                                                                                                                         | Da verificare                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fondali                                        | [GEBCO](https://www.gebco.net/data-products/gridded-bathymetry-data), [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/bathymetry)                                                                                                                                                  | Licenza del prodotto, risoluzione, produzione e costo delle tessere                                |
| Rade e segnalamenti                            | [OpenSeaMap / OSM](https://wiki.openstreetmap.org/wiki/Seamarks/Seamark_Object_Usage), autorità locali, Istituto Idrografico                                                                                                                                                            | Copertura effettiva, aggiornamento delle ordinanze, ODbL e diritti sulle carte                     |
| Porti                                          | [NGA World Port Index](https://msi.nga.mil/Publications/WPI), [UN/LOCODE](https://unlocode.unece.org/docs/data-attributes/), Autorità portuali                                                                                                                                          | Versione corrente, campi disponibili, licenza delle geometrie                                      |
| Giurisdizioni                                  | [Marine Regions](https://www.marineregions.org/downloads.php), [SHOM](https://limitesmaritimes.gouv.fr/thematiques/espaces-maritimes-francais), fonti nazionali e ONU                                                                                                                   | Versioni, termini di riuso, accordi e rivendicazioni; SHOM copre le giurisdizioni francesi         |
| Infrastrutture, patrimonio, ambiente e densità | [EMODnet Human Activities](https://emodnet.ec.europa.eu/en/human-activities), OSM e fonti nazionali                                                                                                                                                                                     | Copertura oltre le acque europee, licenze per dataset, accuratezza dei tracciati e classificazioni |
| Onde e correnti                                | [Copernicus Marine](https://data.marine.copernicus.eu/)                                                                                                                                                                                                                                 | Prodotto globale, licenza, validità, risoluzione e modalità di distribuzione                       |
| Pirateria e sicurezza                          | [UKMTO/JMIC](https://www.ukmto.org/ukmto-products), [ICC–IMB](https://icc-ccs.org/map/), [IMO/GISIS](https://www.imo.org/en/ourwork/security/), [ReCAAP](https://www.recaap.org/), [MARAD](https://www.maritime.dot.gov/msci/maritime-security-communications-industry-msci-web-portal) | Copertura regionale, accesso automatico, diritto di ripubblicazione, deduplicazione e rettifiche   |
| Pericoli e interdizioni                        | [NAVAREA](https://iho.int/navigation-warnings-on-the-web), Capitanerie e autorità competenti                                                                                                                                                                                            | Avvisi in vigore, revoche, coordinate, accessibilità dei dati e frequenza di aggiornamento         |

La tabella conserva la ricerca iniziale; i documenti tecnici sopra distinguono le fonti effettivamente integrate da quelle ancora candidate. Le coperture e le date dichiarate si riferiscono ai singoli prodotti, non alla completezza mondiale.

## Aggiornamento 11 ottobre — stili, stabilità e porti

Implementati Dark/Light/ECDIS ispirato, fasce panoramiche di profondità GEBCO,
cache per area fino a 24 ore e warning a 30 minuti, livelli persistenti durante
lo zoom e porti con simboli ad ancora. Scheda con attese dichiarate AIS, inizio/
fine delle soste rilevate e presenze nelle vicinanze, solo nel Mediterraneo.

Gli orari ufficiali dei porti, occupazione reale delle banchine, storico dell'ultimo
porto attribuito ufficialmente, GT/DWT/anno di costruzione e una raccolta automatica
completa degli incidenti restano aperti. Metodi e limiti:
[MAP-STYLES-PORT-TRAFFIC.md](MAP-STYLES-PORT-TRAFFIC.md).
