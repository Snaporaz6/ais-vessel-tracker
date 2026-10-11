# Avvisi marittimi globali

## Implementato

`GET /api/maritime-warnings?bbox=west,south,east,north&days=7|30|90|365&type=all|piracy|attack|incident|restriction|navigation` restituisce GeoJSON e metadati di copertura. Il bbox può attraversare l'antimeridiano (`west > east`). Il periodo filtra i messaggi non attuali; un avviso ancora in vigore rimane visibile anche se emesso anni prima.

- **NGA SMAPS:** liste attuali `NAVAREA IV`, `NAVAREA XII`, `HYDROLANT`, `HYDROPAC`, `HYDROARC`. I messaggi comprendono pericoli, incidenti, chiusure di porti, esercitazioni, mine e altri avvisi. Non sono una raccolta completa di tutti gli avvisi costieri del globo. La prima acquisizione del 10 ottobre 2026 comprende 423 messaggi originali.
- **US MARAD:** tabella ufficiale degli avvisi attivi, con inizio, fine, cancellazioni e link. Riferita principalmente alla navigazione commerciale statunitense. Avvisi regionali rappresentati da un punto indicativo nella regione: **il punto non indica un attacco e non delimita un'area ufficiale**.
- **UKMTO:** estratto fattuale datato verificato l'11 ottobre 2026, con 12 rapporti recenti (23 settembre–5 ottobre, più un rapporto tardivo relativo al 16 settembre) senza coordinate precise e il rapporto storico di dirottamento `045-26`. Solo quest'ultimo contiene una posizione numerica esplicita: `0856N 05032E`, la **ultima posizione riferita della nave dopo il dirottamento**, non il luogo iniziale dell'attacco. Compare nel filtro 365 giorni. I rapporti non localizzati restano in `metadata.unmappedReports`, filtrati per periodo/tipo e con link ufficiale; non ricevono punti indicativi o aree di rischio.
- Filtri geografici, tipo, periodo; cache applicativa/browser/CDN allineate a blocchi UTC di 30 minuti; richieste upstream limitate a host fissi, 8 secondi, 2 MB ciascuna. Nessun proxy arbitrario, credenziale o servizio a pagamento.

## Attendibilità e geometria

La normalizzazione di SMAPS conserva testo, categoria, data e stato originali. Non presenta una segnalazione come un evento confermato: `eventStatus` distingue `suspected`, `reported`, `confirmed`, `not_applicable` (attualmente non attribuiamo `confirmed` ai normali messaggi).

Le coordinate in gradi e minuti vengono estratte solo se valide e pubblicate esplicitamente, con supporto di trattini Unicode, apostrofi dei minuti e decimali con punto o virgola. L'ordine GeoJSON è sempre longitudine, latitudine. Un poligono viene ricostruito soltanto quando il testo contiene una singola sezione **AREA BOUND BY / AREA BOUNDED BY** con almeno tre vertici. Circonferenze e messaggi con più aree rimangono punti, senza riempimenti o buffer inventati. I messaggi con trackline non vengono mappati: un percorso raccomandato in presenza di mine non è la posizione delle mine. I messaggi privi di geometria supportata restano conteggiati in `unmappedCount` e non ricevono geocodifica approssimativa automatica. Le coordinate dei paragrafi che cancellano avvisi precedenti e delle sezioni di porti riaperti non vengono mappate.

`severity` rimane `unspecified`. Non calcoliamo una percentuale o un rating di rischio dalla semplice frequenza degli episodi. La copertura mondiale degli attacchi a imbarcazioni militari/civili e degli incidenti non è esaustiva.

## Aggiornamento e revoca

Solo una risposta attuale della fonte può produrre `active: true`. Gli avvisi ritirati spariscono alla successiva acquisizione della lista in vigore. Una data di cancellazione esplicitamente riferita a **THIS MSG** viene conservata in `validUntil`. Non applichiamo una scadenza per anzianità agli avvisi ancora `INFORCE`.

Lo stato viene confrontato con `INFORCE`/`ACTIVE` esatti (non con sottostringhe, come `INACTIVE`). L'anno di una cancellazione esplicitamente scritto dalla fonte non viene modificato: il passaggio all'anno successivo è inferito solo quando l'anno manca e la data attraversa dicembre/gennaio. Il fallback NGA conserva anche i messaggi assegnati a più aree NAVAREA, con deduplicazione finale per ID.

Se la fonte non risponde, usiamo uno snapshot datato con `sourceStatus: snapshot|stale`, `status: stale`, `active: false` e `lastKnownInForce: true` quando questa era la dichiarazione dell'autorità. **Stale significa stato attuale non verificato, non cancellato o cessato.** Le date di validità della fonte rimangono visibili. Lo snapshot non contribuisce all'indicatore sulle tracce.

Lo snapshot NGA si aggiorna con:

```sh
python3 scripts/import-maritime-warnings.py
```

Lo snapshot MARAD contiene soltanto titoli, date e link della tabella ufficiale verificata il 10 ottobre 2026. Se l'accesso automatico fallisce non viene reinterpretato come un feed in tempo reale. Il codice è già predisposto a leggere la tabella quando disponibile, riconoscere nuovi avvisi regionali ed eliminare quelli revocati. Il metadata comunica ogni problema di freschezza.

La fonte UKMTO non è un feed automatico: le normali richieste dirette restituiscono HTTP 403 in questo ambiente, e la pagina leggibile tramite ricerca ufficiale è un estratto indicizzato, con copertura datata al 5 ottobre. Non aggiriamo il blocco e non interpretiamo una pagina dinamica vuota come assenza di incidenti. La revisione manuale può aggiornare `frontend/public/warnings/ukmto-incidents-snapshot.json` esclusivamente dopo aver consultato il rapporto ufficiale, conservando ID, fonte, data, aggiornamenti/reclassificazioni e coordinate esplicite. Nessuna presunta cancellazione deriva dalla sola età del rapporto.

Per i rapporti UKMTO, `occurredAt` indica l'istante/data dell'evento solo se esplicitamente dichiarato; altrimenti è `null`. `reportedAt` conserva la data del rapporto (o pubblicazione della scheda quando non compare un istante di segnalazione). Le date senza orario restano `YYYY-MM-DD` e non inventano un'ora UTC. I rapporti storici non sono avvisi attualmente attivi, anche se acquisiti oggi.

`properties.updatedAt` conserva l'ultima acquisizione per il controllo di freschezza nell'indicatore. Nei metadati delle singole fonti, invece, `updatedAt` è l'ultima emissione documentata, `fetchedAt` l'acquisizione dei dati visualizzati e `checkedAt` l'ultimo tentativo di consultazione. Le fonti con acquisizioni differenti mantengono i propri timestamp; il riepilogo aggregato non sostituisce questi dettagli.

## Indicatore sulla traccia osservata

`assessObservedTrack(coordinates, collection)` restituisce solo `active_alerts` oppure `insufficient_data`, con gli ID degli avvisi. Confronta i segmenti forniti dal chiamante con **aree pubblicate, attualmente attive e ricontrollate dalla fonte negli ultimi 30 minuti**. Non crea aree attorno a eventi puntuali o marker regionali.

Il chiamante deve passare separatamente ogni segmento continuo della traccia AIS: non va collegato un intervallo privo di rilevazioni. L'intersezione descrive il percorso osservato rispetto agli avvisi attualmente noti; non è una previsione della rotta futura né una verifica della situazione presente al tempo di una traccia storica. Nessuna intersezione significa **dati insufficienti**, mai una certificazione di sicurezza.

## Fonti e diritti

- NGA SMAPS e query pubblica: <https://msi.nga.mil/NavWarnings>. Le condizioni di riproduzione: <https://msi.nga.mil/commercial-use>. NGA dichiara di non rivendicare copyright sui prodotti nautici pubblicati per uso pubblico; richiede la dichiarazione di mancata approvazione/endorsement nei prodotti derivati. Testo richiesto in `/warnings/disclaimer.txt`, esportato anche come `NGA_DISCLAIMER` e riportato nei metadati. Nessun sigillo/logo ufficiale usato.
- US MARAD: <https://www.maritime.dot.gov/msci-advisories>. Importati i soli fatti ufficiali (titolo, stato, date, link); non foto, loghi o testi di terzi. Il contenuto del sito non costituisce approvazione dell'app da parte del governo americano.
- **Correzione della ricerca precedente:** NGA ASAM è stato interrotto il **30 giugno 2024**. È un archivio storico e non va usato per il rischio corrente. La pubblicazione ufficiale 2026 lo esplicita: <https://msi.nga.mil/api/publications/download?key=16920954%2FSFH00000%2FUNTM%2FSpecial_Notice.pdf&type=view>, paragrafo 48. Nessun punto ASAM storico viene presentato come attacco recente.
- UKMTO: <https://www.ukmto.org/recent-incidents>, rapporto con posizione esplicita <https://www.ukmto.org/-/media/ukmto/products/20260424-ukmto_warning_045-26.pdf?rev=4f66cb1859744663a67c4c2b91a080f5>. Riuso dichiarato sotto **Open Government Licence** nelle condizioni <https://www.ukmto.org/terms-and-conditions>, paragrafi 20–23. Attribution esportata come `UKMTO_ATTRIBUTION` e nei metadati della fonte: “Contains public sector information licensed under the Open Government Licence. Source: UK Maritime Trade Operations (UKMTO), © Crown copyright.” Non sono importati foto, mappe, loghi, dati personali o testi integrali. L'app non è approvata da UKMTO.
- IMB e ReCAAP restano fonti consultabili tramite i rispettivi portali; non importati senza aver verificato riuso, accesso automatico e aggiornamento. Non viene attribuito al nostro sito il rating ufficiale JMIC.

## Limiti aperti

Mancano una raccolta completa di incidenti/attacchi mondiali, tutte le ordinanze locali e un feed strutturato completo delle chiusure di porti e canali. Occorreranno accordi o altre fonti con diritti chiari. La mappa è informativa e mantiene visibili copertura, data, precisione e fonte di ogni avviso.

## Contratto di traduzione

I metadati usano chiavi stabili: `warnings.coverage`, `warnings.partial`, `warnings.unavailable`, `warnings.ngaCoverage`, `warnings.ngaLive`, `warnings.ngaSnapshot`, `warnings.maradCoverage`, `warnings.maradLive`, `warnings.maradSnapshot`, `warnings.ukmtoCoverage`, `warnings.ukmtoSnapshot`. Titoli, fatti e dichiarazioni obbligatorie delle autorità restano nel testo originale, senza reinterpretazione della classificazione.

Aggiornamento 11 ottobre: il frontend carica gli avvisi senza un nuovo bbox a ogni zoom e riutilizza la risposta fino alla scadenza di 30 minuti. In caso di guasto, i precedenti avvisi conservati diventano non verificati e non alimentano un giudizio di avviso attivo. UKMTO mantiene lo snapshot dichiarato; questa cache non aggiunge un feed live UKMTO.
