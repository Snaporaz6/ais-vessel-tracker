# Avvio, migrazione e gestione della beta

## Stato e ordine di esecuzione

La verifica locale non autorizza a dichiarare la beta pronta. Completare, nell'ordine: ripristino Supabase esistente → backup verificato → migrazione additive → bucket e volume persistenti → ambiente di prova → acquisizione reale e importazioni → ripristino completo su destinazione isolata → sette giorni di misura → previsione totale entro 25 €/mese → apertura pubblica.

Conservare una copia dei sorgenti locali, anche non registrati, prima del consolidamento. Le credenziali restano nei file di ambiente locali o nei secret manager delle piattaforme. Nessuna chiave Supabase, AIS o S3 sul frontend.

## Database esistente: backup prima del SQL

1. Riattivare il progetto **esistente** dalla console Supabase sul piano gratuito; attendere stato sano e API raggiungibile.
2. Fermare il vecchio acquisitore per ottenere un backup coerente. Non fermare o cancellare altri processi.
3. Con `.env.local` backend configurato:

```sh
LEGACY_BACKUP_DIR=./data/pre-migration npx tsx scripts/preflight.ts
```

Lo strumento legge le tabelle legacy in pagine, comprime le righe, rilegge ogni file e verifica conteggio/checksum. Il manifesto deve contenere `verified: true` e quattro backup verificati: vessels, vessel_positions, sanctions, anomaly_events. Un progetto irraggiungibile **non** genera un backup valido. Copiare il backup verificato anche fuori dal volume applicativo.

4. Per il database esistente eseguire `scripts/migrations/002-mediterranean-beta.sql` e poi `003-bounded-stop-queries.sql` nel SQL Editor. Per una destinazione completamente nuova, eseguire `scripts/init-db.sql`, che include schema iniziale e le migrazioni beta senza TimescaleDB.
5. Verificare ancora conteggi legacy e presenza delle tre nuove tabelle; provare la ricerca con il service role. Verificare che anon/authenticated non possano leggere le tabelle né eseguire le vecchie RPC.
6. Solo dopo il backup e la configurazione del bucket:

```sh
VERIFIED_DATABASE_BACKUP=./data/pre-migration/manifest.json npm run migrate:legacy -- --apply
```

La tabella vessel_positions rimane intatta. Il cursore avanza soltanto dopo upload verificato e catalogazione. Ripetere il comando dopo un guasto riprende l'importazione senza duplicati. Importa gli ultimi 90 giorni disponibili nel Mediterraneo; non inventa osservazioni mancanti. Dopo confronto di estremi e conteggi, pianificare separatamente la rimozione dei dati legacy ormai inutili: non è automatica.

## Railway: backend unico

Collegare il ramo verificato al progetto Railway. Il Dockerfile compila API, acquisitore, storage e script. Impostare nella console una replica, comando di avvio `node dist/server/index.js`, healthcheck `/health` (timeout 120 s), restart ON_FAILURE (10 tentativi) e almeno 30 s di attesa per arresto ordinato: un'interruzione AIS non deve causare cicli di riavvio.

Nel contenitore le dipendenze di sviluppo sono rimosse. Usare gli script compilati: `npm run backup:prod`, `npm run restore:prod -- --confirm-empty-target`, `npm run migrate:legacy:prod -- --apply`, `npm run sync:sanctions:prod` e `npm run preflight:prod`, con le stesse variabili e verifiche richieste nei passaggi sotto. `npm run monitor:beta:prod` è disponibile per un contenitore di monitoraggio **indipendente** dal backend. I comandi senza suffisso `:prod` sono per il checkout locale con dipendenze di sviluppo installate.

- Volume persistente montato su `/data`; `STORAGE_DIR=/data`. Impostare `STORAGE_MAX_BYTES` sotto la capacità effettiva del volume, lasciando almeno il 20% libero per checkpoint e sostituzioni atomiche. Il massimo applicativo è 4 GiB; sui volumi più piccoli occorre ridurlo.
  Il volume Trial configurato il 6 ottobre 2026 offre 500 MB: usare `STORAGE_MAX_BYTES=400000000`. Gli avvisi di occupazione del volume nella console richiedono Pro; usare le metriche applicative senza acquistare quel piano.
- Bucket S3 **privato**, credenziali con accesso al solo bucket necessario; configurare S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION. Usare S3_FORCE_PATH_STYLE solo se richiesto dal provider.
- NODE_ENV=production, DEMO_MODE=false, credenziali Supabase/AIS, ADMIN_TOKEN di almeno 24 caratteri.
- PORT è assegnato dalla piattaforma e prevale su API_PORT.
- CORS_ORIGINS contiene gli URL esatti del frontend ammesso, separati da virgola, senza slash finale né wildcard.
- Limite CPU/RAM iniziale da verificare: 0,5 vCPU / 512 MiB. Disabilitare scalabilità automatica, repliche aggiuntive e aumento automatico del piano.
- Configurare avvisi di consumo a 20/25 €, tetto coerente con 30 € inclusi tasse/traffico e controllo della spesa anche durante staging.

La cartografia è richiesta direttamente al provider dal browser. Il backend tiene otto risposte live compresse per due secondi e una cache decodificata archivio di massimo 64 MB. Il volume usa il limite configurato in `STORAGE_MAX_BYTES`, con metriche e degrado esplicito.

## Vercel Hobby: frontend personale non commerciale

Collegare la cartella `frontend`; Next.js 16, installazione `npm ci`, build `npm run build`. Il progetto importa anche `../shared`: mantenere disponibili i file esterni alla root frontend nelle impostazioni del progetto.

Configurare soltanto:

```env
NEXT_PUBLIC_API_URL=https://backend-esempio.up.railway.app
API_BASE_URL=https://backend-esempio.up.railway.app
```

Il primo URL è incorporato nella build del browser; il secondo serve alle pagine SSR. Entrambi devono puntare al backend della stessa versione. Aggiornare CORS_ORIGINS con il dominio esatto del frontend. Evitare chiavi Supabase anon: l'interfaccia accede esclusivamente all'API.

## Ambiente di prova separato

I test automatici utilizzano demo esplicita, volume temporaneo, PostgreSQL locale e browser desktop/mobile, senza segreti cloud. Per prove con dati reali predisporre un database isolato, un bucket o prefisso separato e un volume separato; mai usare il database di produzione per test di guasto o ripristino.

Vercel Preview deve puntare al backend di staging e non a quello pubblico. Non mantenere contemporaneamente due stack pagati oltre il budget: spegnere lo staging dopo la verifica, oppure alternare le prove senza toccare i dati produzione. Sul piano Supabase gratuito non presupporre branching a pagamento; per i test SQL è disponibile PostgreSQL locale con PGlite.

## Manutenzione, controlli e importazioni

- Ogni 500 ms, se necessario: consegna outbox, idempotente.
- Ogni minuto: checkpoint live e controllo occupazione volume.
- Ogni ora: archiviazione gzip con rilettura/checksum e aggiornamento inizio storico.
- 03:00 UTC: import OFAC e UE, staging + sostituzione atomica.
- 03:30 UTC: flush, backup verificato, compattazione e retention 90 giorni.
- Ultimi sette giorni: backup conservati e oggetti citati protetti dalla pulizia.

Il volume conserva `maintenance-checkpoint.json` con l'ultimo giorno UTC completato per ciascun lavoro. All'avvio vengono recuperati i lavori scaduti: importazione e manutenzione restano nella coda dell'unica istanza. Un fallimento conserva il lavoro da eseguire e viene ritentato dopo cinque minuti, anche dopo un riavvio. La manutenzione conta come riuscita soltanto dopo backup verificato e compattazione completata; una semplice accodatura non registra un successo.

`/health` controlla il processo. `/ready` controlla database, bucket, connessione/freschezza AIS e volume; deve restare 200 nella prova operativa. `/admin/metrics` richiede ADMIN_TOKEN e mostra memoria/CPU, dimensione database, archivio catalogato, volume, outbox, errori e uptime. Non pubblicare il token in URL o report.

Il riavvio legge lo spool a blocchi conservando soltanto l'ultima posizione per nave e scorre il catalogo a pagine. Un singolo archivio nave/giorno deve restare entro 64 MiB decodificati e 100.000 punti; una query può elaborare al massimo 100.000 punti prima della riduzione a 5.000 visualizzati. Una finestra eccessiva restituisce 422 e chiede un periodo più breve, senza cancellare dati. Le pagine località interrogano al massimo 51 soste entro 500 metri: mostrano le ultime 50 e dichiarano quando il riepilogo è limitato.

Gli errori del servizio compaiono nei log con eventi sanitizzati. Sul limite volume o guasti persistenti intervenire prima che lo spool si esaurisca; non eliminare manualmente file non ancora archiviati.

Per la prima importazione:

```sh
npm run sync:sanctions
```

La fonte UE deve restituire la tabella ufficiale Annex XLII; risposte 202, challenge, pagine vuote o documenti diversi sono fallimenti e conservano la lista precedente. Si può configurare EU_SANCTIONS_URL con l'URL HTTPS **ufficiale EUR-Lex** di una versione consolidata accessibile. Non aggirare challenge né presentare la lista finanziaria generica come elenco completo delle navi. Se la fonte è indisponibile, l'interfaccia deve dirlo. Verificare l'importazione delle due fonti prima dell'apertura.

## Backup e ripristino provato

```sh
npm run backup
```

Il risultato contiene chiave oggetto e SHA-256. Scaricare e verificare una copia in uno spazio di conservazione separato. Il backup contiene metadati, anomalie, soste, catalogo, liste e stato importazioni; gli oggetti traccia restano nel bucket. Per un recupero completo servono **backup + oggetti citati + volume/spool non ancora archiviato**.

Su database di destinazione isolato, vuoto e con lo stesso schema, bucket contenente gli oggetti citati e volume nuovo:

```sh
BACKUP_KEY=backups/chiave.json.gz BACKUP_SHA256=checksum npm run restore -- --confirm-empty-target
```

Lo script controlla checksum backup, presenza/checksum di ogni traccia e destinazione vuota **prima** di scrivere. Riassegna gli ID seriali locali e assegna chiavi stabili agli eventi legacy; verifica i conteggi dopo ogni tabella. Non sovrascrive una produzione popolata.

Il backend di destinazione deve essere fermo durante il ripristino. Conservare `restore-session.json` sul volume isolato: lega il ripristino allo stesso backup e alla stessa destinazione. Dopo un guasto ripetere il comando con gli stessi parametri senza eliminare questo file. Lo script riconcilia anche scritture parziali già confermate dal database, verifica le righe presenti e riprende senza duplicare gli ID seriali; rifiuta righe estranee o modificate.

Riprovare scheda, ricerca, una traccia per ogni fascia temporale e gli estremi delle interruzioni. Conservare un rapporto con conteggi, checksum e data. I test locali coprono il meccanismo; la prova contro i servizi cloud deve essere eseguita prima della release.

## Sette giorni e budget

Da un processo di monitoraggio indipendente dal backend (la sua interruzione non deve interrompere le misure), con BETA_URL e ADMIN_TOKEN configurati:

```sh
BETA_URL=https://backend-esempio.up.railway.app npm run monitor:beta
```

Una lettura al minuto viene registrata con fsync. I fallimenti non vengono omessi. Il rapporto non supera il gate finché mancano sette giorni reali, ci sono guasti/riavvii, manutenzioni fallite, fonti sanzioni non aggiornate, troppe misure assenti, database proiettato oltre 450 MiB o costo totale verificato mancante/superiore a 25 €. Non sostituire dati di esempio al monitoraggio reale.

Misurare sullo stesso periodo RAM media, CPU, volume, egress effettivamente fatturato, archivio e backup (inclusi oggetti vecchi protetti per sette giorni), crescita database e proiezione a 90 giorni. L'archivio catalogato non include da solo tutto lo spazio fatturato del bucket: confrontare le metriche con la console Railway.

Indicazione progettuale: 20 € backend/volume, 2 € archivio, 8 € margine. Railway ha costi variabili; il minimo Hobby non si somma automaticamente ai crediti già inclusi. Convertire il totale USD al cambio effettivo, includere imposte e costo dello staging, e verificare la stima in fatturazione. Fonti: [Railway pricing](https://railway.com/pricing), [bucket](https://docs.railway.com/storage-buckets), [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing).

Dopo la verifica in fatturazione, impostare `VERIFIED_MONTHLY_TOTAL_EUR` al totale stimato (numero con punto decimale) e ricalcolare usando `--once`. Il valore è una misura verificata dall'operatore, non un preventivo inventato dal programma.

Ripetere la prova di carico sul servizio reale:

```sh
LOAD_TEST_URL=https://backend-esempio.up.railway.app npm run test:load
```

Richiesto p95<1 secondo con 20 visitatori e nessun errore. La prova locale è preliminare e non attesta latenza Internet o costi cloud.

## Rollback

Prima di ogni distribuzione annotare commit/backend/frontend, mantenere backup verificato e snapshot recuperabile del volume. Le migrazioni beta sono additive: un rollback del codice non elimina i nuovi dati.

Se la nuova versione degrada: interrompere l'acquisizione nuova con arresto ordinato; ripristinare l'ultima distribuzione **compatibile con l'archivio beta**, stesso volume e bucket; riallineare il frontend allo stesso contratto API; verificare /health, /ready, ultime osservazioni e tracce. Il vecchio MVP su main scrive soltanto vessel_positions e usa un contratto live diverso: non è un rollback compatibile senza migrazione inversa verificata.

Se i dati sono compromessi, ripristinare prima su destinazione isolata e verificarla, quindi spostare il backend dopo il confronto. Non cancellare produzione o spool durante la diagnosi. Ripartire con la prova di stabilità dopo un guasto non recuperato.

## Condizioni di apertura

Compilazioni/CI verdi, AIS reale e riconnessione verificati, fonti sanzioni aggiornate o limite dichiarato con decisione esplicita, backup/ripristino cloud provato, interfaccia desktop/telefono verificata, carico remoto entro soglia, sette giorni senza crash non recuperati e costo totale ≤25 €. Pubblicare come **beta**, mostrando da quale data esiste realmente lo storico. I 90 giorni si accumulano con l'acquisizione.

Il precedente formato railway.toml è deprecato per i nuovi servizi: questo repository usa Dockerfile e impostazioni della console. Eventuale IaC deve seguire la [documentazione attuale](https://docs.railway.com/infrastructure-as-code/reference), con un piano esaminato prima dell’applicazione.
