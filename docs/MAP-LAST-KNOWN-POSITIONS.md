# Punti nave visibili senza selezione — 14 ottobre 2026

La mappa deve mostrare l'ultima posizione osservata di una nave nella zona anche
senza cercarla, selezionarla o attivarne la traccia. I dieci minuti determinano
la freschezza della posizione, non la cancellazione del punto.

Il primo intervento della selezione (PR #16) manteneva solo il simbolo della nave
aperta. Il filtro di `/api/map/live` continuava a escludere le altre osservazioni
più vecchie. Questo intervento corregge anche la risposta generale della mappa.

L'API restituisce le ultime posizioni disponibili nell'area entro i 90 giorni
conservati dal backend. Non ricostruisce né inventa spostamenti. Ogni punto mantiene
il timestamp originale e `is_stale`; `recent_in_bbox` e `last_known_in_bbox`
distinguono i conteggi. `total_live` continua a contare le sole osservazioni recenti.
Il limite resta 5.000, con segnalazione esplicita e precedenza ai punti più nuovi.

Il frontend attenua i punti con osservazioni oltre dieci minuti e spiega il significato
nello stato dati, in italiano/inglese/francese/tedesco. Clic, filtri e raggruppamento
restano disponibili. La scheda mostra l'orario effettivo della posizione ricevuta,
sempre in UTC. Oltre 15 minuti l'orario e l'avviso «Dato non recente · oltre 15 minuti»
diventano arancioni; oltre un'ora diventano rossi con «Dato vecchio · oltre 1 ora».
La data non viene sostituita con l'ora attuale. L'indicazione si aggiorna ogni 30 secondi
e al ritorno nella scheda, anche senza nuove osservazioni. Una nuova rilevazione recente
riporta l'orario allo stato normale. Il componente è condiviso con la scheda completa,
ha colori leggibili nei temi scuri e chiari e un testo esplicito oltre al colore.
Il simbolo della selezione e il cursore della traccia continuano a evitare duplicati.

Prove locali: API con punto recente, punto vecchio, punto fuori area e punto scaduto;
risposta limitata con posizione recente inserita dopo 5.001 punti vecchi; otto prove
browser desktop/telefono, compreso il clic sul punto vecchio senza ricerca o scheda
preesistente, avanzamento dell'orologio senza nuovi dati e ritorno a un dato recente.
Verificati anche i confini esatti delle soglie 15/60 minuti. Compilazioni, lint e
prove dell'avviso riusciti. Pubblicazione e carico remoto da completare.

Distribuire prima il frontend compatibile, poi la modifica API sul backend già
compatibile con i metadati compressi. Conservare i monitor precedenti e iniziare
una nuova settimana dopo quest'ultima modifica backend. Nessuna modifica a
acquisizione, retention, archivi, migrazioni o permessi del database.
