# Fondali globali

## Implementazione

Il sito distribuisce le curve batimetriche globali come tessere vettoriali MVT
statiche, servite dallo stesso dominio dell'applicazione. MapLibre richiede solo
le tessere corrispondenti alla zona e allo zoom visualizzati. Il caricamento non
dipende da un servizio WMS esterno né da richieste verso GEBCO durante la visita.

- Dataset globale: **GEBCO 2025**, derivato generalizzato a **6 minuti d'arco**
  distribuito da GMT, con filtro gaussiano di larghezza completa **31,5 km**.
- Intervalli delle curve: 200, 500, 1.000, 2.000, 3.000, 4.000, 5.000, 6.000,
  7.000, 8.000, 9.000 e 10.000 metri. Le curve costiere compaiono da zoom 5.
- Tessere: zoom 0–5; MapLibre le usa anche ingrandendo ulteriormente. Ingrandire
  non introduce nuova precisione nel dataset.
- Il Mediterraneo usa questo livello globale solo a zoom inferiori a 4. Da
  zoom 4 rimane il dataset EMODnet già implementato, senza cambiare quei file.
- La tessellazione Web Mercator rappresenta le latitudini fino a circa ±85,05°;
  le calotte polari oltre questo limite non contengono queste curve.

L'attribuzione, le versioni e le statistiche dell'importazione sono salvate in
`frontend/public/bathymetry/global-manifest.json`. Le tessere si trovano sotto
`frontend/public/bathymetry/global-tiles/`. Il codice di integrazione MapLibre è
`frontend/lib/global-bathymetry.ts`.

## Fonti e licenza

- [Dataset GMT e descrizione della generalizzazione](https://www.generic-mapping-tools.org/remote-datasets/earth-gebco.html).
- [GEBCO 2025, metodi, riferimenti e limiti](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2025-grid).
- [DOI GEBCO 2025](https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29).
- [Condizioni GEBCO](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use).

GEBCO pone la griglia nel pubblico dominio e consente adattamento, distribuzione
e impiego commerciale, richiedendo l'indicazione della fonte. Le curve del sito
sono un prodotto derivato e non indicano approvazione o certificazione da GEBCO,
IHO o IOC. **Non utilizzabile per la navigazione o la sicurezza in mare.**

Il prodotto contiene fondali misurati e stimati/interpolati con qualità e
copertura variabili. Questo livello generalizzato descrive la morfologia degli
oceani; non rappresenta scandagli, ostacoli o profondità operative nei porti.

La versione globale scelta per questa demo è GEBCO 2025, disponibile come
derivato compatto verificabile sul server GMT. Non viene presentata come GEBCO
2026, pur essendo quest'ultima una versione pubblicata più recente.

## Rigenerazione

```sh
python3 -m venv /tmp/ais-bathymetry-import
/tmp/ais-bathymetry-import/bin/pip install numpy netCDF4 contourpy shapely mapbox-vector-tile
/tmp/ais-bathymetry-import/bin/python3 scripts/import-global-bathymetry.py
```

Lo script scarica circa 7,4 MB di griglia (riutilizzando il file se esiste),
ricava curve da valori di elevazione negativi e le ritaglia sui limiti delle
tessere. Scrive tutte le tessere degli zoom 0–5, comprese quelle vuote, per non
produrre errori 404 durante lo spostamento sulla mappa. Gli zoom e la
semplificazione delle linee incidono sulla resa grafica, non sull'origine dei
dati. Il download grezzo resta nella cache temporanea e non entra nel sito.

Per integrare il livello dopo `style.load`:

```ts
addGlobalBathymetry(map, {
  beforeId: baseLabelLayer,
  visible: bathymetryEnabled,
});
// Stesso interruttore del livello mediterraneo:
setGlobalBathymetryVisibility(map, bathymetryEnabled);
// Rimozione prima di eliminare/ripristinare uno stile:
removeGlobalBathymetry(map);
```
