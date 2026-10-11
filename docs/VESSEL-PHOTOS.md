# Foto delle navi e illustrazioni di categoria

Aggiornamento: 11 ottobre 2026. Implementazione frontend, senza nuove dipendenze, chiavi API o abbonamenti.

## Ricerca delle fotografie

L'endpoint `/api/vessel-photo?mmsi=...&imo=...` usa identificativi esatti; il solo nome non è sufficiente per attribuire una fotografia a una nave.

1. **Wikidata**: IMO P458 oppure MMSI P587, controllo delle dichiarazioni non deprecate e rifiuto delle identità duplicate. Immagine P18.
2. **Wikimedia Commons**: categoria associata tramite sitelink o P373, oppure categoria `IMO <numero>`. Fino a 12 file; se la categoria contiene soltanto sottocategorie, ricerca anche in massimo tre sottocategorie dirette, quattro file ciascuna.
3. **Structured Data on Commons**: file con dichiarazione P180 «depicts» riferita all'esatta entità Wikidata identificata.
4. **Wikipedia**: immagine principale della pagina inglese, o italiana quando manca il collegamento inglese; il `wikibase_item` deve coincidere. L'immagine deve comunque essere presente su Commons e superare i controlli di licenza e attribuzione. Non sono utilizzate immagini locali non libere di Wikipedia.

Autore, licenza e pagina originale rimangono visibili. Il filtro automatico accetta CC0, pubblico dominio, CC BY e CC BY-SA nelle versioni dichiarate supportate; rifiuta licenze sconosciute, NC, ND e restrizioni aggiuntive. Gli obblighi della singola licenza restano applicabili, anche in una futura versione commerciale. La copertura rimane parziale: queste fonti non contengono fotografie di tutte le imbarcazioni.

Timeout: 3 secondi per richiesta alla fonte, 8 secondi totali lato endpoint, 12 secondi lato browser; una fonte guasta non impedisce il tentativo delle alternative entro il tempo disponibile. Foto valide: cache browser 1 ora, CDN e fetch alle fonti 24 ore. Assenza di foto: browser 5 minuti, CDN 1 ora; errori HTTP 503 senza cache.

### Fonti e alternative commerciali esaminate

| Fonte | Risultato della ricerca e utilizzo |
| --- | --- |
| [Wikidata Ships](https://www.wikidata.org/wiki/Wikidata:WikiProject_Ships/Properties/en) | Identificazione precisa; già integrata e ampliata con P373/sitelink Wikipedia. |
| [Commons: dati strutturati](https://commons.wikimedia.org/wiki/Commons:Structured_data/Modeling/Depiction) e [licenze](https://commons.wikimedia.org/wiki/Commons:Licensing) | Ricerca P180 e categorie; tutte le immagini mostrate mantengono crediti e licenza. |
| [MediaWiki PageImages](https://www.mediawiki.org/wiki/Extension:PageImages#API) | Nuovo percorso di ricerca Wikipedia; riuso soltanto di file Commons verificati. |
| [VesselFinder API](https://api.vesselfinder.com/docs/) e [termini](https://www.vesselfinder.com/terms) | La documentazione pubblica dei dataset Master/AIS non include un endpoint fotografico. Le foto visibili sul sito non concedono automaticamente diritti di redistribuzione, neppure acquistando un piano dati. Richiedere un accordo esplicito per foto e riuso in un servizio a pagamento. Nessun prelievo automatico dal sito. |
| [ShipSpotting: termini](https://www.shipspotting.com/about/terms) | Fotografie dei contributori soggette a copyright; nessuna API libera con licenza commerciale generale confermata nella ricerca. Occorre verificare accordo/permessi prima di integrare la raccolta. |
| [MarineTraffic / Kpler Data Services](https://www.kpler.com/product/maritime/data-services) | La sezione «Ship database» offre fotografie via API: alternativa commerciale concreta. Prezzo, credenziali e diritti per mostrare le immagini ai propri clienti vanno concordati con il fornitore. Non attivata nella demo, nessun costo nuovo. |

## Illustrazioni locali

Le sette immagini fornite dall'utente sono in `frontend/public/vessel-types/`, rinominate in inglese e convertite in JPEG progressivo, qualità 80, larghezza massima 1.200 px, proporzioni conservate e metadati eliminati:

| Categoria AIS | File | Immagine fornita |
| --- | --- | --- |
| tanker | `tanker.jpg` | Nave cisterna |
| fishing | `fishing.jpg` | Peschereccio |
| cargo | `cargo.jpg` | Portacontainer |
| military | `military.jpg` | Nave militare |
| tug | `tug.jpg` | Rimorchiatore |
| passenger | `passenger.jpg` | Nave passeggeri |
| pleasure | `pleasure.jpg` | Yacht |

Totale originali PNG: **9.570.613 byte**. Totale JPEG: **320.777 byte**, riduzione **96,6%** del peso dei file; non è una misura della memoria del browser dopo la decodifica. Provenienza: allegati dell'utente, utilizzati su sua richiesta per questo progetto; nessuna licenza Commons attribuita a queste illustrazioni.

L'illustrazione è mostrata durante la ricerca e in caso di assenza, errore della fonte o errore di caricamento della fotografia. Una didascalia tradotta in quattro lingue specifica che non è la foto della nave selezionata. La foto reale, quando caricata, la sostituisce. Per il tipo AIS sconosciuto `other` rimane lo stato testuale: non viene assegnata un'illustrazione di categoria errata.

## Persistenza del tema

`ThemeProvider` nel layout radice condivide la scelta Dark/Light/ECDIS fra mappa, schede nave, località e pagine di errore. Cookie `ais-map-theme` valido un anno per il rendering server; localStorage `ais-map-theme-v1` conserva la preferenza già usata dalla mappa. Uno script prima del primo disegno migra le preferenze precedenti quando manca il cookie. La scelta aggiorna subito il documento e la mappa senza cambiare camera o sorgenti. Anche le altre schede del browser si sincronizzano attraverso l'evento storage. Dark resta il valore iniziale senza una scelta salvata.

Typecheck, lint e build frontend eseguiti localmente. Aggiornata l'aspettativa del test browser già esistente per mostrare il JPG cargo quando manca la foto; nessun nuovo test aggiunto e nessuna suite eseguita manualmente. La pipeline CI preesistente viene eseguita automaticamente dal repository. Stato di pubblicazione in [STATUS.md](STATUS.md).
