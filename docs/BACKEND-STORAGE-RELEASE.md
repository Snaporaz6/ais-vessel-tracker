# Archivio separato e affidabilità — 13 ottobre 2026

## Stato delle operazioni

Questo documento riguarda il ramo `codex/backend-storage-reliability`. Il codice
non è ancora distribuito. La produzione conserva le posizioni di marzo nel bucket
privato; la tabella legacy è stata svuotata dopo tutte le verifiche.
Non considerare conclusa la qualificazione della beta.

- Esportate tutte le 596.609 posizioni dal 6 al 15 marzo 2026 in 24 parti gzip,
  9.893.716 byte complessivi, con tutti gli otto campi originali.
- Ogni parte caricata nel bucket privato è stata scaricata e verificata tramite
  SHA-256. Un ripristino completo in PostgreSQL isolato ha verificato tutte le righe.
- Prefisso protetto: `legacy/march-2026/2026-10-12T22-05-11-802Z`.
  Copia locale conservata fuori da Git. Non applicare scadenze a `legacy/`.
- Fingerprint PostgreSQL della sorgente e del ripristino identiche. Il 13 ottobre
  alle 19:47:42 UTC la transazione protetta ha svuotato soltanto la tabella legacy,
  mantenendo schema e vincoli. Spazio recuperato: 161.513.472 byte.
  `/ready`, live e tracce 1/7/30/90 giorni restano 200; database circa 118,6 MB.
- Backup pre-migrazione di produzione verificato: 14.636.141 byte,
  `backups/2026-10-13T19-17-35-758Z-c0fa4a1037fbf6f20751c370abeaa6cc0aeb538e2e07c4c7a04bb1b179196c08.json.gz`.
  Anche i rapporti e backup precedenti rimangono conservati.
- La migrazione 004 è stata applicata nello staging; la sua ultima revisione
  è stata allineata e verificata il 13 ottobre. La produzione ha ricevuto 005; 004 resta da applicare dopo la prova fisica.
- Il confronto delle 669 tracce dello staging dopo compattazione è riuscito.
  Il ripristino completo del primo backup v2 in PostgreSQL isolato è riuscito;
  anche il formato con 670 gruppi compressi è stato scaricato e ripristinato
  integralmente, verificando 25.789 navi, 669 tracce, 2.211 sanzioni, due anomalie,
  tre soste e due stati delle importazioni.

## Migrazioni e rimozione controllata del legacy

Applicare 004 e 005 soltanto dopo un backup verificato. La 005 crea funzioni:
**non svuota la tabella**. Prima della rimozione, confrontare la fingerprint
PostgreSQL della sorgente con quella della copia ripristinata; questo confronto
comprende la precisione dei timestamp e dei numeri originali.

`npm run retire:legacy -- --confirm-verified-archive` richiede
`LEGACY_VERIFIED_MANIFEST` impostato sul manifesto locale verificato e le normali
credenziali backend nell'ambiente. Ricontrolla manifesto, schema e tutte le parti
cloud. La transazione blocca la tabella, controlla conteggio, estremi, fingerprint,
chiavi esterne e trigger, quindi svuota senza CASCADE. Una modifica dei dati o una
dipendenza inattesa interrompe l'operazione. Dopo un timeout ambiguo, leggere
prima il conteggio: non ripetere una cancellazione senza riconciliare l'esito.

La copia archiviata resta fino a futura decisione esplicita. I 162 MB circa
attesi includono già gli indici del legacy; non contarli due volte.

## Formato dei metadati e compatibilità

`METADATA_COMPACTION=true` abilita il lettore condiviso hot/cold. Negli indici
ordinari rimangono sette giorni di catalogo, tutte le soste aperte e le soste
recentemente concluse/osservate, e sette giorni di anomalie. Gli eventi più vecchi
restano consultabili fino a 90 giorni con il loro `event_key` originale. `metadata_groups` raggruppa le righe vecchie per
nave e mese UTC, preservandone integralmente il JSON in gzip versionato e verificato.
Le tracce rimangono nei rispettivi oggetti giornalieri del bucket.

Ogni aggiornamento verifica checksum, versione precedente e righe sorgenti,
poi salva il gruppo e rimuove le righe originali nella stessa transazione.
Le letture uniscono entrambe le rappresentazioni e danno precedenza alla riga
recente; una revisione rileva migrazioni concorrenti. Le revisioni per nave
isolano le schede dalle migrazioni delle altre navi. Una RPC di sola lettura
pagina fino a 250 gruppi e 1 MiB compresso (un singolo gruppo più grande
rimane leggibile), evitando risposte senza limite e migliaia di piccoli round trip. Le query per località
selezionano prima i gruppi tramite indice geografico e ordine temporale.

La scadenza elimina soltanto i dati realmente fuori dai 90 giorni; può riscrivere
un gruppo che attraversa il limite. Le soste aperte rimangono disponibili.
Una sosta non viene unita ad altre né eliminata per la sua durata.

I backup v2 conservano le righe recenti e i gruppi compressi verificati, evitando
che il backup ordinario espanda tutto lo storico in memoria. Il lettore accetta
anche i primi backup v2 con righe già decompattate. Il ripristino ricostruisce le tabelle ordinarie su una destinazione
isolata. Con il lettore compatto, i gruppi v2 vengono ripristinati direttamente
in forma compressa: anche il recupero resta entro lo spazio del database.
Le destinazioni ordinarie ricostruiscono invece tutte le righe, per confronto
e ricostruzione. Entrambe verificano righe e tracce prima del completamento. Il lettore
continua ad accettare v1. I ripristini v2 conservano anche gli identificativi
seriali originali e riallineano le sequenze per gli inserimenti successivi.
La prova del 13 ottobre comprende anomalie hot/cold, tutti i campi e IDs,
669 oggetti riletti dal bucket e ripristino PostgreSQL completo. Lo staging è
stato poi azzerato solo dopo il confronto con il backup verificato, e recuperato
via API con 673 gruppi compressi. Un errore temporaneo durante la prima tabella
è stato recuperato dalla sessione salvata, senza duplicati: confronti completi
riusciti e database circa 22,6 MB. Un vincolo del database verifica inoltre
il checksum dei payload, impedendo aggiornamenti corrotti.
**Disabilitare il flag dopo aver compattato non è un
rollback valido:** usare una versione compatibile o il ripristino isolato verificato.

## Manutenzione e diagnosi

Le fasi giornaliere sono persistenti: flush, backup, campionamento tracce,
compattazione metadati e pulizia. Un ritentativo della pulizia conserva il backup
già riuscito nello stesso giorno. Pulizia e compattazione lavorano in sessioni
massime di 20 minuti e riprendono dalle informazioni persistenti.

La pulizia scorre solo `tracks/`, conserva catalogo, backup recenti e oggetti
creati da meno di 24 ore; salva la pagina prima delle cancellazioni. Le richieste
concorrenziali vengono completate prima di lasciare il checkpoint ritentabile.
Un ciclo incompleto non viene dichiarato riuscito.

`/ready` e il monitor riportano versione, stato delle dipendenze, stato HTTP,
errori delle richieste e anzianità delle scritture in attesa. I log riportano fase,
durata e codici sanitizzati; non conservano messaggi privati dei fornitori.
Le letture GET possono ritentare; le mutazioni del database non vengono ripetute
alla cieca. I caricamenti ripetono solo lo stesso oggetto con gli stessi byte.

## Verifiche completate sul codice

72 test automatici, TypeScript, lint e build frontend passano. Le 22 prove browser
desktop/telefono passano; otto casi esclusivi per telefono sono intenzionalmente
saltati sul progetto desktop. Carico locale: 20 client, 300 risposte valide, zero
errori e p95 560 ms. Le prove non certificano il carico remoto finale.

## Verifiche ancora necessarie

La prova fisica completa in staging proietta 443,36 MiB a 90 giorni
([misure e assunzioni](DATABASE-CAPACITY.md)); i dati del benchmark sono stati
 rimossi e il database staging è tornato a circa 22,6 MB.
Restano migrazione 004 e compattazione in produzione, carico
remoto di 20 client, distribuzione del monitor e nuova settimana sulla versione
finale. Conservare tutti i rapporti precedenti. I risultati gzip da soli non
certificano né lo spazio fisico a 90 giorni né il costo mensile entro 25 €.

Le due funzioni legacy hanno un timeout amministrativo limitato a 60 secondi,
previsto da Supabase per funzioni REST; i limiti delle API ordinarie rimangono
invariati. La procedura rifiuta anche relazioni ereditarie e usa `TRUNCATE ONLY`.
