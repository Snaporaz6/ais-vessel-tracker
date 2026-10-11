/** Source text remains Italian; machine status codes are resolved before translation. */
export const mapMessageAliases: Record<string, string> = {
  "mapData.zoomRequired": "Ingrandisci per caricare questo livello.",
  "mapData.areaTooLarge": "Restringi l'area per caricare i dettagli.",
  "mapData.unavailable": "Fonte temporaneamente non disponibile.",
  "mapData.partial":
    "Dati parziali: alcune fonti o dettagli non sono disponibili.",
  "mapData.available": "Dati disponibili nella vista corrente.",
  "mapData.noFeatures": "Nessun elemento nella fonte per questa vista.",
  "mapData.generalised": "Dati generalizzati per la visualizzazione.",
  active: "In vigore",
  historical: "Storico",
  cancelled: "Revocato",
  expired: "Scaduto",
  stale: "Stato attuale non verificato",
  reported: "Segnalato",
  confirmed: "Confermato",
  suspected: "Sospetto",
  not_applicable: "Non applicabile",
  unspecified: "Non specificato",
  reported_position: "Posizione pubblicata",
  reported_area: "Area pubblicata",
  approximate_region: "Indicatore regionale approssimativo",
  piracy: "Pirateria",
  attack: "Attacchi",
  incident: "Incidenti",
  restriction: "Interdizioni",
  navigation: "Pericoli alla navigazione",
  "mapData.datedSnapshot": "Copia datata: la fonte non è stata aggiornata.",
  "warnings.partial":
    "Copertura parziale: consultare lo stato delle singole fonti.",
  "warnings.unavailable":
    "Avvisi non disponibili; il rischio non è valutabile.",
  "warnings.coverage":
    "NAVAREA IV/XII e HYDROLANT/PAC/ARC; avvisi MARAD regionali; rapporti UKMTO selezionati. Copertura incompleta.",
  live: "Fonte aggiornata",
  snapshot: "Copia datata",
  unavailable: "Non disponibile",
  discontinued: "Fonte dismessa",
  "port-location": "Localizzazione portuale",
  "mapped-point": "Punto cartografato",
  "mapped-geometry": "Geometria cartografata",
  "source-centroid": "Centroide della fonte",
  "generalised-0.025-degrees": "Geometria generalizzata a 0,025°",
  marine_forecast: "Previsione marina",
  "Ocean conditions": "Condizioni marine",
  Yes: "Sì",
  No: "No",
  Unknown: "Sconosciuto",
  global: "Globale",
  "global selected ports; not every harbour":
    "Catalogo mondiale di porti selezionati; non include ogni porto.",
  "global selected ports; community harbour detail at zoom 9":
    "Catalogo mondiale; dettagli portuali della comunità da zoom 9.",
  "global community mapping; incomplete":
    "Cartografia della comunità nel mondo; copertura incompleta.",
  "European cables plus global community mapping; incomplete":
    "Cavi europei e cartografia della comunità nel mondo; copertura incompleta.",
  "European pipelines plus global community mapping; incomplete":
    "Condotte europee e cartografia della comunità nel mondo; copertura incompleta.",
  "European installations plus global community mapping; incomplete":
    "Impianti europei e cartografia della comunità nel mondo; copertura incompleta.",
  "global selected charted and uncharted wrecks; incomplete":
    "Relitti selezionati nel mondo; copertura incompleta.",
  "Mediterranean archaeological wrecks, France, UK, Ireland and global community mapping; incomplete":
    "Patrimonio del Mediterraneo, Francia, Regno Unito, Irlanda e cartografia della comunità; copertura incompleta.",
  "European marine/coastal Natura 2000 and globally mapped marine protected areas; incomplete":
    "Natura 2000 marino/costiero europeo e aree marine cartografate nel mondo; copertura incompleta.",
  "Global model coverage; sampled grid cells only, availability varies by variable and location":
    "Modello globale con celle campionate; disponibilità variabile per luogo e parametro.",
  "warnings.ngaCoverage":
    "NAVAREA IV/XII e HYDROLANT/HYDROPAC/HYDROARC; copertura incompleta.",
  "warnings.ngaLive": "Lista degli avvisi in vigore ricontrollata dalla fonte.",
  "warnings.ngaSnapshot":
    "Copia datata degli avvisi NGA; stato attuale non verificato.",
  "warnings.maradCoverage":
    "Avvisi regionali per la navigazione commerciale statunitense.",
  "warnings.maradLive": "Elenco MARAD ricontrollato dalla fonte.",
  "warnings.maradSnapshot": "Copia datata MARAD; stato attuale non verificato.",
  "warnings.ukmtoCoverage":
    "Rapporti UKMTO selezionati nel Medio Oriente e Oceano Indiano; copertura incompleta.",
  "warnings.ukmtoSnapshot":
    "Estratto UKMTO datato; i rapporti senza coordinate sono elencati separatamente.",
  port: "Porto",
  submarine_cable: "Cavo sottomarino",
  pipeline: "Condotta",
  offshore_platform: "Piattaforma offshore",
  wind_farm: "Parco eolico",
  wreck: "Relitto",
  heritage_wreck: "Relitto archeologico",
  submerged_archaeological_site: "Sito archeologico sommerso",
  marine_protected_area: "Area marina protetta",
  anchorage: "Ancoraggio",
  anchor_berth: "Posto di fonda",
  "global, v4 (2023); no legal value":
    "Globale · v4 (2023) · senza valore legale.",
  "global, v12 (2023); dataset includes joint regimes and claims; no legal value":
    "Globale · v12 (2023) · regimi congiunti e rivendicazioni · senza valore legale.",
  "global, v2 (2024); no legal value":
    "Globale · v2 (2024) · senza valore legale.",
  "global extended continental shelves, v2 (2024); seabed jurisdiction":
    "Piattaforme estese globali · v2 (2024) · giurisdizione sul fondale.",
  internal: "Acque interne",
  territorial: "Mare territoriale",
  contiguous: "Zona contigua",
  eez: "ZEE",
  highseas: "Alto mare",
  shelf: "Piattaforma continentale estesa",
  "source-geometry; positional accuracy varies":
    "Geometria della fonte; accuratezza variabile.",
  "generalised-0.1-degrees": "Geometria generalizzata a 0,1°",
};
export const mapMessages: Record<string, readonly [string, string, string]> = {
  "Livelli mappa": ["Map layers", "Couches de la carte", "Kartenebenen"],
  "Chiudi livelli": ["Close layers", "Fermer les couches", "Ebenen schließen"],
  "Mappa globale": ["Global map", "Carte mondiale", "Weltkarte"],
  Porti: ["Ports", "Ports", "Häfen"],
  "Rade e ancoraggi": ["Anchorages", "Mouillages", "Ankerplätze"],
  "Accessi, piloti e segnalamenti": [
    "Approaches, pilots and aids",
    "Accès, pilotes et balisage",
    "Zufahrten, Lotsen und Seezeichen",
  ],
  "Porti e navigazione": [
    "Ports and navigation",
    "Ports et navigation",
    "Häfen und Navigation",
  ],
  Giurisdizioni: ["Jurisdictions", "Juridictions", "Hoheitsbereiche"],
  "Acque interne": ["Internal waters", "Eaux intérieures", "Innere Gewässer"],
  "Mare territoriale": ["Territorial sea", "Mer territoriale", "Küstenmeer"],
  "Zona contigua": ["Contiguous zone", "Zone contiguë", "Anschlusszone"],
  ZEE: ["EEZ", "ZEE", "AWZ"],
  "Alto mare": ["High seas", "Haute mer", "Hohe See"],
  "Piattaforma continentale estesa": [
    "Extended continental shelf",
    "Plateau continental étendu",
    "Erweiterter Festlandsockel",
  ],
  "Infrastrutture e patrimonio": [
    "Infrastructure and heritage",
    "Infrastructures et patrimoine",
    "Infrastruktur und Kulturerbe",
  ],
  "Cavi sottomarini": [
    "Submarine cables",
    "Câbles sous-marins",
    "Unterseekabel",
  ],
  Condotte: ["Pipelines", "Conduites", "Rohrleitungen"],
  "Impianti offshore": [
    "Offshore installations",
    "Installations offshore",
    "Offshore-Anlagen",
  ],
  Relitti: ["Wrecks", "Épaves", "Wracks"],
  "Siti sommersi": [
    "Submerged heritage",
    "Patrimoine submergé",
    "Unterwasser-Kulturerbe",
  ],
  "Ambiente e traffico": [
    "Environment and traffic",
    "Environnement et trafic",
    "Umwelt und Verkehr",
  ],
  "Aree marine protette": [
    "Marine protected areas",
    "Aires marines protégées",
    "Meeresschutzgebiete",
  ],
  "Densità storica del traffico": [
    "Historical traffic density",
    "Densité historique du trafic",
    "Historische Verkehrsdichte",
  ],
  Onde: ["Waves", "Vagues", "Wellen"],
  Correnti: ["Currents", "Courants", "Strömungen"],
  "Età delle posizioni AIS": [
    "AIS position age",
    "Ancienneté des positions AIS",
    "Alter der AIS-Positionen",
  ],
  Sicurezza: ["Safety and security", "Sécurité", "Sicherheit"],
  "Warning e incidenti": [
    "Warnings and incidents",
    "Avertissements et incidents",
    "Warnungen und Vorfälle",
  ],
  "AIS della demo nel Mediterraneo. Gli altri livelli dipendono dalla copertura delle fonti.":
    [
      "Demo AIS covers the Mediterranean. Other layers depend on source coverage.",
      "L’AIS de la démo couvre la Méditerranée. Les autres couches dépendent des sources.",
      "Demo-AIS deckt das Mittelmeer ab. Andere Ebenen hängen von der Quellenabdeckung ab.",
    ],
  "GEBCO 2025 globale generalizzato; EMODnet nel Mediterraneo da zoom 4. Profondità in metri.":
    [
      "Generalised global GEBCO 2025; EMODnet in the Mediterranean from zoom 4. Depths in metres.",
      "GEBCO 2025 mondial généralisé ; EMODnet en Méditerranée dès le zoom 4. Profondeurs en mètres.",
      "Generalisierte globale GEBCO-Daten 2025; EMODnet im Mittelmeer ab Zoom 4. Tiefen in Metern.",
    ],
  "Non utilizzabile per la navigazione.": [
    "Not for navigation.",
    "Ne pas utiliser pour la navigation.",
    "Nicht zur Navigation geeignet.",
  ],
  "Caricamento…": ["Loading…", "Chargement…", "Wird geladen…"],
  "{count} elementi nella vista": [
    "{count} features in view",
    "{count} éléments visibles",
    "{count} Objekte im Ausschnitt",
  ],
  "Ingrandisci almeno a zoom {zoom}.": [
    "Zoom in to at least level {zoom}.",
    "Zoomez au moins au niveau {zoom}.",
    "Mindestens auf Stufe {zoom} vergrößern.",
  ],
  Fonte: ["Source", "Source", "Quelle"],
  Copertura: ["Coverage", "Couverture", "Abdeckung"],
  "Data della fonte": ["Source date", "Date de la source", "Datum der Quelle"],
  "Ultima consultazione": [
    "Last retrieved",
    "Dernière consultation",
    "Letzter Abruf",
  ],
  Licenza: ["Licence", "Licence", "Lizenz"],
  "Apri fonte": ["Open source", "Ouvrir la source", "Quelle öffnen"],
  Riprova: ["Retry", "Réessayer", "Erneut versuchen"],
  "Periodo degli eventi": [
    "Event period",
    "Période des événements",
    "Zeitraum der Ereignisse",
  ],
  "Tipo di warning": ["Warning type", "Type d’avertissement", "Warnungstyp"],
  Pirateria: ["Piracy", "Piraterie", "Piraterie"],
  Attacchi: ["Attacks", "Attaques", "Angriffe"],
  Incidenti: ["Incidents", "Incidents", "Vorfälle"],
  Interdizioni: ["Restrictions", "Restrictions", "Sperrungen"],
  "Pericoli alla navigazione": [
    "Navigation hazards",
    "Dangers pour la navigation",
    "Navigationsgefahren",
  ],
  "Solo avvisi attivi verificati": [
    "Only verified active notices",
    "Avis actifs vérifiés uniquement",
    "Nur überprüfte aktive Warnungen",
  ],
  "Dati insufficienti per un rating globale. Gli avvisi attivi hanno precedenza sugli eventi storici.":
    [
      "Insufficient data for a global risk rating. Active notices take priority over historical events.",
      "Données insuffisantes pour un indice mondial. Les avis actifs priment sur les événements historiques.",
      "Unzureichende Daten für eine globale Risikobewertung. Aktive Warnungen haben Vorrang vor historischen Ereignissen.",
    ],
  "Attribuzione e condizioni NGA": [
    "NGA attribution and terms",
    "Attribution et conditions NGA",
    "NGA-Quellenangabe und Bedingungen",
  ],
  "Orizzonte della previsione": [
    "Forecast horizon",
    "Échéance de prévision",
    "Vorhersagezeitraum",
  ],
  Ora: ["Now", "Maintenant", "Jetzt"],
  "{count} avvisi attivi intersecano i segmenti osservati nella vista corrente.":
    [
      "{count} active notices intersect observed segments in the current view.",
      "{count} avis actifs croisent les segments observés dans la vue actuelle.",
      "{count} aktive Warnungen überschneiden beobachtete Abschnitte im aktuellen Ausschnitt.",
    ],
  "Nessuna intersezione rilevata nella vista corrente. La copertura degli avvisi è parziale.":
    [
      "No intersection found in the current view. Warning coverage is partial.",
      "Aucune intersection détectée dans la vue actuelle. La couverture des avis est partielle.",
      "Keine Überschneidung im aktuellen Ausschnitt gefunden. Warnungen sind nur teilweise abgedeckt.",
    ],
  "Dettaglio cartografico": [
    "Map feature details",
    "Détail cartographique",
    "Kartendetails",
  ],
  Tipo: ["Type", "Type", "Typ"],
  Stato: ["Status", "État", "Status"],
  Conferma: ["Confirmation", "Confirmation", "Bestätigung"],
  Precisione: ["Precision", "Précision", "Genauigkeit"],
  Paese: ["Country", "Pays", "Land"],
  Profondità: ["Depth", "Profondeur", "Tiefe"],
  "Stato del progetto": ["Project status", "État du projet", "Projektstatus"],
  "Data evento": ["Event date", "Date de l’événement", "Ereignisdatum"],
  "Valido dal": ["Valid from", "Valide à partir du", "Gültig ab"],
  "Valido fino al": ["Valid until", "Valide jusqu’au", "Gültig bis"],
  "Validità previsione": [
    "Forecast valid time",
    "Validité de la prévision",
    "Vorhersage gültig für",
  ],
  "Altezza onde": ["Wave height", "Hauteur des vagues", "Wellenhöhe"],
  "Velocità corrente": [
    "Current speed",
    "Vitesse du courant",
    "Strömungsgeschwindigkeit",
  ],
  "Avviso precedentemente in vigore: lo stato attuale non è verificato.": [
    "Notice previously in force: current status is unverified.",
    "Avis précédemment en vigueur : l’état actuel n’est pas vérifié.",
    "Warnung war zuvor gültig: aktueller Status ist nicht überprüft.",
  ],
  "Osservazioni AIS entro 5 km": [
    "AIS observations within 5 km",
    "Observations AIS dans un rayon de 5 km",
    "AIS-Beobachtungen im Umkreis von 5 km",
  ],
  "{total} navi recenti; {stopped} a velocità fino a 0,5 kn.": [
    "{total} recently observed vessels; {stopped} moving at up to 0.5 kn.",
    "{total} navires récemment observés ; {stopped} à une vitesse maximale de 0,5 kn.",
    "{total} kürzlich beobachtete Schiffe; {stopped} mit höchstens 0,5 kn.",
  ],
  "Osservazioni degli ultimi 10 minuti. Non misura disponibilità degli ormeggi né congestione ufficiale.":
    [
      "Observations from the last 10 minutes. This does not measure berth availability or official congestion.",
      "Observations des 10 dernières minutes. Ne mesure ni la disponibilité des places ni la congestion officielle.",
      "Beobachtungen der letzten 10 Minuten. Keine Messung freier Liegeplätze oder offizieller Überlastung.",
    ],
  "Mappa globale · AIS della demo nel Mediterraneo": [
    "Global map · demo AIS in the Mediterranean",
    "Carte mondiale · AIS de la démo en Méditerranée",
    "Weltkarte · Demo-AIS im Mittelmeer",
  ],
  "Nessuna acquisizione AIS fuori dal Mediterraneo in questa demo.": [
    "This demo does not collect AIS outside the Mediterranean.",
    "Cette démo ne collecte pas d’AIS hors de la Méditerranée.",
    "Diese Demo erfasst kein AIS außerhalb des Mittelmeers.",
  ],
  "Ingrandisci per caricare questo livello.": [
    "Zoom in to load this layer.",
    "Zoomez pour charger cette couche.",
    "Zum Laden dieser Ebene vergrößern.",
  ],
  "Restringi l'area per caricare i dettagli.": [
    "Narrow the area to load details.",
    "Réduisez la zone pour charger les détails.",
    "Ausschnitt verkleinern, um Details zu laden.",
  ],
  "Fonte temporaneamente non disponibile.": [
    "Source temporarily unavailable.",
    "Source temporairement indisponible.",
    "Quelle vorübergehend nicht verfügbar.",
  ],
  "Dati parziali: alcune fonti o dettagli non sono disponibili.": [
    "Partial data: some sources or details are unavailable.",
    "Données partielles : certaines sources ou détails sont indisponibles.",
    "Teilweise Daten: einige Quellen oder Details sind nicht verfügbar.",
  ],
  "Dati disponibili nella vista corrente.": [
    "Data available in the current view.",
    "Données disponibles dans la vue actuelle.",
    "Daten im aktuellen Ausschnitt verfügbar.",
  ],
  "Nessun elemento nella fonte per questa vista.": [
    "No features in the source for this view.",
    "Aucun élément dans la source pour cette vue.",
    "Keine Objekte in der Quelle für diesen Ausschnitt.",
  ],
  "Dati generalizzati per la visualizzazione.": [
    "Generalised display data.",
    "Données généralisées pour l’affichage.",
    "Generalisierte Daten zur Darstellung.",
  ],
  "In vigore": ["In force", "En vigueur", "In Kraft"],
  Revocato: ["Cancelled", "Révoqué", "Aufgehoben"],
  Scaduto: ["Expired", "Expiré", "Abgelaufen"],
  "Stato attuale non verificato": [
    "Current status unverified",
    "État actuel non vérifié",
    "Aktueller Status nicht überprüft",
  ],
  Segnalato: ["Reported", "Signalé", "Gemeldet"],
  Confermato: ["Confirmed", "Confirmé", "Bestätigt"],
  Sospetto: ["Suspected", "Suspect", "Verdächtig"],
  "Non applicabile": ["Not applicable", "Sans objet", "Nicht zutreffend"],
  "Non specificato": ["Unspecified", "Non précisé", "Nicht angegeben"],
  "Posizione pubblicata": [
    "Published position",
    "Position publiée",
    "Veröffentlichte Position",
  ],
  "Area pubblicata": [
    "Published area",
    "Zone publiée",
    "Veröffentlichtes Gebiet",
  ],
  "Indicatore regionale approssimativo": [
    "Approximate regional marker",
    "Indicateur régional approximatif",
    "Ungefähre regionale Markierung",
  ],
  "Porti e servizi disponibili nelle fonti.": [
    "Ports and services available in the sources.",
    "Ports et services disponibles dans les sources.",
    "Häfen und Dienste aus den verfügbaren Quellen.",
  ],
  "Aree e punti di ancoraggio documentati; copertura variabile.": [
    "Documented anchorage areas and points; coverage varies.",
    "Zones et points de mouillage documentés ; couverture variable.",
    "Dokumentierte Ankergebiete und -punkte; Abdeckung variiert.",
  ],
  "Canali, banchine, punti pilota, boe e fari.": [
    "Channels, berths, pilot points, buoys and lights.",
    "Chenaux, quais, points pilotes, bouées et phares.",
    "Fahrwasser, Kais, Lotsenpunkte, Bojen und Leuchttürme.",
  ],
  "Delimitazioni informative: verificare le fonti nazionali.": [
    "Informative boundaries: check national sources.",
    "Limites indicatives : consulter les sources nationales.",
    "Informative Grenzen: nationale Quellen prüfen.",
  ],
  "Zone economiche esclusive; non equivalgono al mare territoriale.": [
    "Exclusive economic zones; a different regime from territorial seas.",
    "Zones économiques exclusives ; régime différent de la mer territoriale.",
    "Ausschließliche Wirtschaftszonen; anderes Rechtsregime als das Küstenmeer.",
  ],
  "Riguarda il fondale e il sottosuolo, non le acque sovrastanti.": [
    "Applies to the seabed and subsoil, not the overlying waters.",
    "Concerne le fond et le sous-sol, pas les eaux au-dessus.",
    "Betrifft Meeresboden und Untergrund, nicht die darüberliegenden Gewässer.",
  ],
  "Il dettaglio distingue tracciati schematici ed effettivi, quando indicato.":
    [
      "Details distinguish schematic and actual routes where specified.",
      "Les détails distinguent les tracés schématiques et réels lorsque précisé.",
      "Details unterscheiden schematische und tatsächliche Verläufe, soweit angegeben.",
    ],
  "Condotte sottomarine disponibili nelle fonti.": [
    "Submarine pipelines available in the sources.",
    "Conduites sous-marines disponibles dans les sources.",
    "Unterwasser-Rohrleitungen aus den verfügbaren Quellen.",
  ],
  "Piattaforme e impianti; consultare lo stato del progetto.": [
    "Platforms and installations; check project status.",
    "Plateformes et installations ; consulter l’état du projet.",
    "Plattformen und Anlagen; Projektstatus prüfen.",
  ],
  "Posizioni documentate; l'assenza di simboli non esclude altri relitti.": [
    "Documented positions; missing symbols do not exclude other wrecks.",
    "Positions documentées ; l’absence de symboles n’exclut pas d’autres épaves.",
    "Dokumentierte Positionen; fehlende Symbole schließen andere Wracks nicht aus.",
  ],
  "Siti archeologici pubblicamente documentati.": [
    "Publicly documented archaeological sites.",
    "Sites archéologiques documentés publiquement.",
    "Öffentlich dokumentierte archäologische Stätten.",
  ],
  "Consultare i regolamenti locali per i divieti applicabili.": [
    "Consult local regulations for applicable restrictions.",
    "Consulter les règlements locaux pour les restrictions applicables.",
    "Örtliche Vorschriften für geltende Einschränkungen prüfen.",
  ],
  "EMODnet 2024: acque europee, media annua in ore nave/km²/mese.": [
    "EMODnet 2024: European waters, annual mean in vessel-hours/km²/month.",
    "EMODnet 2024 : eaux européennes, moyenne annuelle en heures-navire/km²/mois.",
    "EMODnet 2024: europäische Gewässer, Jahresmittel in Schiffsstunden/km²/Monat.",
  ],
  "Copertura AIS satellitare incompleta dal giugno 2024: confronti fra anni limitati.":
    [
      "Incomplete satellite AIS coverage since June 2024: limited comparisons between years.",
      "Couverture AIS satellitaire incomplète depuis juin 2024 : comparaisons annuelles limitées.",
      "Unvollständige Satelliten-AIS-Abdeckung seit Juni 2024: Jahresvergleiche eingeschränkt.",
    ],
  "Previsioni campionate nell'area visibile; precisione costiera limitata.": [
    "Sampled forecasts in the visible area; limited coastal accuracy.",
    "Prévisions échantillonnées dans la zone visible ; précision côtière limitée.",
    "Stichprobenvorhersagen im sichtbaren Gebiet; begrenzte Küstengenauigkeit.",
  ],
  "Aloni: oltre 10 minuti, oltre un'ora, oltre sei ore.": [
    "Halos: over 10 minutes, over one hour, over six hours.",
    "Halos : plus de 10 minutes, plus d’une heure, plus de six heures.",
    "Ringe: über 10 Minuten, über eine Stunde, über sechs Stunden.",
  ],
  "Avvisi delle fonti disponibili; nessuna segnalazione non significa sicurezza.":
    [
      "Notices from available sources; no report does not mean safe.",
      "Avis des sources disponibles ; absence de signalement ne signifie pas sécurité.",
      "Warnungen verfügbarer Quellen; keine Meldung bedeutet nicht Sicherheit.",
    ],
  "Copia datata: la fonte non è stata aggiornata.": [
    "Dated snapshot: the source could not be refreshed.",
    "Copie datée : la source n’a pas pu être actualisée.",
    "Datierte Kopie: die Quelle konnte nicht aktualisiert werden.",
  ],
  "Copertura parziale: consultare lo stato delle singole fonti.": [
    "Partial coverage: check each source’s status.",
    "Couverture partielle : consultez l’état de chaque source.",
    "Teilweise Abdeckung: Status der einzelnen Quellen prüfen.",
  ],
  "Avvisi non disponibili; il rischio non è valutabile.": [
    "Notices unavailable; risk cannot be assessed.",
    "Avis indisponibles ; le risque ne peut pas être évalué.",
    "Warnungen nicht verfügbar; Risiko kann nicht bewertet werden.",
  ],
  "NAVAREA IV/XII e HYDROLANT/PAC/ARC; avvisi MARAD regionali; rapporti UKMTO selezionati. Copertura incompleta.":
    [
      "NAVAREA IV/XII and HYDROLANT/PAC/ARC; regional MARAD notices; selected UKMTO reports. Incomplete coverage.",
      "NAVAREA IV/XII et HYDROLANT/PAC/ARC ; avis régionaux MARAD ; rapports UKMTO sélectionnés. Couverture incomplète.",
      "NAVAREA IV/XII und HYDROLANT/PAC/ARC; regionale MARAD-Warnungen; ausgewählte UKMTO-Berichte. Unvollständige Abdeckung.",
    ],
  "Fonte aggiornata": [
    "Refreshed source",
    "Source actualisée",
    "Aktualisierte Quelle",
  ],
  "Copia datata": ["Dated snapshot", "Copie datée", "Datierte Kopie"],
  "Non disponibile": ["Unavailable", "Indisponible", "Nicht verfügbar"],
  "Fonte dismessa": [
    "Discontinued source",
    "Source arrêtée",
    "Eingestellte Quelle",
  ],
  "Ultimo tentativo": ["Last attempt", "Dernière tentative", "Letzter Versuch"],
  "{count} segnalazioni senza coordinate utilizzabili.": [
    "{count} reports without usable coordinates.",
    "{count} signalements sans coordonnées utilisables.",
    "{count} Meldungen ohne nutzbare Koordinaten.",
  ],
  "Eventi senza posizione cartografica": [
    "Events without map positions",
    "Événements sans position cartographique",
    "Ereignisse ohne Kartenposition",
  ],
  "Avviso attivo verificato": [
    "Verified active notice",
    "Avis actif vérifié",
    "Überprüfte aktive Warnung",
  ],
  "Storico o stato non verificato": [
    "Historical or unverified status",
    "Historique ou état non vérifié",
    "Historisch oder Status ungeprüft",
  ],
  "Avvisi della tratta non disponibili o in caricamento.": [
    "Route notices unavailable or loading.",
    "Avis de l’itinéraire indisponibles ou en cours de chargement.",
    "Routenwarnungen nicht verfügbar oder werden geladen.",
  ],
  "Rame: rivendicazioni, proposte o regimi congiunti indicati dalla fonte. I confini sono generalizzati e non hanno valore legale.":
    [
      "Copper: claims, proposals or joint regimes indicated by the source. Boundaries are generalised and have no legal standing.",
      "Cuivre : revendications, propositions ou régimes conjoints indiqués par la source. Limites généralisées sans valeur juridique.",
      "Kupfer: von der Quelle angegebene Ansprüche, Vorschläge oder gemeinsame Regime. Generalisierte Grenzen ohne Rechtswirkung.",
    ],
  "Regime della fonte": [
    "Source regime",
    "Régime de la source",
    "Regime der Quelle",
  ],
  Sovranità: ["Sovereignty", "Souveraineté", "Souveränität"],
  "Profondità canale": [
    "Channel depth",
    "Profondeur du chenal",
    "Fahrwassertiefe",
  ],
  "Profondità ancoraggio": [
    "Anchorage depth",
    "Profondeur du mouillage",
    "Ankertiefe",
  ],
  "Profondità banchina merci": [
    "Cargo pier depth",
    "Profondeur du quai marchand",
    "Tiefe am Frachtkai",
  ],
  "Profondità terminal petrolifero": [
    "Oil terminal depth",
    "Profondeur du terminal pétrolier",
    "Tiefe am Ölterminal",
  ],
  "Profondità terminal GNL": [
    "LNG terminal depth",
    "Profondeur du terminal GNL",
    "Tiefe am LNG-Terminal",
  ],
  "Lunghezza massima nave": [
    "Maximum vessel length",
    "Longueur maximale du navire",
    "Maximale Schiffslänge",
  ],
  "Larghezza massima nave": [
    "Maximum vessel beam",
    "Largeur maximale du navire",
    "Maximale Schiffsbreite",
  ],
  "Pescaggio massimo nave": [
    "Maximum vessel draft",
    "Tirant d’eau maximal du navire",
    "Maximaler Tiefgang",
  ],
  "Pilotaggio obbligatorio": [
    "Compulsory pilotage",
    "Pilotage obligatoire",
    "Lotsenpflicht",
  ],
  "Assistenza rimorchiatori": [
    "Tug assistance",
    "Assistance des remorqueurs",
    "Schlepperhilfe",
  ],
  Carburante: ["Fuel", "Carburant", "Treibstoff"],
  Acqua: ["Water", "Eau", "Wasser"],
  Riparazioni: ["Repairs", "Réparations", "Reparaturen"],
  "Assistenza medica": [
    "Medical facilities",
    "Services médicaux",
    "Medizinische Versorgung",
  ],
  "Restrizioni di accesso": [
    "Entry restrictions",
    "Restrictions d’entrée",
    "Zufahrtsbeschränkungen",
  ],
  "Data segnalazione": ["Report date", "Date du signalement", "Meldedatum"],
  "Profondità e servizi provengono dal catalogo portuale; verificare con l'autorità locale.":
    [
      "Depths and services come from the port catalogue; check with the local authority.",
      "Profondeurs et services issus du catalogue portuaire ; vérifier auprès de l’autorité locale.",
      "Tiefen und Dienste stammen aus dem Hafenkatalog; örtliche Behörde konsultieren.",
    ],
  "Ultima posizione pubblicata della nave; non identifica il luogo dell'attacco.":
    [
      "Last published vessel position; it does not identify the attack location.",
      "Dernière position publiée du navire ; elle n’identifie pas le lieu de l’attaque.",
      "Letzte veröffentlichte Schiffsposition; sie bezeichnet nicht den Angriffsort.",
    ],
  "Localizzazione portuale": [
    "Port location",
    "Localisation du port",
    "Hafenposition",
  ],
  "Punto cartografato": [
    "Mapped point",
    "Point cartographié",
    "Kartierter Punkt",
  ],
  "Geometria cartografata": [
    "Mapped geometry",
    "Géométrie cartographiée",
    "Kartierte Geometrie",
  ],
  "Centroide della fonte": [
    "Source centroid",
    "Centroïde de la source",
    "Schwerpunkt der Quelle",
  ],
  "Geometria generalizzata a 0,025°": [
    "Geometry generalised to 0.025°",
    "Géométrie généralisée à 0,025°",
    "Auf 0,025° generalisierte Geometrie",
  ],
  "Previsione marina": [
    "Marine forecast",
    "Prévision marine",
    "Meeresvorhersage",
  ],
  "Condizioni marine": [
    "Ocean conditions",
    "Conditions marines",
    "Meeresbedingungen",
  ],
  Sì: ["Yes", "Oui", "Ja"],
  Sconosciuto: ["Unknown", "Inconnu", "Unbekannt"],
  Globale: ["Global", "Mondiale", "Global"],
  "Catalogo mondiale di porti selezionati; non include ogni porto.": [
    "Global selected ports; not every harbour.",
    "Ports sélectionnés dans le monde ; tous les ports ne sont pas inclus.",
    "Weltweit ausgewählte Häfen; nicht jeder Hafen ist enthalten.",
  ],
  "Catalogo mondiale; dettagli portuali della comunità da zoom 9.": [
    "Global catalogue; community harbour detail from zoom 9.",
    "Catalogue mondial ; détails portuaires communautaires dès le zoom 9.",
    "Weltweiter Katalog; Hafendetails der Community ab Zoom 9.",
  ],
  "Cartografia della comunità nel mondo; copertura incompleta.": [
    "Global community mapping; incomplete coverage.",
    "Cartographie communautaire mondiale ; couverture incomplète.",
    "Weltweite Community-Kartierung; unvollständige Abdeckung.",
  ],
  "Cavi europei e cartografia della comunità nel mondo; copertura incompleta.":
    [
      "European cables and global community mapping; incomplete coverage.",
      "Câbles européens et cartographie communautaire mondiale ; couverture incomplète.",
      "Europäische Kabel und weltweite Community-Kartierung; unvollständige Abdeckung.",
    ],
  "Condotte europee e cartografia della comunità nel mondo; copertura incompleta.":
    [
      "European pipelines and global community mapping; incomplete coverage.",
      "Conduites européennes et cartographie communautaire mondiale ; couverture incomplète.",
      "Europäische Rohrleitungen und weltweite Community-Kartierung; unvollständige Abdeckung.",
    ],
  "Impianti europei e cartografia della comunità nel mondo; copertura incompleta.":
    [
      "European installations and global community mapping; incomplete coverage.",
      "Installations européennes et cartographie communautaire mondiale ; couverture incomplète.",
      "Europäische Anlagen und weltweite Community-Kartierung; unvollständige Abdeckung.",
    ],
  "Relitti selezionati nel mondo; copertura incompleta.": [
    "Selected wrecks worldwide; incomplete coverage.",
    "Épaves sélectionnées dans le monde ; couverture incomplète.",
    "Ausgewählte Wracks weltweit; unvollständige Abdeckung.",
  ],
  "Patrimonio del Mediterraneo, Francia, Regno Unito, Irlanda e cartografia della comunità; copertura incompleta.":
    [
      "Mediterranean, French, UK and Irish heritage plus community mapping; incomplete coverage.",
      "Patrimoine méditerranéen, français, britannique et irlandais et cartographie communautaire ; couverture incomplète.",
      "Kulturerbe im Mittelmeer, Frankreich, Großbritannien und Irland sowie Community-Kartierung; unvollständige Abdeckung.",
    ],
  "Natura 2000 marino/costiero europeo e aree marine cartografate nel mondo; copertura incompleta.":
    [
      "European marine/coastal Natura 2000 and mapped marine areas worldwide; incomplete coverage.",
      "Natura 2000 marin/côtier européen et aires marines cartographiées dans le monde ; couverture incomplète.",
      "Europäische marine/küstennahe Natura-2000-Gebiete und weltweit kartierte Meeresgebiete; unvollständige Abdeckung.",
    ],
  "Modello globale con celle campionate; disponibilità variabile per luogo e parametro.":
    [
      "Global model with sampled cells; availability varies by location and variable.",
      "Modèle mondial avec cellules échantillonnées ; disponibilité variable selon le lieu et le paramètre.",
      "Globales Modell mit Stichprobenzellen; Verfügbarkeit je nach Ort und Parameter.",
    ],
  "NAVAREA IV/XII e HYDROLANT/HYDROPAC/HYDROARC; copertura incompleta.": [
    "NAVAREA IV/XII and HYDROLANT/HYDROPAC/HYDROARC; incomplete coverage.",
    "NAVAREA IV/XII et HYDROLANT/HYDROPAC/HYDROARC ; couverture incomplète.",
    "NAVAREA IV/XII und HYDROLANT/HYDROPAC/HYDROARC; unvollständige Abdeckung.",
  ],
  "Lista degli avvisi in vigore ricontrollata dalla fonte.": [
    "In-force notices rechecked with the source.",
    "Liste des avis en vigueur revérifiée auprès de la source.",
    "Gültige Warnungen erneut bei der Quelle geprüft.",
  ],
  "Copia datata degli avvisi NGA; stato attuale non verificato.": [
    "Dated NGA notice snapshot; current status unverified.",
    "Copie datée des avis NGA ; état actuel non vérifié.",
    "Datierte NGA-Warnungen; aktueller Status ungeprüft.",
  ],
  "Avvisi regionali per la navigazione commerciale statunitense.": [
    "Regional notices for US commercial shipping.",
    "Avis régionaux pour la navigation commerciale américaine.",
    "Regionale Warnungen für die US-Handelsschifffahrt.",
  ],
  "Elenco MARAD ricontrollato dalla fonte.": [
    "MARAD list rechecked with the source.",
    "Liste MARAD revérifiée auprès de la source.",
    "MARAD-Liste erneut bei der Quelle geprüft.",
  ],
  "Copia datata MARAD; stato attuale non verificato.": [
    "Dated MARAD snapshot; current status unverified.",
    "Copie datée MARAD ; état actuel non vérifié.",
    "Datierte MARAD-Kopie; aktueller Status ungeprüft.",
  ],
  "Rapporti UKMTO selezionati nel Medio Oriente e Oceano Indiano; copertura incompleta.":
    [
      "Selected UKMTO reports in the Middle East and Indian Ocean; incomplete coverage.",
      "Rapports UKMTO sélectionnés au Moyen-Orient et dans l’océan Indien ; couverture incomplète.",
      "Ausgewählte UKMTO-Berichte im Nahen Osten und Indischen Ozean; unvollständige Abdeckung.",
    ],
  "Estratto UKMTO datato; i rapporti senza coordinate sono elencati separatamente.":
    [
      "Dated UKMTO extract; reports without coordinates are listed separately.",
      "Extrait UKMTO daté ; rapports sans coordonnées listés séparément.",
      "Datierter UKMTO-Auszug; Berichte ohne Koordinaten separat aufgeführt.",
    ],
  Porto: ["Port", "Port", "Hafen"],
  "Cavo sottomarino": ["Submarine cable", "Câble sous-marin", "Unterseekabel"],
  Condotta: ["Pipeline", "Conduite", "Rohrleitung"],
  "Piattaforma offshore": [
    "Offshore platform",
    "Plateforme offshore",
    "Offshore-Plattform",
  ],
  "Parco eolico": ["Wind farm", "Parc éolien", "Windpark"],
  Relitto: ["Wreck", "Épave", "Wrack"],
  "Relitto archeologico": [
    "Heritage wreck",
    "Épave archéologique",
    "Archäologisches Wrack",
  ],
  "Sito archeologico sommerso": [
    "Submerged archaeological site",
    "Site archéologique submergé",
    "Unterwasser-Ausgrabungsstätte",
  ],
  "Area marina protetta": [
    "Marine protected area",
    "Aire marine protégée",
    "Meeresschutzgebiet",
  ],
  Ancoraggio: ["Anchorage", "Mouillage", "Ankerplatz"],
  "Posto di fonda": ["Anchor berth", "Poste de mouillage", "Ankerliegeplatz"],
  "Globale · v4 (2023) · senza valore legale.": [
    "Global · v4 (2023) · no legal standing.",
    "Mondial · v4 (2023) · sans valeur juridique.",
    "Global · v4 (2023) · ohne Rechtswirkung.",
  ],
  "Globale · v12 (2023) · regimi congiunti e rivendicazioni · senza valore legale.":
    [
      "Global · v12 (2023) · joint regimes and claims · no legal standing.",
      "Mondial · v12 (2023) · régimes conjoints et revendications · sans valeur juridique.",
      "Global · v12 (2023) · gemeinsame Regime und Ansprüche · ohne Rechtswirkung.",
    ],
  "Globale · v2 (2024) · senza valore legale.": [
    "Global · v2 (2024) · no legal standing.",
    "Mondial · v2 (2024) · sans valeur juridique.",
    "Global · v2 (2024) · ohne Rechtswirkung.",
  ],
  "Piattaforme estese globali · v2 (2024) · giurisdizione sul fondale.": [
    "Global extended shelves · v2 (2024) · seabed jurisdiction.",
    "Plateaux étendus mondiaux · v2 (2024) · juridiction du fond.",
    "Globale erweiterte Schelfgebiete · v2 (2024) · Meeresbodenrecht.",
  ],
  "Pilotaggio disponibile": [
    "Pilotage available",
    "Pilotage disponible",
    "Lotsendienst verfügbar",
  ],
  "Ancoraggio disponibile": [
    "Anchorage available",
    "Mouillage disponible",
    "Ankerplatz verfügbar",
  ],
  "Separazione del traffico": [
    "Traffic separation",
    "Séparation du trafic",
    "Verkehrstrennung",
  ],
  "Servizio VTS": ["VTS service", "Service VTS", "VTS-Dienst"],
  "Data di aggiornamento non pubblicata dalla fonte.": [
    "Update date not published by the source.",
    "Date de mise à jour non publiée par la source.",
    "Aktualisierungsdatum von der Quelle nicht veröffentlicht.",
  ],
  "Geometria della fonte; accuratezza variabile.": [
    "Source geometry; accuracy varies.",
    "Géométrie de la source ; précision variable.",
    "Quellengeometrie; Genauigkeit variiert.",
  ],
  "Geometria generalizzata a 0,1°": [
    "Geometry generalised to 0.1°",
    "Géométrie généralisée à 0,1°",
    "Auf 0,1° generalisierte Geometrie",
  ],
  "Conteggio delle navi caricate e visibili: dipende dalla vista, dai filtri e dalla copertura AIS.":
    [
      "Count of loaded, visible vessels: depends on the viewport, filters and AIS coverage.",
      "Nombre de navires chargés et visibles : dépend de la vue, des filtres et de la couverture AIS.",
      "Anzahl geladener, sichtbarer Schiffe: abhängig von Ausschnitt, Filtern und AIS-Abdeckung.",
    ],
};
