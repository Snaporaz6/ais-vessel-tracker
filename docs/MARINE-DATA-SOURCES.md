# Livelli marini globali: fonti, copertura e aggiornamento

Questi livelli sono informativi. Non sono carte nautiche, non sostituiscono gli
avvisi ufficiali e non attestano delimitazioni legali. Le posizioni AIS della demo
restano nel Mediterraneo; la cartografia informativa può essere consultata altrove.

## API e comportamento

`GET /api/map-data?layer=…&bbox=ovest,sud,est,nord&zoom=…`

Livelli: `ports`, `anchorages`, `navigation`, `cables`, `pipelines`, `offshore`,
`wrecks`, `heritage`, `protected`, `territorial`, `contiguous`, `eez`, `internal`,
`highseas`, `shelf`.

La risposta è GeoJSON con `metadata`: fonte, collegamento, licenza, copertura,
data della fonte (`updatedAt`, eventualmente sconosciuta), data del recupero
(`fetchedAt`), stato e messaggio. Il recupero di oggi non rende attuale una carta
pubblicata nel 2023. `complete` riguarda l'export del prodotto selezionato, non la
completezza dei dati nel mondo.

- Le richieste accettano soltanto livelli e provider prefissati, coordinate valide,
  zoom 0–22. Un bbox con ovest maggiore di est attraversa l'antimeridiano ed è
  suddiviso in due interrogazioni.
- I dettagli di porti/rade/segnalamenti richiedono zoom 9 e un'area piccola. Cavi,
  condotte, impianti, siti sommersi e aree protette richiedono zoom 6; relitti zoom 7.
- Ogni risposta remota è limitata a 5 MiB; le interrogazioni vettoriali richiedono
  al massimo 1.501 elementi e la risposta combinata ne conserva al massimo 1.500,
  dichiarando `partial` quando raggiunge il limite.
- Le risposte API serializzate sono limitate a 4.000.000 byte, sotto il limite
  delle Functions Vercel. Un eventuale taglio conserva prima gli elementi più
  vicini al centro del riquadro e dichiara `partial` / `truncated`; non diventa un
  risultato vuoto valido. Il client deve mantenere visibile l'avviso di incompletezza.
- Timeout complessivo 18 secondi; al massimo due richieste WFS contemporanee per
  livello, cinque richieste di livello concorrenti per istanza e cache limitata a
  36 voci / 24 MiB. Le richieste identiche in corso vengono riutilizzate.
- Un errore della fonte produce HTTP 503 / `error`, oppure `partial` se una seconda
  fonte ha fornito dati. Un successo con zero elementi significa solo che il
  provider non contiene oggetti nel riquadro, non che la zona sia libera o sicura.
- I dati esterni sono testo, non HTML; i campi di provenienza e gli identificatori
  normalizzati non possono essere sovrascritti da tag OpenStreetMap.

## Porti mondiali — NGA World Port Index

- Fonte ufficiale: [NGA WPI](https://msi.nga.mil/Publications/WPI) e
  [WPI Viewer](https://fgmod.nga.mil/apps/WPI-Viewer/).
- Endpoint trovato nella configurazione del visualizzatore ufficiale:
  `https://fgmod.nga.mil/nauticalpubs-feature/rest/services/WPI/WPI_Viewer/FeatureServer/0`.
- Snapshot: `frontend/public/marine-data/ports.json`, 3.807 posizioni. L'importatore
  confronta il totale con `returnCountOnly` e verifica l'unicità degli ID.
- Attribuzione: NGA Maritime Safety Office; contenuto federale USA / pubblico
  dominio. Il web map ufficiale dichiara assenza di restrizioni specifiche.
- Copertura: selezione mondiale di porti/terminal, non tutti i piccoli approdi.
  Profondità, dimensioni nave e servizi sono attributi di repertorio; zero e
  sconosciuto non attestano un'assenza o una disponibilità operativa in tempo reale.
- La data di aggiornamento dei singoli porti non è pubblicata nell'export:
  `updatedAt: null`. Il recupero è indicato separatamente.
- A zoom 9 OpenStreetMap aggiunge geometrie e piccoli approdi del riquadro.
- A piccola scala, o su un riquadro molto esteso, l'API conserva tutti i porti ma
  invia i soli attributi principali. Da zoom 6 su riquadri locali sono disponibili
  gli attributi completi di servizi, profondità e caratteristiche.

## Rade, accessi e segnalamenti — OpenStreetMap / OpenSeaMap

- Schema: [Seamark Object Usage](https://wiki.openstreetmap.org/wiki/Seamarks/Seamark_Object_Usage).
- Fonte: Overpass, POST form-urlencoded al servizio principale
  `https://overpass-api.de/api/interpreter`, con fallback prefissato Kumi.
- Licenza: [ODbL 1.0](https://www.openstreetmap.org/copyright), attribuzione
  OpenStreetMap contributors. Le eventuali banche dati derivate richiedono il
  rispetto degli obblighi ODbL.
- Copertura mondiale comunitaria e disomogenea; non verificata integralmente con
  ordinanze locali. Nessun buffer inventato attorno a un punto di rada.
- Punti, linee, poligoni e multipoligoni vengono derivati dalle geometrie mappate.
  Un eventuale centroide di fonte è dichiarato come tale, senza presentarlo come
  confine dell'area.
- `updatedAt` è il timestamp della base OSM restituito da Overpass, non la data di
  modifica del singolo oggetto. Anche il fallback conserva il suo timestamp reale.
- Snapshot di continuità: `anchorages.json`, sei oggetti reali nel riquadro
  8,4–9,2 E / 44,1–44,6 N (Golfo Ligure; non solo il porto di Genova). Si usa
  soltanto in caso di indisponibilità della fonte e con oggetti che intersecano il
  riquadro; stato `partial`, messaggio di snapshot datato. Non copre altre regioni.

## Cavi, condotte e impianti — EMODnet + OSM

- [Servizi ufficiali EMODnet](https://emodnet.ec.europa.eu/en/emodnet-web-service-documentation).
- WFS: `https://ows.emodnet-humanactivities.eu/wfs`.
- Cavi: raccolte telecomunicazioni Malta, Francia (SHOM/SIGCables), Germania,
  Spagna, Paesi Bassi e Regno Unito, più raccolte di cavi elettrici di Francia,
  Germania, Paesi Bassi e Norvegia. Queste raccolte descrivono tracciati di fonte,
  non i percorsi schematici di TeleGeography.
- Condotte: `emodnet:pipelines`, percorsi disponibili in acque europee. I tracciati
  di Paesi diversi possono non coincidere perfettamente: non vengono fusi o
  corretti senza una fonte autorevole.
- Impianti: `emodnet:platforms` e `emodnet:windfarmspoly`; lo stato del progetto
  (`projectStatus`) è quello dichiarato nella fonte. Un impianto pianificato non è
  presentato come operativo. Dataset eolico pubblicato il 10 luglio 2026.
- Le schede conservano fonte, operatori, sostanza/produzione, profondità e stato
  quando presenti. Precisione e data sconosciute rimangono sconosciute.
- I metadati WFS dei prodotti citati dichiarano CC BY 4.0. La provenienza primaria
  è preservata negli attributi e consultabile nella scheda. Fuori dalla loro
  copertura europea contribuisce OSM, quando il riquadro è sufficientemente piccolo.
- Non sono stati importati cavi TeleGeography: il relativo riuso non commerciale
  non deve essere confuso con una licenza libera per un futuro prodotto commerciale.

## Relitti e siti sommersi

### Relitti mondiali

- WFS `emodnet:wwshipwrecks`, UK Hydrographic Office via EMODnet.
- [Metadati ufficiali](https://emodnet.ec.europa.eu/geonetwork/srv/api/records/108ef240-fa6e-4b83-8569-09b509e2959d).
- La raccolta comprende oltre 67.000 relitti, cartografati e non, con stati e
  qualità della posizione differenti. Non è un elenco mondiale completo.
- Il prodotto EMODnet dichiara CC BY 4.0; l'origine UKHO è disponibile sotto
  [Open Government Licence v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- I campi di qualità, metodo di posizione, stato e ultimo emendamento sono
  conservati; la sola presenza di un punto non attesta un pericolo attuale.

### Patrimonio sommerso

- `emodnet:heritageshipwrecks`: relitti archeologici mediterranei dell'Oxford Roman
  Economy Project, Francia/territori francesi (SHOM), Irlanda e Historic England.
- [Metadati CC BY 4.0](https://emodnet.ec.europa.eu/geonetwork/srv/api/records/e965088b-a265-4517-84df-c49b156af8a7).
  Pubblicazione prodotto: 9 aprile 2025; le singole fonti hanno date differenti,
  fino al progetto romano del 2013. Alcuni punti sono centroidi di aree di sito.
- Veri siti archeologici sommersi, oltre ai relitti: BGS / EMODnet Geology,
  `bgs:P_Archaeological_Site` e `bgs:PG_Archaeological_Site`, dal WFS
  `https://drive.emodnet-geology.eu/geoserver/bgs/wfs`.
- [Metadati e condizioni CC BY 4.0](https://metadata.europe-geology.eu/record/basic/6720a135-d4b4-49cc-866c-445f0a010855),
  pubblicazione 29 ottobre 2024. Le condizioni riguardano il prodotto sul portale,
  non tutti i dati originali dei partner. Copertura prevalentemente mediterranea.
- OSM aggiunge siti pubblicamente mappati con `historic=archaeological_site` e
  `location=underwater` o `submerged=yes`. Non si pubblicano nuove posizioni
  ricavate da inferenze o da informazioni non pubbliche.

## Aree protette

- Natura 2000, [metadati EEA / EMODnet](https://emodnet.ec.europa.eu/geonetwork/srv/api/records/ac911c34-1692-4642-a031-87bcb5822158).
- `emodnet:natura2000areas`, filtrato con il vero attributo `coast_mar=1`:
  siti marini o costieri, evitando l'intero inventario terrestre.
- Versione EEA pubblicata nel dicembre 2025; CC BY 4.0. Fonte europea, integrata
  con aree OSM esplicitamente mappate come marine, con attribuzione ODbL.
- I divieti specifici richiedono il regolamento dell'area; il poligono di protezione
  non è interpretato automaticamente come interdizione alla navigazione.
- Non si ridistribuiscono qui WDPA o MAPAMED: i loro ulteriori termini, compresi
  quelli non commerciali, richiedono un'integrazione dedicata.

## Giurisdizioni globali — Marine Regions / VLIZ

- [Download, versioni e citazioni](https://www.marineregions.org/downloads.php),
  [WFS ufficiale](https://www.marineregions.org/webservices.php),
  [licenza e limiti](https://www.marineregions.org/disclaimer.php).
- CC BY 4.0. Il provider chiede di rimandare ai suoi download aggiornati; il sito
  conserva un derivato generalizzato per la visualizzazione e collega l'originale.
- Territorial seas (`eez_12nm`), contiguous zones (`eez_24nm`) e internal waters
  (`eez_internal_waters`): v4, 25 ottobre 2023.
- EEZ (`eez`): v12, 25 ottobre 2023. `pol_type` distingue espressamente `200NM`,
  `Overlapping claim` e `Joint regime`. Sovrapposizioni e regimi congiunti non
  vengono interpretati come confini risolti.
- High seas (`high_seas`) e extended continental shelves (`ecs`): v2,
  10 ottobre 2024. La piattaforma continentale riguarda il fondale, non il medesimo
  regime delle acque sovrastanti. Raccomandazioni e submissions restano distinguibili.
- Il display è semplificato a 0,025 gradi; per la ZEE a scala globale è disponibile
  anche una versione a 0,1 gradi. Da zoom 5 nei riquadri locali viene usata la ZEE
  a 0,025 gradi; se supera il budget di risposta, viene fornita la versione più
  grossolana con precisione esplicita, preservando tutte le entità nel riquadro.
  Componenti di isole/buchi inferiori alla risoluzione sono omesse; gli anelli
  collassati conservano tre vertici reali della fonte. Questa generalizzazione può
  cambiare l'aspetto di componenti molto piccoli e non conserva dettaglio legale.
  Tutte le entità del prodotto sono preservate, almeno con il componente maggiore.
- L'importazione pagina il servizio, confronta `numberMatched`, verifica ID unici
  e salva atomicamente. L'antimeridiano si mantiene come suddivisione geometrica
  del provider; non si disegna una linea artificiale attraverso il globo.

### Snapshot completati l'11 ottobre 2026

| Livello                         |  Entità fonte / ID unici | Byte del file |
| ------------------------------- | -----------------------: | ------------: |
| Mare territoriale               |                      230 |     1.839.596 |
| Zona contigua                   |                      220 |       969.418 |
| ZEE globale, 0,1°               |                      285 |     1.333.196 |
| ZEE dettaglio, 0,025°           |                      285 |     5.548.945 |
| Acque interne                   |                      113 |     3.610.231 |
| Alto mare                       | 1 multipoligono mondiale |       289.008 |
| Piattaforme continentali estese |                      147 |       395.740 |
| Porti NGA                       |                    3.807 |     4.889.607 |
| Rade del riquadro ligure        |                        6 |         3.087 |

La dimensione dei file non è quella della risposta API: la ZEE di dettaglio viene
filtrata per riquadro e i porti globali sono inviati con attributi compatti. La
validazione dell'importazione ha confermato ID unici, conteggi completi, anelli
chiusi e coordinate valide. Gli unici segmenti con salto di longitudine superiore
a 180° sono le chiusure originali del cappuccio polare nord da −180°,90° a
180°,90° (alto mare e una sovrapposizione artica di piattaforma); non ci sono
segmenti non polari attraverso il globo introdotti dal derivato.

Le ZEE conservano 229 entità `200NM`, 35 `Overlapping claim`, 21 `Joint regime`.
Le piattaforme mantengono separate raccomandazioni CLCS, submissions, depositi
DOALOS, rivendicazioni non UNCLOS, sovrapposizioni e iniziative congiunte.

## Aggiornamenti riproducibili

```sh
python3 scripts/import-marine-data.py --boundaries
python3 scripts/import-marine-data.py --ports --port-url https://fgmod.nga.mil/nauticalpubs-feature/rest/services/WPI/WPI_Viewer/FeatureServer/0
python3 scripts/import-marine-data.py --genoa
```

Non occorrono nuove dipendenze. L'importatore usa la libreria standard Python,
timeout, limiti di byte, cache temporanea delle pagine sorgente e controlli di
completezza. Un'importazione fallita conserva lo snapshot precedente.
