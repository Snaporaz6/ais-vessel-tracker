# Traccia e riproduzione temporale

Aggiornamento: 11 ottobre 2026. Frontend soltanto; acquisizione e archivio AIS Mediterraneo invariati, senza dipendenze o servizi aggiuntivi.

## Controlli

- «Mostra traccia» nella scheda diventa «Nascondi traccia» quando quella nave è attiva. Disattivazione anche con la croce del controllo Storico; cancella traccia, marcatori e cursore, interrompe richieste/timer dedicati e rimuove `track` dall'URL. Per nasconderla non occorre selezionare un'altra nave.
- Periodi 1/7/30/90 giorni. Il cambio periodo o nave riporta il cursore all'ultima osservazione del nuovo insieme; il periodo visualizzato copre i dati effettivamente disponibili, non date prive di storico.
- Cursore proporzionale al tempo fra prima e ultima osservazione, con data e ora UTC; tasti osservazione precedente/successiva, Riproduci/Pausa e Ultima posizione. Nessuna riproduzione automatica all'apertura.
- Riproduzione accelerata: circa 30 secondi per la finestra disponibile, aggiornamento ogni 125 ms. Può saltare fix intermedi nello scorrimento accelerato; i tasti precedente/successivo consentono di ispezionare le singole osservazioni.
- «Centra» porta la mappa alla posizione mostrata mantenendo lo zoom. Lo scorrimento temporale, da solo, non sposta la camera.
- Sul desktop copertura e cursore si aprono subito sotto i pulsanti «Mostra/Nascondi traccia» e «Scheda completa», nella scheda della nave; chiudendola il cursore rimane disponibile come pannello sulla mappa. Spostando il controllo viene fermata la riproduzione, conservando il tempo selezionato. Quattro lingue e temi Dark/Light/ECDIS.
- Su mobile la timeline sostituisce la scheda nave in un solo pannello in basso, riducibile e riapribile da «Traccia». Copertura e limiti sono espandibili; «Nascondi traccia» la disattiva. [Interfaccia mobile e prove](MOBILE-MAP.md).

## Ritorno alla mappa

Il collegamento «Mappa del Mediterraneo» della pagina completa contiene l'MMSI della nave: riapre la sua scheda e centra la mappa sull'ultima posizione disponibile. Anche la selezione sulla mappa viene conservata nel parametro `vessel` dell'URL, per ritrovarla usando Indietro del browser. Il ripristino gestisce anche la cache di navigazione del browser. Chiudere la scheda rimuove `vessel`, senza nascondere una traccia ancora attiva. Il normale clic su una nave mantiene centro e zoom; soltanto ricerca, collegamenti diretti e ritorno alla mappa la localizzano.

## Posizioni e vuoti

La freccia grande identifica la nave seguita: ciano per l'ultima posizione AIS, viola per lo storico, sempre con etichetta e data. Durante lo storico un quadrato piccolo etichettato conserva il riferimento all'ultima posizione ricevuta. Non è una posizione GPS garantita in questo momento: resta un'osservazione AIS con un timestamp.

Il normale punto live della stessa nave viene escluso dalla sorgente aggregata quando è disponibile la traccia, evitando un secondo pallino o la sua inclusione nei cluster. I limiti delle interruzioni sono piccole croci arancioni; l'inizio è una croce verde e i fix isolati restano punti blu molto piccoli. L'ultimo punto del vecchio layer non viene ridisegnato come un pallino arancione.

La selezione temporale usa una ricerca binaria sull'insieme ordinato: mostra il fix realmente ricevuto più recente che precede l'ora selezionata, con il suo timestamp esplicito. Non interpola coordinate. Dentro un'interruzione AIS il cursore della nave scompare, compare il messaggio «Nessuna posizione ricevuta in questo intervallo» e rimane il riferimento all'ultima posizione AIS. Non attraversa il vuoto con una posizione inventata. I collegamenti tratteggiati restano soltanto un'opzione illustrativa.

## Aggiornamenti e limiti

Cursore e animazione usano in memoria gli stessi punti già scaricati. Nessuna chiamata API a ogni movimento del cursore; lo storico conserva l'aggiornamento ordinario ogni 60 secondi e i dati live ogni 10 secondi. Se arrivano punti nuovi, il cursore storico conserva l'ora scelta, mentre «Ultima posizione» segue l'ultimo fix disponibile. Riproduzione sospesa quando la scheda browser viene nascosta; nessun intervallo animato resta attivo dopo la disattivazione della traccia.

La disponibilità dipende dallo storico raccolto e dal campionamento fino a 5.000 punti; un vuoto AIS resta un vuoto. In caso di limite del campionamento che impedisce di aggiungere un nuovo punto live, il marcatore corrente usa comunque il fix live più recente, senza presentare la vecchia posizione come quella più aggiornata. Il messaggio originale del limite rimane visibile.

Typecheck, lint e build frontend riusciti localmente; nessun nuovo test aggiunto o suite eseguita manualmente. La pipeline CI preesistente controlla automaticamente il PR. Rilascio documentato in [STATUS.md](STATUS.md).
