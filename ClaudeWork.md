# ClaudeWork — Report di sviluppo AIS Vessel Tracker

> Documento unico aggiornato ad ogni sessione. Le nuove sessioni vengono aggiunte in cima.

**Repository:** [github.com/Snaporaz6/ais-vessel-tracker](https://github.com/Snaporaz6/ais-vessel-tracker)
**Ultimo aggiornamento:** 11 Marzo 2026

---

## Sessione 3-4 | 10-11 Marzo 2026

**Obiettivo:** Migrazione mappa Leaflet→MapLibre GL con globo 3D, filtro tipo nave, SSR pagine, miglioramenti UI
**Durata:** 2 sessioni (continuazione per esaurimento contesto)

### Implementazioni completate

#### Filtro tipo nave (`VesselFilter.tsx`)
- Pannello collassabile con checkboxes per ogni ShipType (cargo, tanker, passenger, etc.)
- Colori coordinati con i marker sulla mappa
- Pulsanti rapidi "Tutti" / "Nessuno"
- Conteggio navi per tipo in tempo reale
- Integrato in `page.tsx` con state `visibleTypes: Set<ShipType>` e `typeCounts`

#### Esplorazione repo World Monitor
- Analizzato `github.com/B353N/worldmonitor.git` — Vite + Preact + deck.gl + MapLibre GL
- Ispirazione per la proiezione globo 3D sferica
- Architettura confrontata: World Monitor usa deck.gl overlay, noi MapLibre nativo

#### Migrazione Leaflet → MapLibre GL JS v5
- **Rimossi:** leaflet, react-leaflet, leaflet.markercluster, @types/leaflet, @types/leaflet.markercluster
- **Aggiunto:** maplibre-gl ^5.20.0
- **Cancellato:** `TrackPolyline.tsx` (logica assorbita in Map.tsx come GeoJSON source + line layer)
- **Map.tsx riscritto completamente** con API imperativa MapLibre GL:
  - Mappa creata con `new maplibregl.Map()` in useEffect mount
  - Basemap: CARTO dark-matter vector tiles
  - GeoJSON source con clustering nativo (`cluster: true`)
  - Data-driven styling per colore marker per tipo nave (con override rosso per navi sanzionate)
  - Track come GeoJSON LineString source + layer
  - Popup nativo MapLibre al click
  - `useRef` per callback references (evita stale closures negli event handler MapLibre)
- **Globe toggle:** `map.setProjection({ type: 'globe' | 'mercator' })` con bottone UI
- **Primo tentativo con react-map-gl v8 fallito:** runtime error `getRayDirectionFromPixel not implemented` — incompatibilita con MapLibre v5 globe projection

#### SSR Pagina vessel (`/vessel/[mmsi]/page.tsx`)
- `generateMetadata()` con titolo/descrizione SEO
- Fetch SSR con revalidate 300s
- Layout con foto nave, info voyage (destination/ETA), dettagli nave, port calls, anomalie, sanzioni

### Problemi riscontrati

#### react-map-gl v8 incompatibile con MapLibre v5 globe
**Problema:** `react-map-gl` v8 chiamava `getRayDirectionFromPixel` (non implementato in MapLibre v5) e causava errori "Attempting to run(), but is already running".
**Soluzione:** Rimosso react-map-gl, riscritto Map.tsx con API imperativa MapLibre GL (stesso approccio di World Monitor).

#### attributionControl type error in MapLibre v5
**Problema:** `attributionControl: true` non accettato dai tipi MapLibre v5.
**Soluzione:** Usare `attributionControl: { compact: true }`.

#### Cache .next con moduli rimossi
**Problema:** Dopo rimozione Leaflet, il dev server Next.js crashava cercando chunk Leaflet nella cache `.next/`.
**Soluzione:** `rm -rf frontend/.next` prima di riavviare.

---

## Sessione 1-2 | 6-7 Marzo 2026

**Obiettivo:** Sviluppo completo MVP
**Durata:** 2 sessioni (continuazione automatica per esaurimento contesto)

---

## 1. Panoramica

Sviluppo completo dell'MVP di un'alternativa gratuita a MarineTraffic/VesselFinder, con tracking navi in tempo reale nel Mediterraneo, storico posizioni 90 giorni, rilevamento anomalie AIS e check sanzioni OFAC/EU.

---

## 2. Implementazioni completate

### 2.1 Schema Database (Step 1)
- Creazione tabelle `vessels`, `vessel_positions`, `sanctions`, `anomaly_events` su Supabase
- Script SQL per free tier (senza TimescaleDB): `scripts/init-db-free-tier.sql`
- Funzione RPC `get_live_vessels` per query ottimizzata della mappa live
- **Migrazione successiva:** aggiunta colonne `destination` e `eta` alla tabella `vessels`

### 2.2 Tipi condivisi (Step 2)
- `shared/types.ts` — Interfacce TypeScript: Vessel, VesselPosition, PortCall, AnomalyEvent, SanctionRecord, LiveMapVessel
- `shared/config.ts` — Costanti centralizzate (soglie anomalie, batch size, rate limit)
- `shared/errors.ts` — Classi errore custom (NotFoundError, ValidationError, DatabaseError)

### 2.3 Ingestor WebSocket (Step 3)
- `ingestor/ws-client.ts` — Connessione a aisstream.io con reconnect automatico
- `ingestor/parser.ts` — Parsing messaggi AIS (PositionReport tipo 1,2,3 + ShipStaticData tipo 5)
- `ingestor/filter.ts` — Filtro geografico Mediterraneo (bbox 30N-46N, 6W-36.5E) + validazione MMSI/coordinate
- `ingestor/db-writer.ts` — Batch upsert su Supabase con buffer e flush periodico
- Deduplicazione temporale (30s per MMSI)
- **Aggiunta successiva:** parsing campi `Destination` e `Eta` da ShipStaticData

### 2.4 Anomaly Detector (Step 4)
- `ingestor/anomaly-detector.ts` — Rilevamento dark_activity (gap AIS >6h), speed_anomaly (velocita implicita >1.5x max), impossible_movement (teletrasporto)

### 2.5 REST API (Step 5)
- 6 endpoint Express con rate limiting (60 req/min), CORS, Helmet
- `GET /api/search?q=` — Ricerca fuzzy per nome (pg_trgm), esatta per MMSI/IMO
- `GET /api/vessel/:mmsi` — Dettagli nave + ultima posizione + sanzioni + anomalie
- `GET /api/vessel/:mmsi/track?days=30` — Storico traccia (default 30gg, max 90)
- `GET /api/vessel/:mmsi/portcalls` — Port call ricostruiti dal track
- `GET /api/vessel/:mmsi/anomalies` — Eventi anomalia
- `GET /api/map/live?bbox=` — Navi live nella bounding box (max 500)

### 2.6 Frontend Mappa (Step 6)
- Next.js App Router con MapLibre GL JS v5 imperativo, dark theme (CARTO vector tiles)
- Proiezione globo 3D sferica con toggle mercator/globe
- Clustering GeoJSON nativo (rimpiazza leaflet.markercluster)
- Marker colorati per tipo nave con data-driven styling (cargo=verde, tanker=giallo, passenger=blu, etc.)
- Filtro tipo nave (`VesselFilter.tsx`) con checkboxes e conteggi live
- SearchBar con ricerca live e dropdown risultati
- VesselDrawer con pannello laterale contenente:
  - Foto nave (da MarineTraffic, con fallback)
  - Destination e ETA (colori blu/verde)
  - Dettagli nave (tipo, dimensioni, posizione, velocita, stato)
  - Port Call History (ultimi 90 giorni con durata soste)
  - Badge sanzioni e anomalie
  - Pulsanti "Show Track" e "Full Details"
- Track storica come GeoJSON LineString layer (logica in Map.tsx)

### 2.7 Cron Sanzioni (Step 8)
- `scripts/sync-sanctions.ts` — Download e parsing completo:
  - **OFAC SDN List (XML):** 1455 navi sanzionate, 1450 con IMO, 721 con MMSI
  - **EU Consolidated Sanctions (CSV):** 23 entita marittime
- Estrazione IMO da formato OFAC `"IMO 7406784"` dentro `idType: "Vessel Registration Identification"`
- Estrazione IMO/MMSI da campo `Entity_remark` EU tramite regex
- Batch insert (100 record per batch)
- Scheduling con `node-cron` ogni giorno alle 03:00 UTC (`--cron` flag)

### 2.8 Badge Anomalie e Sanzioni (Step 9)
- Componenti `AnomalyBadge` e `SanctionBadge` funzionanti
- Matching automatico per IMO e MMSI

---

## 3. Problemi riscontrati e soluzioni

### 3.1 aisstream.io — API key e formato bbox
**Problema:** La documentazione non era chiara sul casing dei campi. Il subscribe message richiedeva `Apikey` (non `apikey`) e `BoundingBoxes` con formato specifico `[[latMin, lonMin, latMax, lonMax]]`.
**Soluzione:** Analisi dei messaggi di errore e test iterativi fino a trovare il formato corretto.

### 3.2 MMSI_String restituito come numero
**Problema:** aisstream.io restituisce `MMSI_String` come `number` (non `string`), causando errori nel filtro MMSI a 9 cifre.
**Soluzione:** Conversione esplicita `String(msg.MetaData?.MMSI_String ?? msg.MetaData?.MMSI ?? '')` nel parser.

### 3.3 Timestamp aisstream.io incompatibile con PostgreSQL
**Problema:** Il formato timestamp di aisstream `"2026-03-06 14:10:48.636890157 +0000 UTC"` non era accettato da PostgreSQL per tre motivi: suffisso "UTC", nanosecondi oltre 3 cifre, spazio prima del timezone offset.
**Soluzione:** Funzione `normalizeTimestamp()` con 5 step di pulizia regex:
1. Rimozione suffisso ` UTC`
2. Troncamento nanosecondi a millisecondi
3. Rimozione spazio prima di `+` (`.636 +0000` -> `.636+0000`)
4. Conversione `+0000` -> `+00:00`
5. Sostituzione spazio data-ora con `T`

### 3.4 WebSocket handshake timeout
**Problema:** aisstream.io impiega >15 secondi per completare l'handshake WebSocket, causando timeout con il default di 15s.
**Soluzione:** Aumento `HANDSHAKE_TIMEOUT_MS` da 15000 a 60000.

### 3.5 Express 4 — crash su throw in async handler
**Problema:** Express 4 non cattura automaticamente le eccezioni lanciate in handler async. Un `throw new NotFoundError()` in `vessel.ts` causava un `unhandledPromiseRejection` che crashava l'intero server Node.js.
**Soluzione:** Aggiunto `try/catch + next(err)` a tutti e 6 i file route. Aggiunto `process.on('unhandledRejection')` in `api/index.ts` come safety net.

### 3.6 VesselDrawer crash su risposta 404
**Problema:** Quando l'API restituiva un 404 (JSON con `{error: "...", code: "NOT_FOUND"}`), il frontend lo parsava come vessel valido. `vessel.sanctions.map()` crashava con `TypeError: vessel.sanctions.map is not a function`.
**Soluzione:** Check `res.ok` prima di parsare il JSON. Aggiunto `?? []` come null safety su tutti gli accessi a `.sanctions` e `.anomalies`.

### 3.7 Show Track non funzionante
**Problema:** Il click su "Show Track" settava `trackMmsi` nello state, ma `TrackPolyline` non veniva mai renderizzato. Inoltre `TrackPolyline` usa `useMap()` che deve essere dentro `<MapContainer>`.
**Soluzione:** Passato `trackMmsi` come prop al componente `Map` e renderizzato `<TrackPolyline>` dentro `<MapContainer>`.

### 3.8 Supabase — impossibile eseguire ALTER TABLE via API
**Problema:** La REST API di Supabase (PostgREST) non supporta l'esecuzione di SQL raw. Tentati: `supabase.rpc('exec_sql')`, endpoint `/pg/query`, Supabase CLI, connessione diretta con `pg` (password DB sconosciuta).
**Soluzione:** Script di migrazione SQL (`scripts/migrate-add-destination-eta.sql`) eseguito manualmente nel Supabase SQL Editor. Il codice (`db-writer.ts`) reso resiliente con retry automatico senza le colonne nuove se non esistono ancora.

### 3.9 OFAC XML — IMO non estratto
**Problema:** Il parser OFAC trovava 1455 navi ma 0 con IMO. L'`idType` non era `"IMO"` come atteso, ma `"Vessel Registration Identification"`, e l'`idNumber` conteneva `"IMO 7406784"` (stringa con prefisso).
**Soluzione:** Estrazione IMO con fallback multiplo: cerca in `idType` contenente "IMO", poi in `idType` contenente "VESSEL"/"REGISTRATION" con regex su `idNumber`, poi fallback su `remarksText`.

### 3.10 EU CSV — separatore sbagliato
**Problema:** Il CSV EU usa `;` come separatore, non `,`. Il parser restituiva una sola colonna gigante e 0 navi trovate.
**Soluzione:** Aggiunto `delimiter: ';'` alle opzioni di `csv-parse`. Corretti i nomi colonna: `Entity_remark` (non `entity_remark`), `Naal_wholename` (non `nameAlias_wholeName`), `Subject_type` (non `entity_subjectType`).

### 3.11 Vessel API 404 per navi senza dati statici
**Problema:** Le navi che inviano solo PositionReport (tipo 1,2,3) ma non ancora ShipStaticData (tipo 5) avevano posizioni nel DB ma nessun record in `vessels`. L'API restituiva 404 e il drawer mostrava "Vessel not found".
**Soluzione:** Se la nave non e nella tabella `vessels` ma ha posizioni, l'API crea un oggetto vessel minimo con MMSI e dati dalla posizione piu recente.

### 3.12 Leaflet — tile rendering parziale
**Problema:** Le tile della mappa si renderizzavano solo in una piccola porzione del container, specialmente con dynamic import di Next.js.
**Soluzione:** Componente `MapResizeHandler` che chiama `map.invalidateSize()` dopo il mount (200ms delay) e su ogni evento `resize` della finestra.

### 3.13 Port 3000/3001 EADDRINUSE
**Problema:** Processi zombie che occupavano le porte dopo crash o restart.
**Soluzione:** `lsof -ti :3000 | xargs kill -9` prima di ogni avvio.

---

## 4. Architettura finale

```
aisstream.io (WebSocket)
    |
    v
[Ingestor] --batch--> [Supabase PostgreSQL]
    |                       |
    |                       v
    |               [Express API :3001]
    |                       |
    |                       v
    +-- anomalies --> [Next.js Frontend :3000]
                            |
                            v
                    [MapLibre GL Map + VesselDrawer]
```

---

## 5. Commit history

| # | Hash | Messaggio |
|---|------|-----------|
| 1 | — | Initial MVP setup (sessione precedente) |
| 2 | — | Fix aisstream.io API format and MMSI_String type |
| 3 | — | Fix timestamp format for PostgreSQL and add WS handshake timeout |
| 4 | 0ffa5c1 | Increase WebSocket handshake timeout to 60s |
| 5 | 93da75c | Fix Express async error handling and live map window |
| 6 | 4a137f0 | Fix VesselDrawer crash on 404 response |
| 7 | 19c0afa | Wire up Show Track button to render TrackPolyline on map |
| 8 | 0a291cd | Add vessel photo and extend track history to 30 days |
| 9 | ab87d13 | Add destination, ETA and port call history to vessel panel |
| 10 | 3188550 | Implement sanctions sync with OFAC SDN and EU consolidated list |
| 11 | 7647531 | Fix Leaflet map tile rendering with invalidateSize on mount |
| 12 | a95478c | Fix vessel API to return data for vessels with positions but no static record |

---

## 6. Stato attuale e prossimi passi

### Completato (MVP funzionante)
- Ingestor live connesso a aisstream.io (Mediterraneo)
- API REST con 6 endpoint
- Frontend con mappa MapLibre GL (globo 3D + mercator), search, drawer con foto/destination/ETA/port calls
- Filtro tipo nave con conteggi in tempo reale
- Clustering GeoJSON nativo con data-driven styling
- 1478 sanzioni caricate (OFAC + EU)
- Anomaly detection attivo
- SSR pagina vessel (`/vessel/[mmsi]`) con metadata SEO
- Tutti i dati verificati end-to-end

### Da completare
- **SSR pagina porto** — `/port/[name]` e' ancora uno scheletro (endpoint API + pagina SSR da implementare)
- **Deploy** — Backend su Railway, frontend su Vercel (come da stack tecnico)
- **Ingestor come servizio** — Attualmente va lanciato manualmente, serve processo persistente
- **Cron sanzioni in produzione** — Schedulare `sync-sanctions.ts --cron` come servizio separato

### Roadmap post-MVP (dal CLAUDE.md)
- Espansione geografica oltre il Mediterraneo
- AIS spoofing detection
- Alert system (email/webhook)
- ETA prediction basata su rotta storica
- API pubblica con chiave per monetizzazione
