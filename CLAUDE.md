# AIS Vessel Tracker — indicazioni per lo sviluppo

## Obiettivo e limiti
Beta pubblica Mediterraneo senza account: mappa live, ricerca, schede, storico progressivo 90 giorni, soste rilevate, anomalie e controlli OFAC/UE. Tetto 30 €/mese; apertura soltanto con previsione totale verificata ≤25 € e sette giorni di osservazione. Copertura globale, notifiche, monetizzazione e riconoscimento porti rinviati.

## Comandi
Node ≥22, preferito 24 LTS. `npm ci` e `npm --prefix frontend ci`.
- Backend unico: `npm run dev:server`; produzione `npm run build` poi `npm start`.
- Frontend: `npm run dev:frontend`; build `npm run build:frontend`.
- Controlli: `npm run verify`, `npm run lint`, `npm run build`.
- Browser: `npx playwright install chromium`, `npm run test:e2e`.
- Carico: `npm run test:load`; AIS reale: `npx tsx scripts/verify-live.ts`.
- Backup/ripristino/migrazione: seguire `docs/OPERATIONS.md`; backup verificato obbligatorio prima del SQL.

## Architettura
`server/index.ts` è l'unico processo API + acquisizione + cron. Supabase PostgreSQL conserva metadati, eventi, soste, importazioni e catalogo. Ultime posizioni in memoria, checkpoint e spool/outbox fsync sul volume, tracce gzip in bucket privato per MMSI/giorno UTC. Una sola replica Railway; frontend Next.js 16/React 19 su Vercel Hobby per uso personale non commerciale. Niente TimescaleDB, Redis, Leaflet o query Supabase dal frontend.

`shared/types.ts` definisce i contratti; `shared/config.ts` definisce le soglie; `shared/runtime.ts` valida l'ambiente. API/browser devono cambiare insieme. Errori database/bucket non sono risultati vuoti validi; valori AIS mancanti sono null.

## Convenzioni e punti delicati
- Sottoscrizione ufficiale `APIKey`, `BoundingBoxes: [[[latMin,lonMin],[latMax,lonMax]]]`. Posizioni e metadati classe A/B. Conferme/errori del servizio distinti dai dati; niente inversione automatica coordinate.
- `INGESTOR_BBOX`: latMin,lonMin,latMax,lonMax entro 30,-6,46,36.5. HTTP mappa: lonMin,latMin,lonMax,latMax.
- Live deduplicato ogni 2 s; storico ordinario 1/5/30/120 minuti per 48h/7d/30d/90d, più punti significativi. Anomalie analizzate sul live prima del campionamento.
- Scrittura archivio: oggetto immutabile + rilettura/checksum → catalogo → eliminazione sola parte spool verificata. Retry idempotenti; append durante upload devono restare sul volume. Conservare oggetti citati dai backup recenti.
- Riavvio: checkpoint, archivio, spool e outbox ricostruiscono ultime posizioni, cooldown e soste. Non usare un vuoto dell'intero servizio come anomalia della singola nave.
- Un solo StopDetector alimenta schede e località. Chiamare le soste “soste rilevate”; nessun catalogo porti disponibile.
- Sanzioni sostituite atomicamente con staging validato; mantenere liste valide sui guasti. Esplicitare disponibilità, data, fonte e ambito, anche nelle corrispondenze.
- MapLibre imperativo in useEffect, cleanup remove, GeoJSON clustering. Popup DOM con textContent; mai HTML interpolato da AIS. Interrompere tracce sui vuoti, preservare primo/ultimo punto.
- Next.js richiede worker e modulo condiviso MapLibre insieme in `frontend/public/maplibre/`. I ganci predev/prebuild li copiano dalla versione installata; non committare file generati. Verificare che una nave disegnata sia selezionabile: la presenza del canvas non prova il caricamento del worker.
- Import frontend dei moduli condivisi senza suffisso .js (Turbopack); backend NodeNext con .js.
- Log strutturati sanitizzati. Segreti soltanto backend; mai stampare chiavi/risposte credenziali o committare env. RLS e revoca accesso anonimo anche alle vecchie RPC.
- Non cancellare tabella legacy o applicare migrazioni remote senza backup verificato. Nuovo schema additive in `scripts/migrations/`.
- DEMO_MODE vietato in produzione; demo e staging usano dati, volume e database separati.

## Dipendenze con motivo
Backend: ws (AIS), express/cors/helmet/express-rate-limit/compression (API), dotenv/zod (config), @supabase/supabase-js (metadati), @aws-sdk/client-s3 (bucket), geolib (distanze), node-cron (UTC), fast-xml-parser (OFAC), cheerio (tabella UE Annex XLII).
Frontend: next/react/react-dom/maplibre-gl. Dev: typescript/tsx/types, eslint/parser/plugin (controlli), prettier (formattazione), @playwright/test (browser), @electric-sql/pglite (PostgreSQL locale).
Documentare il motivo prima di aggiungere altre dipendenze.

## Verifiche necessarie
Testare le conseguenze: corruzione/upload falliti, catalogo indisponibile, messaggi malformati/duplicati/fuori ordine, riavvio prima del checkpoint, lista sanzioni conservata, estremi/svolte/vuoti 90 giorni, permessi anonimi e ripristino. Evitare test che ripetano soltanto l'implementazione. Controllo completo desktop/telefono e 20 utenti p95<1s, poi sette giorni su infrastruttura reale con costi misurati. Distinguere sempre verifica locale, dati reali e servizi cloud.

README e OPERATIONS contengono le istruzioni operative; ClaudeWork è un diario storico e non prova lo stato della beta attuale.
