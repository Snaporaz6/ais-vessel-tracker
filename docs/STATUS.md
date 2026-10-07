# Stato della beta — 7 ottobre 2026

La [beta Mediterraneo](https://ais-vessel-tracker.vercel.app) è online senza account per le verifiche, con dati AIS reali. La release resta da qualificare: ambiente cloud di prova, ripristino su quel database, sette giorni sulla versione finale e costo mensile verificato. Il ramo è `codex/mediterranean-beta`; main resta invariato e la [proposta #2](https://github.com/Snaporaz6/ais-vessel-tracker/pull/2) resta in bozza.

## Implementazione verificata

- Versione consolidata a partire da main, con recupero selettivo di busy-raman. Sorgenti Desktop e modifiche locali preservati fuori dal repository.
- Next.js 16 / React 19 / MapLibre 6; frontend Vercel Hobby, backend unico Railway EU West con una replica, volume persistente e bucket privato. Database Supabase esistente ripristinato. Segreti soltanto nel backend e CORS limitato al frontend.
- Sottoscrizione AIS ufficiale sul Mediterraneo, classi A/B, validazione, riconnessione e arresto ordinato. La prova AIS reale ha verificato il recupero dopo disconnessione forzata; le interruzioni del servizio sono registrate.
- Storico progressivo a 90 giorni, spool durevole, upload verificati prima della cancellazione della copia temporanea, estremi e vuoti preservati. Ripartenza a blocchi, catalogo paginato, cache e query limitate. I 90 giorni si accumulano: lo storico reale inizia il **6 ottobre 2026 alle 18:39:55 UTC**.
- Ricerca MMSI/IMO e similarità del nome, schede aggiornate, tracce 1/7/30/90 giorni, soste rilevate con algoritmo condiviso, anomalie persistenti e fonti sanzioni esplicite. Popup sicuri e interfaccia italiana desktop/telefono. Il worker cartografico viene distribuito con il modulo condiviso della stessa versione; i test selezionano punti realmente disegnati sulla mappa.
- Migrazioni additive 002/003 verificate dopo backup pre-migrazione: 22.672 navi, 596.609 posizioni legacy, 923 sanzioni e 5.171 anomalie preservate al momento della migrazione. Accesso pubblico a tabelle e vecchia RPC negato. La retention successiva degli eventi scaduti è distinta dalla verifica pre/post migrazione.
- **51 test automatici e otto prove browser** superati, oltre a compilazioni backend/frontend, lint, carico locale e audit delle dipendenze di produzione. [CI del commit d9e6257](https://github.com/Snaporaz6/ais-vessel-tracker/actions/runs/37677305358) superata; include guasti archivio, append concorrenti, ripristino parziale, campionamento di 90 giorni, PostgreSQL e permessi.

## Prove sui servizi reali

**Backup e ripristino.** Il 6 ottobre un backup di Supabase e bucket Railway è stato ripristinato in PostgreSQL locale isolato (PGlite): 25.789 navi, 669 tracce catalogate, 2.211 sanzioni; verificati tutti i 669 checksum traccia e le righe ripristinate. Questa prova usa i dati cloud, ma la destinazione è locale: non sostituisce il ripristino nel database cloud di staging. Il backup automatico del 7 ottobre alle 04:23 UTC è stato scaricato e verificato: 27.541 navi, 120 anomalie, 7.680 soste, 10.548 tracce, 2.211 sanzioni. Verificati anche tre oggetti traccia di quel backup; non è dichiarata una seconda verifica completa dei 10.548 oggetti.

**Carico remoto.** Da un servizio indipendente Railway EU West, attraverso l'URL pubblico: 20 client simultanei, 300 richieste valide, zero errori, **p95 243,34 ms**, massimo 794,70 ms. Ripetuta dopo l'ottimizzazione il 7 ottobre: 300 risposte valide, zero errori, **p95 267,94 ms**, massimo 347,24 ms. La quota di una singola origine è rispettata, senza intestazioni IP simulate. La prova dal Mac aveva p95 1.516,94 ms: il risultato europeo verifica la soglia nel punto di misura indicato, non garantisce latenza inferiore a un secondo da qualsiasi rete.

**Primo giorno di esercizio.** Alle 19:36 UTC del 7 ottobre, uptime backend 88.683 secondi (circa 24,6 ore), senza riavvii osservati. Database 200.854.675 byte, archivio catalogato 20.456.741 byte, volume occupato 16.875.105 byte su 400.000.000 consentiti; RSS circa 412 MiB. Il monitor indipendente aveva 1.455 letture, cinque minuti mancanti durante la configurazione iniziale e una lettura non operativa. È registrata una disconnessione AIS di circa 33 secondi alle 15:01 UTC, recuperata automaticamente.

**Manutenzione giornaliera.** OFAC aggiornata il 7 ottobre alle 03:42 UTC (1.539 navi); UE aggiornata alle 06:14 UTC (672 navi). Il primo download UE era fallito conservando la lista valida; il ritentativo automatico è riuscito. Backup/manutenzione completati alle 06:14 UTC. Gli orari effettivi sono stati ritardati dalle archiviazioni seriali in corso.

**Correzione delle prestazioni di archiviazione.** Il primo giorno ha evidenziato cicli di 70–73 minuti. Il backend `d9e6257`, distribuito il 7 ottobre alle 19:50 UTC, trasferisce fino a otto archivi piccoli insieme, elabora quelli grandi da soli e ricompatta i dati freddi soltanto al cambio di fascia o alla scadenza. I test verificano attesa di tutti i trasferimenti dopo un errore, conservazione delle nuove osservazioni e recuperabilità dai backup. Il primo ciclo reale è terminato alle 20:00 UTC in **618.168 ms (10 minuti e 18 secondi)**, senza errori; la raccolta è rimasta attiva. Alle 20:07 UTC RSS 329 MB, volume 11,9 MB e nessuna scrittura metadati in attesa. `archive_flushed_at` ora indica il completamento effettivo; i log includono la durata.

**Monitoraggio e costo.** Il servizio indipendente registra una misura al minuto su un volume separato e continua anche oltre sette giorni. La nuova finestra, iniziata alle **19:53:25 UTC del 7 ottobre**, usa `/data/beta-monitor-2026-10-07.jsonl`; il file precedente e i suoi errori restano conservati. La spesa Railway rilevata il 7 ottobre era **0,26494 USD** per il periodo corrente: è una misura iniziale, non una previsione mensile. Lo spazio è Trial e rifiuta i limiti personalizzati senza abbonamento attivo; nessun piano pagato è stato attivato. La crescita iniziale del database non è ancora una proiezione affidabile a 90 giorni.

## Criteri ancora aperti

1. Completare l'ambiente cloud isolato, il ripristino completo e le verifiche UI/API su quella destinazione. Il progetto Supabase gratuito `ais-beta-staging` è stato creato dall'utente in Irlanda; schema iniziale applicato su PostgreSQL 17.11 e RLS/permessi verificati sulle sette tabelle. Il ripristino attende la configurazione locale della chiave service_role dello staging; il controllo delle app del Mac si è interrotto.
2. Confermare la durata dei cicli successivi e lo smaltimento dello spool con i consumi reali; conservare le prove del riavvio previsto.
3. Completare sette giorni reali, verificando recupero dei guasti, backup e importazioni giornaliere, crescita del database e spazio effettivo del bucket, inclusi oggetti protetti dai backup.
4. Verificare previsione totale entro **25 €/mese**, con imposte, traffico e staging, sul tetto di 30 €. Impostare avvisi e limiti disponibili senza upgrade automatici.

Procedure in [OPERATIONS.md](OPERATIONS.md). Rapporti e backup sono conservati fuori dal repository; nessuna credenziale viene pubblicata. L'accessibilità dell'URL non equivale al superamento dei criteri di release.
