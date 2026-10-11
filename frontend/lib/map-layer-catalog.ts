export type MapLayerId =
  | "ports"
  | "anchorages"
  | "navigation"
  | "cables"
  | "pipelines"
  | "offshore"
  | "wrecks"
  | "heritage"
  | "protected"
  | "territorial"
  | "contiguous"
  | "eez"
  | "internal"
  | "highseas"
  | "shelf"
  | "warnings"
  | "waves"
  | "currents"
  | "density"
  | "position-age";
export type LayerDefinition = {
  id: MapLayerId;
  name: string;
  group: string;
  color: string;
  minZoom: number;
  description: string;
};
export const MAP_LAYERS: LayerDefinition[] = [
  {
    id: "ports",
    name: "Porti",
    group: "Porti e navigazione",
    color: "#b5d2dc",
    minZoom: 2,
    description: "Porti e servizi disponibili nelle fonti.",
  },
  {
    id: "anchorages",
    name: "Rade e ancoraggi",
    group: "Porti e navigazione",
    color: "#77b6a5",
    minZoom: 9,
    description: "Aree e punti di ancoraggio documentati; copertura variabile.",
  },
  {
    id: "navigation",
    name: "Accessi, piloti e segnalamenti",
    group: "Porti e navigazione",
    color: "#b6a7d9",
    minZoom: 9,
    description: "Canali, banchine, punti pilota, boe e fari.",
  },
  {
    id: "internal",
    name: "Acque interne",
    group: "Giurisdizioni",
    color: "#9eb7ca",
    minZoom: 3,
    description: "Delimitazioni informative: verificare le fonti nazionali.",
  },
  {
    id: "territorial",
    name: "Mare territoriale",
    group: "Giurisdizioni",
    color: "#92b9d3",
    minZoom: 2,
    description: "Delimitazioni informative: verificare le fonti nazionali.",
  },
  {
    id: "contiguous",
    name: "Zona contigua",
    group: "Giurisdizioni",
    color: "#aaa9d0",
    minZoom: 2,
    description: "Delimitazioni informative: verificare le fonti nazionali.",
  },
  {
    id: "eez",
    name: "ZEE",
    group: "Giurisdizioni",
    color: "#a39aca",
    minZoom: 1,
    description:
      "Zone economiche esclusive; non equivalgono al mare territoriale.",
  },
  {
    id: "highseas",
    name: "Alto mare",
    group: "Giurisdizioni",
    color: "#80a2b9",
    minZoom: 1,
    description: "Delimitazioni informative: verificare le fonti nazionali.",
  },
  {
    id: "shelf",
    name: "Piattaforma continentale estesa",
    group: "Giurisdizioni",
    color: "#aaa084",
    minZoom: 1,
    description:
      "Riguarda il fondale e il sottosuolo, non le acque sovrastanti.",
  },
  {
    id: "cables",
    name: "Cavi sottomarini",
    group: "Infrastrutture e patrimonio",
    color: "#bdac80",
    minZoom: 6,
    description:
      "Il dettaglio distingue tracciati schematici ed effettivi, quando indicato.",
  },
  {
    id: "pipelines",
    name: "Condotte",
    group: "Infrastrutture e patrimonio",
    color: "#c79c80",
    minZoom: 6,
    description: "Condotte sottomarine disponibili nelle fonti.",
  },
  {
    id: "offshore",
    name: "Impianti offshore",
    group: "Infrastrutture e patrimonio",
    color: "#d5b17d",
    minZoom: 6,
    description: "Piattaforme e impianti; consultare lo stato del progetto.",
  },
  {
    id: "wrecks",
    name: "Relitti",
    group: "Infrastrutture e patrimonio",
    color: "#a9bdc0",
    minZoom: 7,
    description:
      "Posizioni documentate; l'assenza di simboli non esclude altri relitti.",
  },
  {
    id: "heritage",
    name: "Siti sommersi",
    group: "Infrastrutture e patrimonio",
    color: "#bfaba0",
    minZoom: 6,
    description: "Siti archeologici pubblicamente documentati.",
  },
  {
    id: "protected",
    name: "Aree marine protette",
    group: "Ambiente e traffico",
    color: "#7da98c",
    minZoom: 6,
    description: "Consultare i regolamenti locali per i divieti applicabili.",
  },
  {
    id: "density",
    name: "Densità storica del traffico",
    group: "Ambiente e traffico",
    color: "#bcad79",
    minZoom: 3,
    description:
      "EMODnet 2024: acque europee, media annua in ore nave/km²/mese.",
  },
  {
    id: "waves",
    name: "Onde",
    group: "Ambiente e traffico",
    color: "#80b6c9",
    minZoom: 2,
    description:
      "Previsioni campionate nell'area visibile; precisione costiera limitata.",
  },
  {
    id: "currents",
    name: "Correnti",
    group: "Ambiente e traffico",
    color: "#80c3bb",
    minZoom: 2,
    description:
      "Previsioni campionate nell'area visibile; precisione costiera limitata.",
  },
  {
    id: "position-age",
    name: "Età delle posizioni AIS",
    group: "Ambiente e traffico",
    color: "#d1b184",
    minZoom: 2,
    description: "Aloni: oltre 10 minuti, oltre un'ora, oltre sei ore.",
  },
  {
    id: "warnings",
    name: "Warning e incidenti",
    group: "Sicurezza",
    color: "#e0a267",
    minZoom: 1,
    description:
      "Avvisi delle fonti disponibili; nessuna segnalazione non significa sicurezza.",
  },
];
export const LAYER_GROUPS = [
  ...new Set(MAP_LAYERS.map((layer) => layer.group)),
];
