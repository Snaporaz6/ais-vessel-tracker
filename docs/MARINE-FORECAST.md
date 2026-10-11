# Previsioni marine e densità storica

## Onde e correnti campionate

`GET /api/marine-forecast?bbox=west,south,east,north&zoom=4&hours=0`

- `hours` accetta 0, 3, 6, 12 e 24 ore rispetto all'ora UTC corrente,
  arrotondata all'inizio dell'ora.
- La risposta è una `FeatureCollection` di massimo nove punti, ricavati da una
  griglia di campionamento 3×3 della zona visualizzata. Non rappresenta una
  copertura continua della zona né interpolazioni spaziali del sito.
- Le posizioni richieste sono quantizzate in base allo zoom (5°, 2°, 0,5°,
  0,25° o 0,1°) per riutilizzare le risposte nella cache. Gli spostamenti che
  non cambiano i campioni non comportano una nuova richiesta alla fonte.
- La geometria di ogni punto contiene le **coordinate della cella del modello
  restituite dalla fonte**, non quelle richieste. Queste ultime rimangono nei
  campi `requested_latitude` e `requested_longitude`. Celle duplicate vengono
  unificate; campioni senza alcun dato sono esclusi e conteggiati nei metadati.
  `availableSampleCount` conta le celle distinte mostrate,
  `duplicateSampleCount` i campioni confluiti nella stessa cella,
  `unavailableSampleCount` i campioni senza valori disponibili.
- Proprietà: `waveHeight` in metri, `currentVelocity` in nodi,
  `currentDirection` in gradi (direzione **verso cui** scorre la corrente),
  `forecastAt` in UTC. Sono presenti anche i nomi originali `wave_height`,
  `ocean_current_velocity` e `ocean_current_direction`.
- Un valore mancante rimane `null`: non viene sostituito con zero. La mappa deve
  mostrare le onde solo dove `waveHeight` è disponibile, e le frecce di corrente
  solo dove velocità e direzione sono disponibili. Le unità ricevute vengono
  verificate: velocità riconosciute sono convertite in nodi; direzioni con unità
  sconosciuta rimangono `null`.
- `forecastValidTime` è la validità della previsione; `fetchedAt` è l'ora di
  acquisizione. `updatedAt` e `modelRunTime` rimangono `null` perché il modello
  selezionato e il suo istante di emissione non sono restituiti dall'API.

La fonte è la [Marine Weather API di Open-Meteo](https://open-meteo.com/en/docs/marine-weather-api),
che combina modelli globali e regionali. Sono utilizzati solo tre parametri:
altezza significativa delle onde, velocità e direzione della corrente, per
un'unica ora di validità. `cell_selection=sea` preferisce una cella in mare ma
non garantisce che la coordinata richiesta sia in mare. La risoluzione dei
modelli e la precisione costiera non consentono di descrivere correnti interne
ai porti o sostituire informazioni nautiche operative.

### Licenza e uso del servizio

I [dati API sono CC BY 4.0](https://open-meteo.com/en/licence), con attribuzione
visibile e collegamento Open-Meteo vicino alla visualizzazione. La
documentazione marina richiede anche il riferimento a DWD. L'interfaccia
indica Open-Meteo, DWD e Météo-France / Copernicus Marine.

La licenza dei dati è distinta dalle condizioni del servizio:
l'[API gratuita è destinata a uso non commerciale, valutazione e prototipi](https://open-meteo.com/en/pricing).
Questa implementazione usa l'endpoint gratuito per la demo personale. Per
un servizio commerciale bisogna passare a un piano compatibile oppure a
un'installazione propria; l'implementazione non acquista alcun piano.

### Carico e indisponibilità

- Una richiesta aggrega al massimo nove coordinate; timeout della fonte 12 s.
- Risposta della fonte limitata a 128 KB e destinazione HTTPS fissa; non è un
  proxy per URL forniti dagli utenti.
- Cache in memoria 15 minuti, massimo 128 voci; richieste identiche in corso
  condividono la stessa operazione. Cache CDN fino a 15 minuti e browser fino a
  2 minuti, con scadenza anticipata al successivo cambio dell'ora UTC: una
  selezione relativa “adesso” o “+3 ore” non mantiene il campione dell'ora
  precedente dopo il cambio dell'ora. Nessun uso di risposte scadute in caso di
  errore.
- Budget conservativi per istanza: 90 coordinate/minuto, 500/ora, 2.000/giorno.
  Non sono contatori distribuiti tra istanze serverless: un uso elevato richiede
  monitoraggio delle quote del provider e limiti condivisi.
- Errori della fonte o quote esaurite restituiscono 502 o 429 senza cache;
  non vengono generati punti o valori sostitutivi.
- Stati nei metadati: `ready`, `partial`, `empty`, `error`, con chiavi messaggio
  coerenti `mapData.*`. `complete` rimane `false` per il campionamento della vista.

## Densità storica del traffico

`GET /api/traffic-density/{z}/{x}/{y}` restituisce una tessera PNG 256×256.

La fonte è il [servizio EMODnet Human Activities](https://emodnet.ec.europa.eu/en/human-activities),
livello WMS `vesseldensity_allavg`, intervallo temporale fissato al **2024**.
L'unità è **ore nave per km² per mese**, media dei valori mensili dell'anno.
Sono inclusi tutti i tipi di nave. È un indicatore storico, non traffico AIS
in tempo reale né un sistema di corridoi ufficiali.

Copertura dichiarata dal servizio: acque UE e alcune zone vicine. I limiti
geografici pubblicati sono circa −87,706° / 14,961° / 97,633° / 86,801°;
non implicano presenza di dati in ogni punto del rettangolo.

**Limite importante del 2024:** il provider segnala una perdita di dati AIS
satellitari a partire da giugno; la densità dell'anno è meno completa degli
anni precedenti. Questo livello non va utilizzato come denominatore di un
indice di rischio, come prova di assenza di traffico o per dedurre un calo
rispetto agli anni precedenti senza una metodologia aggiuntiva.

La documentazione ufficiale riporta il metodo e il riuso gratuito delle mappe:
[metodo delle mappe EMODnet](https://emodnet.ec.europa.eu/en/human-activities-eu-vessel-density-map-detailed-method),
[pubblicazione e riuso](https://emodnet.ec.europa.eu/en/new-insights-european-maritime-traffic-emodnet-vessel-density-maps).
Attribuire EMODnet Human Activities e consultare i metadati del dataset prima
di cambiare versione. La data 2024 e la copertura incompleta devono essere
visibili nella legenda del livello.

### Distribuzione

- Coordinate tessera validate: zoom 0–12, X/Y entro la matrice XYZ.
- Richiesta WMS fissa: EPSG:3857, anno, livello, stile e dimensioni non sono
  modificabili dall'utente.
- Timeout 12 s, risposta massima 1 MB, verifica tipo MIME, firma PNG e
  dimensioni 256×256 dell'intestazione dell'immagine.
- Cache in memoria delle sole immagini validate per 24 ore, massimo 128 voci
  e 16 MB; deduplicazione delle richieste identiche e massimo 32 richieste alla
  fonte simultanee per istanza. Cache CDN 7 giorni.
- Il fetch della fonte usa `no-store`: un'eccezione WMS restituita come HTTP
  200 XML o un'immagine non valida non finisce nella cache dati Next.js.
  Nessuna risposta di errore viene servita come PNG valida o generata con
  colori artificiali.
- Gli errori restituiscono 502 senza cache; il limite di richieste simultanee
  restituisce 503 con `Retry-After`. La mappa deve indicare che il livello è
  temporaneamente incompleto.

Onde, correnti e densità storica rimangono informazioni di contesto e
**non sono utilizzabili per la navigazione o la sicurezza in mare**.
