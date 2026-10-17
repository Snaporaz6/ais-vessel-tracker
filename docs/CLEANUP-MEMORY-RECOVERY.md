# Recupero memoria della pulizia - 17 ottobre 2026

Il 16 ottobre il processo API/AIS ha ancora esaurito l'heap durante il seguito
della manutenzione, dopo campionamento e compattazione. Le prove precedenti
coprivano un solo backup; non certificavano la memoria con tutti i riferimenti
dei backup conservati insieme ai dati live.

Il primo contenimento introduce `ARCHIVE_CLEANUP_ENABLED=false`. La pausa
interrompe la sola pulizia prima delle letture/cancellazioni, segnala
`CLEANUP_PAUSED` e non registra un completamento fittizio. Il flag è visibile in
`/admin/metrics`; resta temporaneo, con crescita degli oggetti da monitorare.

La correzione in preparazione separa la pulizia in un processo breve con heap
limitato, senza acquisizione AIS o riscaldamento della cache live. Conserva i
riferimenti esatti in un indice SQLite temporaneo su disco, anziché in un Set
JavaScript che cresce insieme ai backup. Nessun confronto probabilistico e
nessuna modifica al database Supabase o al formato degli archivi.

Si usa `node:sqlite`, incluso nel runtime Node 24 già usato da Docker e CI:
non richiede un servizio o pacchetto di produzione aggiuntivo. Le API sono
sincrone e vengono eseguite soltanto nel processo di manutenzione. I tipi Node
di sviluppo vengono aggiornati per compilare questo modulo. L'indice è
ricostruibile: non sostituisce catalogo, backup o checkpoint persistenti.

Riferimento primario:
https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

Verifiche richieste prima della riattivazione: confronto integrale dei riferimenti
sui backup reali, processo con heap limitato, corruzione e spazio indice esaurito
senza cancellazioni, fallimento del processo secondario senza arresto delle API,
pulizia completa reale e successiva verifica della disponibilità.

## Prova reale locale

Scaricati e verificati tutti i dodici backup presenti, 169.572.759 byte complessivi.
Con heap 128 MiB il Set precedente esaurisce la memoria dopo le prime tre copie;
l'indice su disco completa tutte le copie in 191.824 ms. Sono protette esattamente
244.085 chiavi, identiche al confronto completo della vecchia implementazione
eseguito separatamente con heap 768 MiB. Fingerprint SHA-256 delle chiavi ordinate:
`a08c98f7d5c71fe89a2b09aa3a80a8b38ee3055f8858cf884ebee7ab200a282d`.
Indice temporaneo: 28.925.952 byte, cache SQLite limitata a 2 MiB; non è un nuovo
archivio persistente. La memoria RSS del processo include anche buffer e runtime:
il limite heap non è una garanzia equivalente sul totale RSS.

## Esecuzione e protezioni

Il processo secondario non apre il flusso AIS né ricostruisce la cache live.
Ha heap 128 MiB e un limite temporale; i suoi errori sono registrati come guasti
ritentabili della manutenzione. Il processo principale continua a servire le API.
L'indice mantiene i riferimenti esatti e viene eliminato dopo l'uscita del worker,
anche su arresto improvviso. Tutte le verifiche dei backup precedono le cancellazioni.

Con pulizia abilitata, l'ordine giornaliero è flush, backup verificato, pulizia,
campionamento tracce e compattazione metadati. Gli oggetti appena creati restano
protetti per 24 ore: anticipare la pulizia non espone quelli generati dalla
compattazione successiva e evita una lunga attesa prima della fase da verificare.
I checkpoint continuano a riconoscere i nomi delle fasi già riuscite. Con pulizia
sospesa resta l'ordine precedente, così le altre fasi possono precedere la pausa.

Il monitor registra un UUID dell'istanza del processo e confronta l'ultimo uptime
valido anche oltre richieste fallite; non interpreta più un intervallo senza
metriche come assenza di riavvii. La pausa della pulizia blocca esplicitamente la
qualificazione della manutenzione. Distribuzione e prova produttiva restano da
registrare dopo la verifica della versione finale.
