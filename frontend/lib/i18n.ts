export const LOCALES = ["en", "it", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const LANGUAGE_COOKIE = "ais-language";
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
  fr: "Français",
  de: "Deutsch",
};
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  it: "it-IT",
  fr: "fr-FR",
  de: "de-DE",
};

// Italian source text and reviewed English, French and German translations.
export const messages = {
  Fondali: ["Seabed", "Fonds marins", "Meeresboden"],
  "Profondità in metri": [
    "Depth in metres",
    "Profondeur en mètres",
    "Tiefe in Metern",
  ],
  "Fonte e dettaglio": [
    "Source and detail",
    "Source et détail",
    "Quelle und Details",
  ],
  "Curve generalizzate: 50, 100, 200, 500, 1.000, 2.000, 5.000 e 7.000 m. Il dettaglio aumenta con lo zoom.":
    [
      "Generalised contours: 50, 100, 200, 500, 1,000, 2,000, 5,000 and 7,000 m. Detail increases as you zoom in.",
      "Courbes généralisées : 50, 100, 200, 500, 1 000, 2 000, 5 000 et 7 000 m. Le détail augmente avec le zoom.",
      "Generalisierte Tiefenlinien: 50, 100, 200, 500, 1.000, 2.000, 5.000 und 7.000 m. Mehr Details beim Vergrößern.",
    ],
  "Copertura dei mari europei. Non utilizzabile per la navigazione.": [
    "European seas coverage. Not for navigation.",
    "Couverture des mers européennes. Ne pas utiliser pour la navigation.",
    "Abdeckung europäischer Meere. Nicht zur Navigation geeignet.",
  ],
  "Ingrandisci per vedere i fondali.": [
    "Zoom in to see the seabed.",
    "Zoomez pour voir les fonds marins.",
    "Vergrößern, um den Meeresboden zu sehen.",
  ],
  "Fondali temporaneamente incompleti. Disattiva e riattiva per riprovare.": [
    "Seabed layer temporarily incomplete. Switch off and on to retry.",
    "Fonds marins temporairement incomplets. Désactivez puis réactivez pour réessayer.",
    "Meeresboden vorübergehend unvollständig. Zum Wiederholen aus- und einschalten.",
  ],

  "Copertura della traccia": [
    "Track coverage",
    "Couverture de la trace",
    "Abdeckung der Spur",
  ],
  "Caricamento traccia…": [
    "Loading track…",
    "Chargement de la trace…",
    "Spur wird geladen…",
  ],
  "Posizioni AIS ricevute": [
    "Received AIS positions",
    "Positions AIS reçues",
    "Empfangene AIS-Positionen",
  ],
  "Intervalli senza osservazioni": [
    "Intervals without observations",
    "Périodes sans observations",
    "Zeiträume ohne Beobachtungen",
  ],
  "La linea si interrompe dove mancano osservazioni AIS. I punti arancioni segnano i limiti dei vuoti.":
    [
      "The line breaks where AIS observations are missing. Orange dots mark gap boundaries.",
      "La ligne s’interrompt lorsque des observations AIS manquent. Les points orange marquent les limites des interruptions.",
      "Die Linie ist unterbrochen, wo AIS-Beobachtungen fehlen. Orange Punkte markieren die Grenzen der Lücken.",
    ],
  "Mostra collegamenti indicativi": [
    "Show indicative links",
    "Afficher les liaisons indicatives",
    "Ungefähre Verbindungen anzeigen",
  ],
  "I tratti tratteggiati collegano in linea retta le posizioni note: non ricostruiscono il percorso reale.":
    [
      "Dashed lines connect known positions in a straight line; they do not reconstruct the actual route.",
      "Les lignes pointillées relient les positions connues en ligne droite : elles ne reconstituent pas le trajet réel.",
      "Gestrichelte Linien verbinden bekannte Positionen geradlinig; sie rekonstruieren nicht die tatsächliche Route.",
    ],
  "Dettaglio delle interruzioni": [
    "Gap details",
    "Détail des interruptions",
    "Details der Lücken",
  ],
  "{hours} h {minutes} min": [
    "{hours} h {minutes} min",
    "{hours} h {minutes} min",
    "{hours} Std. {minutes} Min.",
  ],
  "Nessuna interruzione segnalata nelle osservazioni disponibili.": [
    "No gaps flagged in the available observations.",
    "Aucune interruption signalée dans les observations disponibles.",
    "Keine Lücken in den verfügbaren Beobachtungen gemeldet.",
  ],
  Lingua: ["Language", "Langue", "Sprache"],
  "Rileva automaticamente": [
    "Detect automatically",
    "Détecter automatiquement",
    "Automatisch erkennen",
  ],
  "Mediterraneo · beta": [
    "Mediterranean · beta",
    "Méditerranée · bêta",
    "Mittelmeer · Beta",
  ],
  "Caricamento mappa…": [
    "Loading map…",
    "Chargement de la carte…",
    "Karte wird geladen…",
  ],
  "Cerca una nave": [
    "Search for a vessel",
    "Rechercher un navire",
    "Schiff suchen",
  ],
  "Nome, MMSI o IMO": [
    "Name, MMSI or IMO",
    "Nom, MMSI ou IMO",
    "Name, MMSI oder IMO",
  ],
  "Ricerca in corso…": ["Searching…", "Recherche en cours…", "Suche läuft…"],
  "Nessuna nave trovata.": [
    "No vessels found.",
    "Aucun navire trouvé.",
    "Keine Schiffe gefunden.",
  ],
  "Ricerca temporaneamente non disponibile.": [
    "Search is temporarily unavailable.",
    "La recherche est temporairement indisponible.",
    "Die Suche ist vorübergehend nicht verfügbar.",
  ],
  "Filtra tipologie navi": [
    "Filter vessel types",
    "Filtrer les types de navires",
    "Schiffstypen filtern",
  ],
  "Filtra navi": ["Filter vessels", "Filtrer les navires", "Schiffe filtern"],
  "Chiudi filtri": ["Close filters", "Fermer les filtres", "Filter schließen"],
  Tutti: ["All", "Tous", "Alle"],
  Nessuno: ["None", "Aucun", "Keine"],
  Cargo: ["Cargo", "Navire de charge", "Frachtschiff"],
  Petroliera: ["Tanker", "Pétrolier", "Tanker"],
  Petroliere: ["Tankers", "Pétroliers", "Tanker"],
  Passeggeri: ["Passenger", "Passagers", "Passagierschiff"],
  Pesca: ["Fishing", "Pêche", "Fischereischiff"],
  Rimorchiatore: ["Tug", "Remorqueur", "Schlepper"],
  Rimorchiatori: ["Tugs", "Remorqueurs", "Schlepper"],
  Diporto: ["Pleasure craft", "Plaisance", "Sportboot"],
  Militare: ["Military", "Militaire", "Militärschiff"],
  Militari: ["Military", "Militaires", "Militärschiffe"],
  Altro: ["Other", "Autre", "Sonstige"],
  "Tipo non disponibile": [
    "Type unavailable",
    "Type indisponible",
    "Typ nicht verfügbar",
  ],
  "Cambia proiezione mappa": [
    "Change map projection",
    "Changer la projection de la carte",
    "Kartenprojektion ändern",
  ],
  Storico: ["History", "Historique", "Verlauf"],
  "{count} giorno": ["{count} day", "{count} jour", "{count} Tag"],
  "{count} giorni": ["{count} days", "{count} jours", "{count} Tage"],
  "Nascondi traccia": ["Hide track", "Masquer la trace", "Spur ausblenden"],
  "Mappa delle navi": ["Vessel map", "Carte des navires", "Schiffskarte"],
  Ingrandisci: ["Zoom in", "Zoom avant", "Vergrößern"],
  Riduci: ["Zoom out", "Zoom arrière", "Verkleinern"],
  "Ripristina orientamento": [
    "Reset orientation",
    "Réinitialiser l’orientation",
    "Ausrichtung zurücksetzen",
  ],
  "Mostra attribuzioni": [
    "Toggle attribution",
    "Afficher les attributions",
    "Quellenangaben anzeigen",
  ],
  "Chiudi popup": ["Close popup", "Fermer la fenêtre", "Popup schließen"],
  "La cartografia non è disponibile o è incompleta.": [
    "The basemap is unavailable or incomplete.",
    "Le fond de carte est indisponible ou incomplet.",
    "Die Basiskarte ist nicht verfügbar oder unvollständig.",
  ],
  "Posizioni non disponibili.": [
    "Positions unavailable.",
    "Positions indisponibles.",
    "Positionen nicht verfügbar.",
  ],
  "Velocità non disponibile": [
    "Speed unavailable",
    "Vitesse indisponible",
    "Geschwindigkeit nicht verfügbar",
  ],
  "Corrispondenza sanzioni": [
    "Sanctions match",
    "Correspondance avec une liste de sanctions",
    "Treffer auf einer Sanktionsliste",
  ],
  "Nessuna corrispondenza nelle liste consultate": [
    "No match in the lists checked",
    "Aucune correspondance dans les listes consultées",
    "Kein Treffer in den geprüften Listen",
  ],
  "Controllo sanzioni non disponibile": [
    "Sanctions check unavailable",
    "Vérification des sanctions indisponible",
    "Sanktionsprüfung nicht verfügbar",
  ],
  "DEMO · dati interamente fittizi": [
    "DEMO · entirely fictional data",
    "DÉMO · données entièrement fictives",
    "DEMO · vollständig fiktive Daten",
  ],
  "AIS · osservazioni live": [
    "AIS · live observations",
    "AIS · observations en direct",
    "AIS · Live-Beobachtungen",
  ],
  "AIS · acquisizione non aggiornata": [
    "AIS · feed not up to date",
    "AIS · flux non à jour",
    "AIS · Datenstrom nicht aktuell",
  ],
  "{area} navi nell’area · {live} osservate negli ultimi 10 minuti": [
    "{area} vessels in the area · {live} observed in the last 10 minutes",
    "{area} navires dans la zone · {live} observés dans les 10 dernières minutes",
    "{area} Schiffe im Gebiet · {live} in den letzten 10 Minuten beobachtet",
  ],
  "Caricamento osservazioni…": [
    "Loading observations…",
    "Chargement des observations…",
    "Beobachtungen werden geladen…",
  ],
  "Ultima ricezione: {date}": [
    "Last received: {date}",
    "Dernière réception : {date}",
    "Letzter Empfang: {date}",
  ],
  "Storico disponibile dal {date}": [
    "History available since {date}",
    "Historique disponible depuis le {date}",
    "Verlauf verfügbar seit {date}",
  ],
  "Copertura limitata alle osservazioni ricevute nel Mediterraneo.": [
    "Coverage is limited to observations received in the Mediterranean.",
    "La couverture se limite aux observations reçues en Méditerranée.",
    "Die Abdeckung ist auf empfangene Beobachtungen im Mittelmeer beschränkt.",
  ],
  "Visualizzate 5.000 navi: restringi l’area della mappa.": [
    "Showing 5,000 vessels: narrow the map area.",
    "5 000 navires affichés : réduisez la zone de la carte.",
    "5.000 Schiffe angezeigt: Kartenausschnitt verkleinern.",
  ],
  "La traccia contiene troppe interruzioni per aggiungere l’ultima posizione. Scegli una finestra più breve.":
    [
      "The track has too many gaps to add the latest position. Choose a shorter time range.",
      "La trace comporte trop d’interruptions pour ajouter la dernière position. Choisissez une période plus courte.",
      "Die Spur hat zu viele Lücken, um die letzte Position hinzuzufügen. Wählen Sie einen kürzeren Zeitraum.",
    ],
  "{count} punti": ["{count} points", "{count} points", "{count} Punkte"],
  "traccia semplificata": [
    "simplified track",
    "trace simplifiée",
    "vereinfachte Spur",
  ],
  "{count} interruzioni": [
    "{count} gaps",
    "{count} interruptions",
    "{count} Lücken",
  ],
  "Nessuna osservazione nella finestra scelta.": [
    "No observations in the selected time range.",
    "Aucune observation sur la période sélectionnée.",
    "Keine Beobachtungen im gewählten Zeitraum.",
  ],
  "Scheda nave": ["Vessel details", "Fiche du navire", "Schiffsdetails"],
  "Chiudi scheda": ["Close details", "Fermer la fiche", "Details schließen"],
  "Caricamento scheda…": [
    "Loading vessel details…",
    "Chargement de la fiche…",
    "Schiffsdetails werden geladen…",
  ],
  "Scheda temporaneamente non disponibile.": [
    "Vessel details are temporarily unavailable.",
    "La fiche du navire est temporairement indisponible.",
    "Die Schiffsdetails sind vorübergehend nicht verfügbar.",
  ],
  "Bandiera non disponibile": [
    "Flag unavailable",
    "Pavillon indisponible",
    "Flagge nicht verfügbar",
  ],
  "Non disponibile": ["Unavailable", "Indisponible", "Nicht verfügbar"],
  "non disponibile": ["unavailable", "indisponible", "nicht verfügbar"],
  "Il servizio anomalie non è disponibile. I dati della nave sono parziali.": [
    "The anomaly service is unavailable. Vessel data is incomplete.",
    "Le service d’anomalies est indisponible. Les données du navire sont incomplètes.",
    "Der Anomaliedienst ist nicht verfügbar. Die Schiffsdaten sind unvollständig.",
  ],
  "Ultima osservazione": [
    "Latest observation",
    "Dernière observation",
    "Letzte Beobachtung",
  ],
  Coordinate: ["Coordinates", "Coordonnées", "Koordinaten"],
  Velocità: ["Speed", "Vitesse", "Geschwindigkeit"],
  Rotta: ["Course", "Cap", "Kurs"],
  Dimensioni: ["Dimensions", "Dimensions", "Abmessungen"],
  "Posizione non disponibile.": [
    "Position unavailable.",
    "Position indisponible.",
    "Position nicht verfügbar.",
  ],
  "Informazioni trasmesse dalla nave": [
    "Information reported by the vessel",
    "Informations transmises par le navire",
    "Vom Schiff gemeldete Informationen",
  ],
  "Destinazione dichiarata": [
    "Reported destination",
    "Destination déclarée",
    "Gemeldetes Ziel",
  ],
  "ETA dichiarata": ["Reported ETA", "ETA déclarée", "Gemeldete Ankunftszeit"],
  "Destinazione ed ETA sono messaggi AIS: possono essere incompleti o non aggiornati.":
    [
      "Destination and ETA are AIS messages and may be incomplete or out of date.",
      "La destination et l’ETA sont des messages AIS : ils peuvent être incomplets ou non à jour.",
      "Ziel und Ankunftszeit sind AIS-Meldungen und können unvollständig oder veraltet sein.",
    ],
  "Mostra traccia": ["Show track", "Afficher la trace", "Spur anzeigen"],
  "Mostra sulla mappa": [
    "Show on map",
    "Afficher sur la carte",
    "Auf Karte anzeigen",
  ],
  "Scheda completa": ["Full details", "Fiche complète", "Vollständige Details"],
  "Controllo sanzioni": [
    "Sanctions check",
    "Vérification des sanctions",
    "Sanktionsprüfung",
  ],
  "CORRISPONDENZA SANZIONI": [
    "SANCTIONS MATCH",
    "CORRESPONDANCE SANCTIONS",
    "SANKTIONSTREFFER",
  ],
  UE: ["EU", "UE", "EU"],
  "Corrispondenza con una lista acquisita.": [
    "Match in an imported list.",
    "Correspondance dans une liste importée.",
    "Treffer in einer importierten Liste.",
  ],
  "Nessuna corrispondenza nelle liste consultate.": [
    "No match in the lists checked.",
    "Aucune correspondance dans les listes consultées.",
    "Kein Treffer in den geprüften Listen.",
  ],
  "Controllo non aggiornato: nessuna conclusione disponibile.": [
    "Check is out of date: no conclusion available.",
    "Vérification non à jour : aucune conclusion disponible.",
    "Prüfung veraltet: keine Schlussfolgerung möglich.",
  ],
  "Controllo non disponibile: nessuna conclusione disponibile.": [
    "Check unavailable: no conclusion available.",
    "Vérification indisponible : aucune conclusion disponible.",
    "Prüfung nicht verfügbar: keine Schlussfolgerung möglich.",
  ],
  "Ultimo controllo: {date}": [
    "Last checked: {date}",
    "Dernière vérification : {date}",
    "Letzte Prüfung: {date}",
  ],
  "UE · Annex XLII del Regolamento 833/2014": [
    "EU · Annex XLII of Regulation 833/2014",
    "UE · annexe XLII du règlement 833/2014",
    "EU · Anhang XLII der Verordnung 833/2014",
  ],
  "OFAC · SDN navi": [
    "OFAC · SDN vessels",
    "OFAC · navires SDN",
    "OFAC · SDN-Schiffe",
  ],
  aggiornata: ["up to date", "à jour", "aktuell"],
  "non aggiornata": ["out of date", "non à jour", "veraltet"],
  "Sono consultate le fonti indicate, non tutti i regimi sanzionatori.": [
    "Only the indicated sources are checked, not every sanctions regime.",
    "Seules les sources indiquées sont consultées, pas tous les régimes de sanctions.",
    "Es werden die angegebenen Quellen geprüft, nicht alle Sanktionsregelungen.",
  ],
  "Soste rilevate · ultimi 90 giorni": [
    "Detected stops · last 90 days",
    "Arrêts détectés · 90 derniers jours",
    "Erkannte Aufenthalte · letzte 90 Tage",
  ],
  "Località ricostruite dalle osservazioni; non sono porti identificati.": [
    "Locations inferred from observations; these are not identified ports.",
    "Lieux reconstitués à partir des observations ; il ne s’agit pas de ports identifiés.",
    "Aus Beobachtungen abgeleitete Orte; keine identifizierten Häfen.",
  ],
  "Soste temporaneamente non disponibili.": [
    "Stops are temporarily unavailable.",
    "Les arrêts sont temporairement indisponibles.",
    "Aufenthalte sind vorübergehend nicht verfügbar.",
  ],
  "{count} ore": ["{count} hours", "{count} heures", "{count} Stunden"],
  "Fine osservata; partenza incerta.": [
    "Observed end; departure uncertain.",
    "Fin observée ; départ incertain.",
    "Ende beobachtet; Abfahrt ungewiss.",
  ],
  "Fine: {date}": ["End: {date}", "Fin : {date}", "Ende: {date}"],
  "Sosta in corso nelle ultime osservazioni.": [
    "Stop ongoing in the latest observations.",
    "Arrêt en cours dans les dernières observations.",
    "Aufenthalt in den letzten Beobachtungen noch andauernd.",
  ],
  "Nessuna sosta rilevata nella finestra disponibile.": [
    "No stops detected in the available time range.",
    "Aucun arrêt détecté sur la période disponible.",
    "Keine Aufenthalte im verfügbaren Zeitraum erkannt.",
  ],
  "Segnalazioni da verificare": [
    "Alerts requiring review",
    "Signalements à vérifier",
    "Zu prüfende Hinweise",
  ],
  "Le anomalie segnalano osservazioni insolite e non provano attività illecite.":
    [
      "Anomalies flag unusual observations and do not prove unlawful activity.",
      "Les anomalies signalent des observations inhabituelles et ne prouvent pas une activité illicite.",
      "Anomalien weisen auf ungewöhnliche Beobachtungen hin und beweisen keine rechtswidrigen Aktivitäten.",
    ],
  "Controllo temporaneamente non disponibile.": [
    "Check temporarily unavailable.",
    "Vérification temporairement indisponible.",
    "Prüfung vorübergehend nicht verfügbar.",
  ],
  "Nessuna segnalazione registrata.": [
    "No alerts recorded.",
    "Aucun signalement enregistré.",
    "Keine Hinweise erfasst.",
  ],
  "Vuoto di osservazioni della nave": [
    "Gap in vessel observations",
    "Absence d’observations du navire",
    "Lücke in den Schiffsbeobachtungen",
  ],
  "Velocità insolita": [
    "Unusual speed",
    "Vitesse inhabituelle",
    "Ungewöhnliche Geschwindigkeit",
  ],
  "Spostamento incompatibile": [
    "Incompatible movement",
    "Déplacement incompatible",
    "Unvereinbare Bewegung",
  ],
  "Possibile alterazione AIS": [
    "Possible AIS tampering",
    "Possible altération AIS",
    "Mögliche AIS-Manipulation",
  ],
  "Fotografia di {name}": [
    "Photograph of {name}",
    "Photographie de {name}",
    "Foto von {name}",
  ],
  "Caricamento foto…": [
    "Loading photo…",
    "Chargement de la photo…",
    "Foto wird geladen…",
  ],
  "Nessuna foto disponibile nelle fonti libere.": [
    "No photo available from freely licensed sources.",
    "Aucune photo disponible dans les sources sous licence libre.",
    "Kein Foto aus frei lizenzierten Quellen verfügbar.",
  ],
  "Foto temporaneamente non disponibile.": [
    "Photo temporarily unavailable.",
    "Photo temporairement indisponible.",
    "Foto vorübergehend nicht verfügbar.",
  ],
  "Riprova foto": ["Retry photo", "Réessayer la photo", "Foto erneut laden"],
  "Foto: {author}": ["Photo: {author}", "Photo : {author}", "Foto: {author}"],
  "← Mappa": ["← Map", "← Carte", "← Karte"],
  "← Mappa del Mediterraneo": [
    "← Mediterranean map",
    "← Carte de la Méditerranée",
    "← Mittelmeerkarte",
  ],
  "MMSI non valido.": ["Invalid MMSI.", "MMSI invalide.", "Ungültige MMSI."],
  "Località osservata": [
    "Observed location",
    "Lieu observé",
    "Beobachteter Ort",
  ],
  "Soste rilevate": [
    "Detected stops",
    "Arrêts détectés",
    "Erkannte Aufenthalte",
  ],
  "Le coordinate non identificano un porto.": [
    "The coordinates do not identify a port.",
    "Les coordonnées n’identifient pas un port.",
    "Die Koordinaten identifizieren keinen Hafen.",
  ],
  "Riepilogo delle {count} soste disponibili, entro 500 metri e negli ultimi 90 giorni.":
    [
      "Summary of {count} available stops within 500 metres over the last 90 days.",
      "Résumé des {count} arrêts disponibles dans un rayon de 500 mètres au cours des 90 derniers jours.",
      "Zusammenfassung von {count} verfügbaren Aufenthalten innerhalb von 500 Metern in den letzten 90 Tagen.",
    ],
  "ultime 50": ["the latest 50", "50 derniers", "den letzten 50"],
  "Sono presenti altre soste: i conteggi e la media si riferiscono alle ultime 50.":
    [
      "More stops exist: counts and averages refer to the latest 50.",
      "D’autres arrêts existent : les nombres et la moyenne portent sur les 50 derniers.",
      "Es gibt weitere Aufenthalte: Anzahlen und Durchschnitt beziehen sich auf die letzten 50.",
    ],
  "Navi osservate": [
    "Vessels observed",
    "Navires observés",
    "Beobachtete Schiffe",
  ],
  "Soste registrate": [
    "Recorded stops",
    "Arrêts enregistrés",
    "Erfasste Aufenthalte",
  ],
  "Soste in corso": [
    "Ongoing stops",
    "Arrêts en cours",
    "Laufende Aufenthalte",
  ],
  "Durata media osservata": [
    "Average observed duration",
    "Durée moyenne observée",
    "Durchschnittliche beobachtete Dauer",
  ],
  "Ultime soste · fino a 90 giorni": [
    "Recent stops · up to 90 days",
    "Derniers arrêts · jusqu’à 90 jours",
    "Letzte Aufenthalte · bis zu 90 Tage",
  ],
  "In corso nelle ultime osservazioni": [
    "Ongoing in the latest observations",
    "En cours dans les dernières observations",
    "In den letzten Beobachtungen noch andauernd",
  ],
  "Nessuna sosta rilevata.": [
    "No stops detected.",
    "Aucun arrêt détecté.",
    "Keine Aufenthalte erkannt.",
  ],
  "Il servizio soste non è disponibile. Riprovare più tardi.": [
    "The stops service is unavailable. Please try again later.",
    "Le service des arrêts est indisponible. Veuillez réessayer plus tard.",
    "Der Aufenthaltsdienst ist nicht verfügbar. Bitte später erneut versuchen.",
  ],
  "Servizio temporaneamente non disponibile. Riprovare più tardi.": [
    "Service temporarily unavailable. Please try again later.",
    "Service temporairement indisponible. Veuillez réessayer plus tard.",
    "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.",
  ],
  "Servizio non disponibile ({status})": [
    "Service unavailable ({status})",
    "Service indisponible ({status})",
    "Dienst nicht verfügbar ({status})",
  ],
  "Nave non trovata": [
    "Vessel not found",
    "Navire introuvable",
    "Schiff nicht gefunden",
  ],
  "Osservazioni AIS nel Mediterraneo, storico e soste rilevate. Beta pubblica.":
    [
      "Mediterranean AIS observations, history and detected stops. Public beta.",
      "Observations AIS en Méditerranée, historique et arrêts détectés. Bêta publique.",
      "AIS-Beobachtungen im Mittelmeer, Verlauf und erkannte Aufenthalte. Öffentliche Beta.",
    ],
  "Troppe richieste. Riprovare tra un minuto.": [
    "Too many requests. Please try again in a minute.",
    "Trop de requêtes. Veuillez réessayer dans une minute.",
    "Zu viele Anfragen. Bitte in einer Minute erneut versuchen.",
  ],
  "Troppe interruzioni: restringere la finestra dello storico.": [
    "Too many gaps: narrow the history time range.",
    "Trop d’interruptions : réduisez la période de l’historique.",
    "Zu viele Lücken: Zeitraum des Verlaufs verkürzen.",
  ],
  "Storico troppo esteso da elaborare: scegliere un periodo più breve.": [
    "History is too large to process: choose a shorter period.",
    "Historique trop volumineux à traiter : choisissez une période plus courte.",
    "Der Verlauf ist zu umfangreich: kürzeren Zeitraum wählen.",
  ],
  "Servizio temporaneamente non disponibile. Riprovare.": [
    "Service temporarily unavailable. Please try again.",
    "Service temporairement indisponible. Veuillez réessayer.",
    "Dienst vorübergehend nicht verfügbar. Bitte erneut versuchen.",
  ],
  "MMSI non valido": ["Invalid MMSI", "MMSI invalide", "Ungültige MMSI"],
  "Ricerca: da 2 a 100 caratteri": [
    "Search: 2 to 100 characters",
    "Recherche : de 2 à 100 caractères",
    "Suche: 2 bis 100 Zeichen",
  ],
  "Località non valida": [
    "Invalid location",
    "Lieu invalide",
    "Ungültiger Ort",
  ],
  "Pagina non trovata": [
    "Page not found",
    "Page introuvable",
    "Seite nicht gefunden",
  ],
  "L’indirizzo richiesto non esiste.": [
    "The requested address does not exist.",
    "L’adresse demandée n’existe pas.",
    "Die angeforderte Adresse existiert nicht.",
  ],
} as const;

export type MessageKey = keyof typeof messages;
export type Params = Record<string, string | number>;
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}
export function translate(
  locale: Locale,
  key: string,
  params: Params = {},
): string {
  const entry = Object.prototype.hasOwnProperty.call(messages, key)
    ? messages[key as MessageKey]
    : undefined;
  const text =
    locale === "it" || !entry ? key : entry[{ en: 0, fr: 1, de: 2 }[locale]];
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    String(params[name] ?? match),
  );
}

function browserLocale(acceptLanguage: string | null): Locale | null {
  const choices = (acceptLanguage ?? "")
    .split(",")
    .map((part, order) => {
      const [language, ...options] = part.trim().split(";");
      const quality = options.find((option) => option.trim().startsWith("q="));
      return {
        locale: language.toLowerCase().split("-")[0],
        q: quality ? Number(quality.trim().slice(2)) : 1,
        order,
      };
    })
    .filter(
      (choice) =>
        isLocale(choice.locale) &&
        Number.isFinite(choice.q) &&
        choice.q > 0 &&
        choice.q <= 1,
    )
    .sort((a, b) => b.q - a.q || a.order - b.order);
  return (choices[0]?.locale as Locale | undefined) ?? null;
}

/** Country is supplied by Vercel from the visitor's IP. No raw IP is stored. */
export function automaticLocale(
  country: string | null,
  acceptLanguage: string | null,
): Locale {
  const code = country?.trim().toUpperCase();
  if (code && ["IT", "SM", "VA"].includes(code)) return "it";
  if (code && ["FR", "MC"].includes(code)) return "fr";
  if (code && ["DE", "AT", "LI"].includes(code)) return "de";
  // Country alone cannot determine a language in multilingual countries.
  if (code && ["CH", "BE", "LU", "CA"].includes(code))
    return browserLocale(acceptLanguage) ?? (code === "CH" ? "de" : "en");
  if (code && /^[A-Z]{2}$/.test(code) && code !== "XX") return "en";
  return browserLocale(acceptLanguage) ?? "en";
}

export function localizedError(locale: Locale, message: string): string {
  if (Object.prototype.hasOwnProperty.call(messages, message))
    return translate(locale, message);
  if (/^Nave '[1-9]\d{8}' not found$/.test(message))
    return translate(locale, "Nave non trovata");
  const service = /^Servizio non disponibile \((\d{3})\)$/.exec(message);
  if (service)
    return translate(locale, "Servizio non disponibile ({status})", {
      status: service[1],
    });
  return locale === "it" && message
    ? message
    : translate(
        locale,
        "Servizio temporaneamente non disponibile. Riprovare più tardi.",
      );
}
