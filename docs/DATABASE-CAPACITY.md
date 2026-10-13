# Capacità del database — analisi del 12 ottobre 2026

Aggiornamento del 13 ottobre: dopo archivio separato e ripristino completo, la
tabella legacy è stata svuotata sotto lock con confronto di tutte le righe.
Recuperati 161.513.472 byte; database circa 118,6 MB. Le misure sotto descrivono
la situazione **precedente** e gli indici legacy sono già compresi nello spazio
recuperato. La prova fisica del nuovo formato a 90 giorni è in corso in staging.

Misure dirette sul progetto Supabase di produzione, tramite sole query SELECT.
Il database misura circa 268 MB; le dimensioni qui sono byte decimali e comprendono
gli indici. Le statistiche PostgreSQL degli aggiornamenti non sono conteggi di
nuove righe né tassi giornalieri. Le scansioni nulle non provano che un indice
sia eliminabile: contano soltanto dall'ultimo reset delle statistiche.

| Tabella | Dati e strutture tabella | Indici | Totale |
|---|---:|---:|---:|
| vessel_positions, legacy | 58.089.472 | 103.456.768 | 161.546.240 |
| detected_stops | 17.014.784 | 23.527.424 | 40.542.208 |
| track_archives | 35.790.848 | 3.342.336 | 39.133.184 |
| vessels | 4.841.472 | 4.136.960 | 8.978.432 |
| anomaly_events | 2.605.056 | 1.351.680 | 3.956.736 |
| sanctions | 1.310.720 | 368.640 | 1.679.360 |
| import_states | 49.152 | 16.384 | 65.536 |

Il conteggio REST precedente conferma 596.609 posizioni legacy. Le statistiche
di questa tabella sono tutte zero: non usarle per dichiarare la tabella vuota.
Il backend beta non scrive nuove posizioni in questa tabella.

Le soste hanno circa 104.500 righe. La misura successiva della loro distribuzione
restituisce 104.509 soste, 3.037 ancora aperte, 81.177 con fine incerta, 27.545 sotto
un'ora e 2.570 di almeno un giorno. Una fine incerta riguarda osservazioni mancanti
o velocità non disponibile; non autorizza a scartare né unire quelle soste.
Il catalogo ha 61.202 righe, una per nave/giorno.

Una scansione successiva misura i dati delle righe con `pg_column_size`: catalogo
30.556.020 byte (499 byte medi per riga), soste 14.014.199 byte (134 byte medi,
104.519 righe al momento della scansione). Questi valori non includono gli indici
e non sono spazio che VACUUM possa liberare: sono informazioni ancora presenti.
Il catalogo ha quindi una componente significativa di dati utili, mentre nelle
soste gli indici superano lo spazio delle righe. I piccoli cambiamenti dei
conteggi fra misure sono dovuti all'acquisizione attiva.

Le statistiche rilevano 2.641.696 aggiornamenti sulle soste, di cui 2.634.234 HOT,
e 762.950 sul catalogo, di cui 743.448 HOT. La maggior parte degli aggiornamenti
non riscrive gli indici. Autovacuum è intervenuto: la crescita non può essere
attribuita automaticamente a una manutenzione PostgreSQL assente.

## Indici da valutare

- `idx_positions_mmsi_time`: 39.100.416 byte, `(mmsi,timestamp DESC)`. La chiave
  primaria `(mmsi,timestamp)` rimane necessaria; PostgreSQL può leggerla al
  contrario per una singola nave. Verificare i piani prima di rimuovere l'indice.
- `idx_positions_time`: 24.436.736 byte. Nessuna scansione nelle statistiche
  correnti; prima di rimuoverlo verificare query legacy e procedure di recupero.
- `stops_location_idx`: 4.325.376 byte, `(port_lat,port_lon)`, prefisso del nuovo
  `detected_stops_location_idx` con anche `arrived_at DESC`. Confrontare i piani.

Il margine potenzialmente recuperabile è circa 67,9 MB. Nessun indice è stato
rimosso e nessuna migrazione è stata applicata durante questa analisi. Conservare
definizioni, backup verificato e piani; applicare soltanto modifiche reversibili
con una procedura di ripristino. Non rimuovere chiavi primarie o dati legacy.

## Effetto sul requisito dei 90 giorni

Il monitor misura circa 13,1 MB/giorno e proietta circa 1,39 GB a 90 giorni.
Anche il recupero di tutti gli indici candidati non porterebbe la proiezione
sotto la soglia di qualificazione di 450 MiB. Il limite rimane non superato.

## Prova di compressione senza perdita

Sul backup reale del 12 ottobre alle 04:35 UTC, scaricato e verificato tramite
SHA-256, è stata simulata una rappresentazione gzip raggruppata per nave/mese.
Ogni gruppo è stato decompresso e confrontato con tutte le righe originali.

| Dati | Righe verificate | Gruppi | JSON originale | Payload gzip |
|---|---:|---:|---:|---:|
| Catalogo tracce | 57.696 | 16.649 | 37.553.680 byte | 10.951.326 byte |
| Soste concluse | 87.121 | 9.793 | 29.430.025 byte | 5.328.164 byte |

Le 3.174 soste ancora aperte sono escluse dalla compressione simulata. Nessuna
riga è stata scartata per durata breve o fine incerta. La prova conserva tutti
i campi, ma non modifica lo schema né le API e non applica la compressione in
produzione. I payload non comprendono righe/indici PostgreSQL, TOAST, metadati
dei gruppi o dati attivi: non confrontarli direttamente con il totale fisico
delle tabelle e non dichiarare da questa prova che i 90 giorni entrino nel piano
gratuito. Il rapporto e il backup privato sono fuori dal repository.

Il risultato giustifica una prova in staging di metadati storici compressi,
con indici per nave/periodo e dati recenti interrogabili. Occorre verificare anche
le query per località e traffico portuale, non soltanto le schede della nave.

La fase successiva deve misurare la crescita giornaliera separata di soste e
catalogo, confrontare spazio fisico e dati utili e progettare una rappresentazione
più compatta dei metadati storici. Le API devono conservare finestre, estremi,
vuoti e soste ricevute; le tracce compresse e la retention di 90 giorni rimangono
requisiti. Ogni rappresentazione nuova deve essere verificata in staging con
lettura comparata, backup e ripristino prima della migrazione di produzione.

Per ripetere le misure usare `scripts/database-storage-audit.sql`: transazione
di sola lettura, timeout delle istruzioni 15 secondi e dei lock 2 secondi.
La query non applica VACUUM FULL, REINDEX, cancellazioni o modifiche allo schema.

## Prova fisica del 13 ottobre — nuovo formato

Prova completata in tabelle isolate di `ais-beta-staging`, con conteggi verificati:

| Componente | Byte totali, inclusi indici |
|---|---:|
| Gruppi catalogo/soste/anomalie | 305.692.672 |
| Catalogo recente | 44.810.240 |
| Soste recenti e aperte | 48.783.360 |
| Anomalie recenti | 8.142.848 |
| Anagrafica, 116.084 navi | 29.835.264 |
| Revisioni per tutte le navi | 11.902.976 |
| Totale relazioni misurate | 449.167.360 |
| Sistema, sanzioni, importazioni e legacy vuoto: margine | 15.728.640 |
| Proiezione completa | **464.896.000 (443,36 MiB)** |

Lo scenario ripete le osservazioni della settimana su 90 giorni, sostituendo il
35% della flotta attiva ogni settimana (circa 925 nuove navi/giorno) e introducendo
hash, UUID e nomi distinti per evitare una compressione artificiosa. Le anomalie
usano le 3.152 osservazioni delle ultime 24 ore; le soste aperte non vengono
replicate. Conservate 2.465.811 righe storiche in 231.872 gruppi, oltre ai dati recenti.

La soglia di 450 MiB è rispettata in questo scenario, con circa **6,64 MiB** di
margine. Non è una garanzia per tassi di crescita differenti. La qualificazione
resta aperta: misurare crescita, traffico Supabase, memoria durante i backup e
costo totale prima di dichiarare sostenibile la beta. Il vecchio formato
proiettato oltre 1 GB resta documentato come confronto storico.


### Spazio completo del bucket — 14 ottobre

Scansione di tutti i prefissi, 380 pagine, terminata il 13 ottobre alle 22:28 UTC:
379.763 oggetti e **755.092.042 byte** complessivi. Tracce: 628.664.312 byte;
15 backup: 116.527.494 byte; archivio protetto `legacy/`: 9.900.236 byte.
Il catalogo attivo da solo misura circa 116 MB e non rappresenta l'intero bucket:
sono presenti anche versioni precedenti e oggetti tutelati dai backup. Non
classificarli come eliminabili senza verificare i riferimenti e la retention.
La scansione paginata durante l'acquisizione non è uno snapshot atomico.
La misura di spazio non certifica traffico, costi né durata della pulizia.
