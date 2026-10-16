AIS VESSEL TRACKER  /  INCIDENT REPORT

Crash del backend
e ripristino del servizio

15-16 ottobre 2026 | Report tecnico con prefazione semplificata

> **Stato dell’incidente: APERTO**
> Le correzioni ai backup e alla scansione del disco sono state distribuite e verificate. Il controllo svolto per questo report ha però confermato nuovi arresti per memoria esaurita nella fase successiva della manutenzione. Il ripristino del live non equivale alla risoluzione definitiva.

## Prefazione in linguaggio semplice

Il sito è composto da una parte che mostra la mappa e da un servizio che riceve i messaggi delle navi, risponde alle richieste e conserva lo storico. La mappa può aprirsi anche quando questo secondo servizio è fermo: in quel caso non riesce a caricare o aggiornare le navi.

Durante le operazioni di manutenzione, il backend cercava di elaborare in memoria quantità di dati troppo grandi. Esauriva la memoria disponibile e si arrestava. Dopo ripetuti tentativi di riavvio, Railway aveva rimosso la distribuzione attiva: da qui la mappa senza dati.

Sono stati corretti due passaggi dei backup: la lettura dei dati per proteggere gli archivi e la creazione della copia compressa. Ora i dati vengono elaborati a blocchi. È stata inoltre resa asincrona la scansione del disco, che poteva bloccare le risposte per alcuni secondi. Il backup produttivo è riuscito e la prova finale con 20 client ha rispettato l’obiettivo di velocità.

**La verifica successiva cambia però il bilancio:** tra le 17:03 e le 18:34 UTC del 16 ottobre si sono verificati altri dieci arresti per memoria esaurita. Il processo riparte e torna a ricevere dati, ma la manutenzione completa non è ancora stabile. Questo report documenta quindi un ripristino parziale e correzioni concrete, non la chiusura dell’incidente.

Gli archivi precedenti sono stati conservati. I messaggi AIS non ricevuti durante i fermi restano mancanti: un backup non può ricreare osservazioni mai acquisite.

Perimetro: log, codice e prove del progetto. Ultimo controllo API: 16 ottobre 18:33 UTC; log degli arresti verificati fino alle 18:34 UTC. Tutti gli orari del report sono UTC; in Italia, in queste date, aggiungere due ore.


---


# 1. Architettura e impatto

## Dove si è manifestato il guasto

| Componente | Funzione | Impatto osservato |
| --- | --- | --- |
| Frontend Vercel | Mostra mappa, ricerca e schede | Raggiungibile anche mentre il backend non rispondeva. |
| Backend Railway, una replica | Riceve AIS, serve API ed esegue manutenzione | L’esaurimento di memoria interrompe contemporaneamente acquisizione e API. |
| Supabase PostgreSQL | Metadati, catalogo, soste, anomalie e stato import | Dati conservati; un errore temporaneo ha interrotto il campionamento del 16 ottobre. |
| Volume persistente | Posizioni in attesa, checkpoint e coda durevole | Preservato durante i riavvii; non risultava pieno nella diagnosi iniziale. |
| Bucket privato | Tracce, backup e archivio separato di marzo | Conservato; upload e checksum restano parte della verifica dei backup. |
| Monitor separato | Interroga /ready e metriche private | Ha registrato indisponibilità e recuperi anche quando il backend era fermo. |

## Effetti sugli utenti e sui dati

Il primo fermo mostrava HTTP 404 della piattaforma anche su **/health**, con “Application not found”. Nella ricaduta mattutina il monitor ha registrato HTTP 502. Non si trattava soltanto di un simbolo nave nascosto dall’interfaccia: mancava il servizio che alimenta la mappa.

Il flusso registra un vuoto dal **15 ottobre 06:24:02 al 16 ottobre 09:13:21**, circa 26 ore e 49 minuti. Segue una finestra di arresti intermittenti e un altro vuoto il 16 ottobre dalle **10:41:32 alle 14:50:31**, circa 4 ore e 9 minuti. I successivi riavvii serali aggiungono altre interruzioni brevi; la perdita va valutata sulle osservazioni ricevute, non sommando indisponibilità della mappa e vuoti AIS come se fossero la stessa misura.

Non è emersa una cancellazione degli archivi precedenti dovuta ai crash. L’archivio di marzo sotto **legacy/** resta separato e protetto dalle scadenze automatiche. Questa conservazione non dimostra, da sola, la completezza delle osservazioni durante il periodo di guasto.

## Distinzione necessaria

**/health** indica che il processo risponde. **/ready** controlla anche dipendenze, freschezza AIS e scritture. Un singolo risultato positivo di entrambi non certifica che il processo supererà la successiva manutenzione giornaliera.


---


# 2. Cronologia degli interventi

| Data e ora UTC | Evento | Esito |
| --- | --- | --- |
| 15 ott. 04:45-06:30 | Memoria Railway fino a circa 976 MB su limite di circa 1.024 MB. | Forte evidenza di pressione di memoria nella manutenzione. |
| 15 ott. 06:24 | Ultima attività AIS prima del fermo principale. | Inizio del lungo vuoto registrato dalla fonte. |
| 16 ott. 07:04 circa | La piattaforma rimuove il deployment dopo troppi crash. | Nessun backend attivo; frontend ancora raggiungibile. |
| 16 ott. 09:13 | Riavvio della stessa immagine c7c2a34, heap Node 384 MiB. | API e AIS ripartono; mitigazione temporanea. |
| 16 ott. 09:30 | Distribuzione 5d5a867: lettura progressiva dei riferimenti nei backup. | Prima archiviazione riuscita; correzione incompleta. |
| 16 ott. 09:44-10:41 | Nuovi arresti V8 durante la creazione del backup. | OOM confermato; seguono riavvii e un nuovo fermo. |
| 16 ott. 14:50 | Distribuzione 7baf5a3: creazione progressiva dei backup. | Live ripristinato; backup completato alle 14:55:32. |
| 16 ott. 14:58 | DATABASE_UNAVAILABLE nel campionamento tracce. | Fase interrotta e ritentabile; backup già riuscito conservato. |
| 16 ott. 15:15-15:23 | Distribuzione 57c8be9: scansione disco asincrona. | Archiviazione riuscita; prova 20 client passata. |
| 16 ott. 16:57 / 17:01 | Completati campionamento tracce e compattazione metadati. | La manutenzione raggiunge la fase successiva di pulizia. |
| 16 ott. 17:03-18:34 | Dieci nuovi FATAL ERROR per memoria esaurita. | L’incidente rimane aperto; riavvii automatici ricorrenti. |

I periodi di funzionamento fra gli arresti non vengono cancellati dal resoconto; allo stesso modo, le prove fallite e i rapporti dei monitor precedenti restano conservati. Una distribuzione con stato Railway “SUCCESS” può comunque subire riavvii del processo in seguito.


---


# 3. Cause e limiti della diagnosi

## 3.1 Memoria durante la manutenzione

Il primo ciclo di guasto è fortemente compatibile con esaurimento della memoria: picco vicino al limite del container, arresti ripetuti nella manutenzione e rimozione del deployment. Per quell’ultimo arresto originale non è disponibile una riga V8 conclusiva; l’interpretazione non va presentata come un messaggio di errore direttamente osservato.

Nel tentativo successivo, invece, la prova è esplicita: **FATAL ERROR: Reached heap limit ... JavaScript heap out of memory**. La lettura dei riferimenti era stata corretta, ma la creazione del backup continuava a raccogliere tabelle, oggetto snapshot e stringa JSON completa prima della compressione. Più rappresentazioni dello stesso contenuto coesistevano in memoria.

## 3.2 Perché il limite heap non bastava

Il parametro **--max-old-space-size=384** limita una parte della memoria gestita da V8, non l’intera memoria del processo. Buffer compressi, strutture native e altre aree contribuiscono alla memoria RSS. Il limite è una protezione e un vincolo di test: non sostituisce una riduzione dei dati materializzati insieme e non impedisce da solo gli OOM.

## 3.3 Blocco del processo durante la scansione del disco

La scansione periodica percorreva il volume con chiamate sincrone, fra cui **statSync**. Sullo stesso processo girano API e acquisizione. La prima prova remota ha isolato un burst di 20 risposte lente in coincidenza con il controllo a un minuto dall’avvio; il p95 complessivo è salito a circa sette secondi.

La coincidenza temporale, il codice bloccante e le prove successive sostengono la diagnosi. Non è stato eseguito un profilo completo che attribuisca ogni millisecondo di quel burst alla sola scansione: checkpoint e altri lavori possono contribuire. Sono state aggiunte misure separate proprio per distinguere i contributi.

## 3.4 Guasto residuo serale

I nuovi log V8 confermano altri OOM dopo il completamento di **track_compaction** e **metadata_compaction**. La sequenza delle fasi e la ripetizione dopo i riavvii localizzano il percorso sospetto nella **pulizia e raccolta dei riferimenti da proteggere**. Non è ancora provato il punto preciso dell’allocazione: serve profilare questa fase sui dati reali attuali. Non è corretto attribuire già il residuo a una singola funzione come causa definitivamente dimostrata.

L’errore database delle 14:58, gli HTTP 202 della fonte UE e i download falliti dal Mac sono eventi distinti. Nessuno di essi, da solo, spiega il messaggio V8 di memoria esaurita.


---


# 4. Correzioni distribuite

| Versione | Modifica | Protezione mantenuta |
| --- | --- | --- |
| 5d5a867 | Lettura progressiva dei backup durante la raccolta dei riferimenti, tramite stream-json. | Checksum, schema, gruppi validi e arresto della pulizia prima delle cancellazioni se la verifica fallisce. |
| 7baf5a3 | Tabelle lette per pagine; JSON e gzip prodotti progressivamente; gruppi storici mantenuti compressi. | Precisione dei dati, formati v1/v2, controllo revisioni prima e dopo la lettura, pubblicazione dopo la produzione completa. |
| 57c8be9 | Scansione del volume asincrona e senza sovrapposizioni; misure separate di checkpoint e scansione. | Nuove scritture conteggiate anche durante cancellazioni concorrenti; ultimo budget conservato se la scansione fallisce. |

## Comportamento dei backup dopo la modifica

Il percorso produttivo legge i dati recenti a pagine e valida i gruppi compressi. La compressione riceve frammenti JSON successivi. Se cambia una revisione dei metadati durante la lettura, il contenuto viene rigenerato prima dell’upload, entro i tentativi previsti. Il controllo delle revisioni tutela la coerenza rispetto alle compattazioni concorrenti; non va descritto come una transazione globale che congela ogni scrittura live.

Dopo l’upload il backend rilegge l’oggetto e confronta SHA-256. La fase è completata soltanto dopo questa verifica. Il checkpoint giornaliero evita che un errore successivo ripeta inutilmente il backup già riuscito.

## Limiti tecnici ancora presenti

L’elaborazione progressiva elimina lo snapshot interamente espanso dal percorso corretto, ma **non rende costante tutta la memoria**: il risultato gzip e l’insieme dei riferimenti da proteggere rimangono in memoria. Dimensione dei backup, numero di riferimenti, gruppi e memoria già occupata dal servizio devono essere misurati insieme. Il guasto serale dimostra che il solo superamento dei test iniziali non basta.

Gli interventi non hanno richiesto nuove migrazioni del database, un aumento di piano, la riduzione dei 90 giorni o la rimozione delle verifiche d’integrità. La gestione ordinaria delle scadenze resta distinta dalla conservazione protetta di legacy/.


---


# 5. Prove eseguite e loro significato

| Verifica | Risultato | Cosa dimostra / limite |
| --- | --- | --- |
| Lettura sintetica | Circa 138 MB di JSON; heap 64 MiB. | Il lettore gestisce quel carico senza materializzarlo integralmente. |
| Backup reale precedente | 15.042.056 byte; 69.963 riferimenti identici alla procedura precedente; heap 96 MiB. | Equivalenza dei riferimenti su quel campione, non su ogni combinazione futura di backup. |
| Scrittura e ripristino sintetici | 130.000 righe; heap 64 MiB. | Il nuovo writer produce contenuto recuperabile nel caso provato. |
| Staging reale | Tutte le righe e 673 gruppi identici; heap 96 MiB. | Confronto integrale con la rappresentazione precedente nello staging. |
| Backup produttivo 16 ottobre | 23.354.653 byte; 75,6 secondi; upload e rilettura SHA-256 riusciti. | Oggetto pubblicato verificato dal backend. Download indipendente dal Mac non terminato: non è un ripristino completo di questo nuovo oggetto. |
| Test e CI finali | 85 test locali, TypeScript, lint, build e CI superati. | Regressioni coperte dai test; non certifica il ciclo produttivo completo di più ore. |
| API e mappa | Tracce 1/7/30/90 HTTP 200; navi disegnate e AIS fresco. | Ripristino funzionale nei momenti osservati; non continuità garantita. |

## Tre prove remote, tutte conservate

| Versione / momento | Risposte valide | Errori | p95 / massimo |
| --- | --- | --- | --- |
| 7baf5a3, prima prova | 300 / 300 | 0 | 7.012 / 7.133 ms: FALLITA |
| 7baf5a3, dopo backup | 300 / 300 | 0 | 442,95 / 614,64 ms: passata |
| 57c8be9, 15:23 UTC | 300 / 300 | 0 | 328,95 / 402,22 ms: passata |

Modello di carico: 20 client simultanei, 15 burst a distanza di 13 secondi, stessa origine reale, senza IP inoltrati artificialmente. Il p95 è il tempo entro cui termina almeno il 95% delle richieste misurate. La soglia era inferiore a un secondo. La prova finale è riuscita, ma precede gli arresti serali: non può certificare la stabilità della versione per tutta la giornata.


---


# 6. Aggiornamento rilevato alla stesura

> **La chiusura dell’incidente è smentita dai log successivi**
> La verifica delle 15:25 era positiva. Il controllo del report, circa tre ore dopo, mostra nuovi arresti OOM sulla stessa versione 57c8be9. Le misure precedenti restano valide per quei momenti, ma non provano che il guasto sia definitivamente eliminato.

| Orario UTC, 16 ottobre | Evidenza |
| --- | --- |
| 16:57:03 | track_compaction completata: 5.700.723 ms, circa 95 minuti. |
| 17:01:46 | metadata_compaction completata: 285.795 ms, circa 4 minuti e 46 secondi. |
| 17:03:26 | Primo nuovo FATAL ERROR: heap esaurito. |
| 17:17-18:23 | Altri otto FATAL ERROR, alternati a riavvii e periodi operativi. |
| 18:33:33-34 | /health e /ready HTTP 200; versione 57c8be9; uptime circa 518 s; RSS circa 610 MB; quattro scritture in attesa, età circa 334 ms. |
| 18:34:05 | Decimo FATAL ERROR nella finestra raccolta, dopo il controllo API positivo. |

Il monitor aveva 194 campioni fino alle 18:33:14 UTC, con **14 campioni non operativi** e nessun minuto mancante dichiarato. Questi sono campioni di /ready, non una misura esatta dei secondi di downtime. La memoria RSS delle prime prove, circa 317-340 MB, non è un tetto: il nuovo campione è più alto e il processo viene ancora riavviato.

## Limite del contatore dei riavvii

Il campo **restarts_observed = 0** del monitor non è attendibile come prova di assenza di crash in questo caso. Il riepilogo confronta uptime di campioni adiacenti; nei campioni in cui le metriche non arrivano, il confronto può saltare il riavvio. Le righe FATAL e server_listening, unite all’uptime ridotto, hanno priorità su quel contatore.

## Conseguenza sulla qualificazione

La finestra partita il 16 ottobre alle 15:20 UTC **non può essere certificata come settimana senza guasti**. Il 23 ottobre alle 15:20 era soltanto il termine minimo teorico: gli arresti successivi invalidano quel percorso di qualificazione. Serve una nuova finestra dopo la correzione del residuo e la verifica del ciclo completo.


---


# 7. Lavoro ancora necessario

| Priorità | Azione | Criterio di completamento |
| --- | --- | --- |
| 1 - Continuità | Contenere il lavoro di pulizia che porta al nuovo OOM, proteggendo acquisizione, spool e archivi. Eventuali sospensioni devono essere esplicite e temporanee. | Nessun ciclo di crash; servizio operativo anche mentre il lavoro non urgente è sospeso o ripreso in modo controllato. |
| 2 - Causa residua | Misurare memoria prima/dopo ogni sottofase della pulizia; riprodurre con catalogo e insieme reale dei backup protetti. | Punto di allocazione identificato; prova che riproduce il guasto e passa dopo la correzione. |
| 3 - Memoria complessiva | Verificare buffer compressi, set di riferimenti, decode dei gruppi, cache e dati live insieme; valutare strutture su disco o lavorazione a partizioni. | Tutto il ciclo giornaliero dentro il limite, con margine misurato e verifiche d’integrità attive. |
| 4 - Monitor | Correlare riavvii con ultimo uptime valido e identità del processo; distinguere timeout, errori HTTP e dipendenze. | Il numero di riavvii rilevato concorda con i log e non riporta zero durante crash confermati. |
| 5 - Release | Ripetere manutenzione completa, carico e prove di recupero; avviare sette nuovi giorni sulla versione finale; verificare costo e crescita. | Nessun guasto non recuperato, p95 live < 1 s; previsione database < 450 MiB e totale <= 25 euro/mese verificati. |

La fonte sanzioni UE continua a restituire HTTP 202 durante l’importazione: mantenere l’ultima lista valida e lo stato non aggiornato esplicito. È una verifica separata dagli OOM. I costi finali e la capacità a 90 giorni non sono certificati da questo report.

# 8. Riferimenti verificabili

Codice applicato: **5d5a867** (lettura backup), **7baf5a3** (creazione backup), **57c8be9** (scansione volume). Distribuzione finale analizzata: **0b82e8ee-89c0-4454-9352-42ca310107ad**. Nessuna modifica runtime eseguita durante la redazione di questo report.

[PR #15 - consolidamento backend](https://github.com/Snaporaz6/ais-vessel-tracker/pull/15)

[PR #20 - creazione progressiva dei backup](https://github.com/Snaporaz6/ais-vessel-tracker/pull/20)

[PR #21 - scansione volume asincrona](https://github.com/Snaporaz6/ais-vessel-tracker/pull/21)

[CI della versione 57c8be9](https://github.com/Snaporaz6/ais-vessel-tracker/actions/runs/38921404099)

Fonti locali: docs/INCIDENT-2026-10-16.md; docs/STATUS.md; storage/backup.ts; storage/backup-references.ts; storage/compact-repository.ts; storage/durable.ts; server/index.ts; scripts/monitor-beta.ts. Riscontri: outputs/report-incident-2026-10-16-current-snapshot.json, outputs/report-incident-2026-10-16-current-monitor.jsonl, outputs/report-incident-2026-10-16-late-backend.jsonl e rapporti incident-2026-10-16-*.

Conclusione tecnica: ripristino funzionale ottenuto e due percorsi dei backup corretti; scansione periodica migliorata. Nuovo OOM confermato durante il seguito della manutenzione: incidente aperto e qualificazione da riavviare dopo il prossimo intervento verificato.
