# Stato della beta — 6 ottobre 2026

La versione consolidata è implementata sul ramo `codex/mediterranean-beta`. Non è ancora una beta pubblica operativa: mancano distribuzione completa, prova continuativa e misurazione della spesa.

## Completato e verificato

- Recupero selettivo della versione Desktop e di busy-raman, con copia dei sorgenti e delle modifiche locali conservata fuori dal repository. Gli originali sul Desktop sono rimasti intatti.
- Next.js 16, React 19, MapLibre 6; frontend e backend unificato compilano. Nessuna dipendenza Leaflet o chiave database nel frontend.
- Acquisizione Mediterraneo secondo formato ufficiale AIS, validazione, classe B, riconnessione e gestione distinta degli errori. Prova reale del 4 ottobre: 17 posizioni valide, 2 messaggi statici e recupero dopo disconnessione forzata.
- Storico progressivo a 90 giorni, spool durevole, caricamenti verificati e idempotenti, estremi e interruzioni conservati. Il riavvio legge lo spool a blocchi e il catalogo a pagine.
- Ricerca esatta e simile, schede aggiornate ogni 15 secondi, tracce aggiornate con l'ultima osservazione live, soste condivise e query località limitate con riepilogo esplicito.
- Manutenzioni giornaliere con recupero dopo riavvio e attesa persistente tra ritentativi. Ripristino riprendibile e verifica dei backup prima delle importazioni.
- Supabase **TRACKING SEA** ripristinato. Backup pre-migrazione verificato: 22.672 navi, 596.609 posizioni, 923 sanzioni e 5.171 anomalie. Migrazioni 002 e 003 eseguite e verificate: navi, posizioni e anomalie preservate, accesso pubblico e vecchia RPC negati, nuove RPC disponibili al backend.
- Importazione reale OFAC: 1.539 navi; UE: 672 navi dalla versione consolidata EUR-Lex del 24 luglio 2026. Totale database: 2.211 record. Il download UE resta intermittente: l'ultimo fallimento è dichiarato e la lista valida resta conservata. Questa limitazione deve essere risolta/verificata prima dell'apertura.
- 43 test automatici completi superati. Sei prove nel browser passate su desktop/telefono, comprese indisponibilità API, nomi contenenti HTML e tracce con troppe interruzioni. Verificato anche lo schema completo per nuove installazioni e il limite configurabile per volumi piccoli.
- Carico locale: 5.000 navi, 20 client simultanei, 300 richieste valide, zero errori, p95 494,56 ms. Il test remoto rispetta la quota di una singola origine e richiede 300 successi; non è ancora stato eseguito sul servizio online.
- Archivio privato Railway creato nello spazio Trial. Account Vercel Hobby accessibile; condizioni confermate con consenso dell'utente e condivisione di codice/chat per addestramento disattivata. Autorizzazione Railway CLI con spazio e progetto selezionati in attesa del consenso specifico.

## Criteri ancora aperti

1. Collegare backend Railway, volume e bucket; configurare segreti, limite di risorse, CORS, avvisi di consumo e frontend Vercel.
2. Verificare sullo stack reale acquisizione, riavvio, archivio, backup/ripristino isolato e fonti sanzioni giornaliere.
3. Eseguire la prova di carico remota e sette giorni di monitoraggio indipendente, senza sostituire dati sintetici alle misure.
4. Verificare in fatturazione una previsione totale entro 25 €/mese, inclusi imposte, traffico e staging, con tetto di 30 € e senza upgrade automatici.
5. Aprire la beta mostrando la data effettiva di inizio dello storico. I 90 giorni si accumulano durante l'acquisizione.

I rapporti di verifica e il backup pre-migrazione sono conservati nella cartella di lavoro esterna al repository; non contengono chiavi e non vengono pubblicati come sorgenti.
