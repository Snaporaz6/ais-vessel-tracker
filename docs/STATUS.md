# Stato della beta — 6 ottobre 2026

La versione consolidata è implementata sul ramo `codex/mediterranean-beta`. È distribuita online per le verifiche, ma la release non è ancora qualificata: restano ripristino isolato, prestazioni remote, ambiente di prova, sette giorni continuativi e misurazione della spesa.

## Completato e verificato

- Recupero selettivo della versione Desktop e di busy-raman, con copia dei sorgenti e delle modifiche locali conservata fuori dal repository. Gli originali sul Desktop sono rimasti intatti.
- Next.js 16, React 19, MapLibre 6; frontend e backend unificato compilano. Nessuna dipendenza Leaflet o chiave database nel frontend.
- Acquisizione Mediterraneo secondo formato ufficiale AIS, validazione, classe B, riconnessione e gestione distinta degli errori. Prova reale del 4 ottobre: 17 posizioni valide, 2 messaggi statici e recupero dopo disconnessione forzata.
- Storico progressivo a 90 giorni, spool durevole, caricamenti verificati e idempotenti, estremi e interruzioni conservati. Il riavvio legge lo spool a blocchi e il catalogo a pagine.
- Ricerca esatta e simile, schede aggiornate ogni 15 secondi, tracce aggiornate con l'ultima osservazione live, soste condivise e query località limitate con riepilogo esplicito.
- Manutenzioni giornaliere con recupero dopo riavvio e attesa persistente tra ritentativi. Ripristino riprendibile e verifica dei backup prima delle importazioni.
- Supabase **TRACKING SEA** ripristinato. Backup pre-migrazione verificato: 22.672 navi, 596.609 posizioni, 923 sanzioni e 5.171 anomalie. Migrazioni 002 e 003 eseguite e verificate: navi, posizioni e anomalie preservate, accesso pubblico e vecchia RPC negati, nuove RPC disponibili al backend.
- Importazione reale OFAC: 1.539 navi; UE: 672 navi dalla versione consolidata EUR-Lex del 24 luglio 2026. Totale database: 2.211 record. L'importazione UE scopre ora la versione più recente dall'indice ufficiale: prova reale riuscita il 6 ottobre, senza fissare la data nel codice. Un successivo download OFAC fallito ha conservato la lista valida; il backend Railway ha recuperato automaticamente OFAC alle 18:40 UTC. Entrambe le fonti risultano aggiornate. La continuità giornaliera resta da misurare.
- 47 test automatici completi superati, comprese consegna dei metadati durante archiviazioni lunghe e attesa delle scritture in corso prima del backup. Sei prove nel browser passate su desktop/telefono, comprese indisponibilità API, nomi contenenti HTML e tracce con troppe interruzioni. Verificato anche lo schema completo per nuove installazioni e il limite configurabile per volumi piccoli.
- Carico locale: 5.000 navi, 20 client simultanei, 300 richieste valide, zero errori, p95 494,56 ms. Prima prova remota: 20 client simultanei, 300 successi, zero errori, p95 1.444 ms: il criterio di un secondo non è ancora superato. Il test rispetta la quota di una singola origine senza falsificare indirizzi.
- Controlli delle dipendenze di produzione senza vulnerabilità note dopo l'aggiornamento di `proxy-addr` a 2.0.8. Tutti i controlli GitHub sul commit `7bbbbae` sono superati: lint, compilazione, 45 test, sei prove browser, carico locale e audit. La correzione della coda aggiunge due test; la CI sarà rieseguita sul nuovo commit.
- Archivio privato Railway e volume persistente creati nello spazio Trial. Volume da 500 MB collegato a `ais-backend` su `/data`; limite applicativo impostato a 400.000.000 byte. Docker, una replica, healthcheck `/health` con timeout 120 s e draining 30 s configurati. Credenziali soltanto nel backend; CORS limitato al dominio frontend. Prima distribuzione riuscita (`7663e3e0`), API pubblica su `https://ais-backend-production-4e50.up.railway.app`. AIS, database e bucket raggiungibili. La verifica reale ha individuato una coda dei metadati bloccata dalla manutenzione iniziale: ora la consegna procede indipendentemente, con attesa condivisa tra backup e arresto. La correzione deve essere verificata online.
- Frontend Vercel Hobby distribuito: `https://ais-vessel-tracker.vercel.app`, commit `7bbbbae`, stato Ready. Mappa reale accessibile senza account. Ramo di produzione `codex/mediterranean-beta`, directory `frontend`, sorgenti condivisi inclusi e Node.js 24 verificati. App GitHub limitata al repository AIS e accesso Railway CLI autorizzati dall'utente. Condizioni Vercel confermate con condivisione di codice/chat per addestramento disattivata.

## Criteri ancora aperti

1. Verificare online la correzione della coda, configurare avvisi di consumo e predisporre un ambiente di prova isolato.
2. Verificare sullo stack reale acquisizione, riavvio, archivio, backup/ripristino isolato e fonti sanzioni giornaliere.
3. Eseguire la prova di carico remota e sette giorni di monitoraggio indipendente, senza sostituire dati sintetici alle misure.
4. Verificare in fatturazione una previsione totale entro 25 €/mese, inclusi imposte, traffico e staging, con tetto di 30 € e senza upgrade automatici.
5. Aprire la beta mostrando la data effettiva di inizio dello storico. I 90 giorni si accumulano durante l'acquisizione.

I rapporti di verifica e il backup pre-migrazione sono conservati nella cartella di lavoro esterna al repository; non contengono chiavi e non vengono pubblicati come sorgenti.
