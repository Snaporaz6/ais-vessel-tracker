'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LiveMapVessel, ShipType, VesselPosition } from '../../shared/types';

// ─── Costanti ────────────────────────────────────────────────────────────────

/** Colori per tipo nave — esportati per VesselFilter */
export const VESSEL_COLORS: Record<string, string> = {
  cargo: '#22c55e',
  tanker: '#f59e0b',
  passenger: '#3b82f6',
  fishing: '#06b6d4',
  tug: '#8b5cf6',
  pleasure: '#ec4899',
  military: '#6b7280',
  other: '#9ca3af',
};

const BASEMAP_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── GeoJSON builders ────────────────────────────────────────────────────────

/** Converte array di navi in GeoJSON FeatureCollection */
function vesselsToGeoJson(vessels: LiveMapVessel[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vessels.map((v) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      properties: {
        mmsi: v.mmsi,
        name: v.name,
        ship_type: v.ship_type,
        speed: v.speed,
        course: v.course,
        is_sanctioned: v.is_sanctioned,
        has_anomaly: (v.anomaly_flags?.length ?? 0) > 0,
      },
    })),
  };
}

/** Converte array di posizioni in GeoJSON LineString + markers */
function trackToGeoJson(positions: VesselPosition[]): GeoJSON.FeatureCollection {
  if (positions.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: positions.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [positions[0]!.lon, positions[0]!.lat] },
        properties: { marker: 'start' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [positions[positions.length - 1]!.lon, positions[positions.length - 1]!.lat] },
        properties: { marker: 'end' },
      },
    ],
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Calcola i conteggi per tipo nave */
function computeTypeCounts(vessels: LiveMapVessel[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of vessels) {
    counts[v.ship_type] = (counts[v.ship_type] ?? 0) + 1;
  }
  return counts;
}

/** Colore expression per navi (con override sanzione) */
const vesselColorExpr: maplibregl.ExpressionSpecification = [
  'case',
  ['get', 'is_sanctioned'], '#ef4444',
  ['match', ['get', 'ship_type'],
    'cargo', '#22c55e',
    'tanker', '#f59e0b',
    'passenger', '#3b82f6',
    'fishing', '#06b6d4',
    'tug', '#8b5cf6',
    'pleasure', '#ec4899',
    'military', '#6b7280',
    '#9ca3af',
  ],
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface MapComponentProps {
  /** Callback quando si clicca su una nave */
  onVesselClick: (mmsi: string) => void;
  /** MMSI della nave di cui mostrare il track */
  trackMmsi?: string | null;
  /** Tipi nave visibili */
  visibleTypes?: Set<ShipType>;
  /** Callback con conteggio navi per tipo */
  onTypeCounts?: (counts: Record<string, number>) => void;
  /** Se true mostra il globo sferico */
  isGlobe?: boolean;
}

// ─── Componente principale (MapLibre GL imperativo) ──────────────────────────

export default function MapComponent({
  onVesselClick,
  trackMmsi,
  visibleTypes,
  onTypeCounts,
  isGlobe = false,
}: MapComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [vessels, setVessels] = useState<LiveMapVessel[]>([]);
  const [trackPositions, setTrackPositions] = useState<VesselPosition[]>([]);
  const bboxRef = useRef('30,-6,46,36.5');
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs per i callback (evita stale closures)
  const onVesselClickRef = useRef(onVesselClick);
  onVesselClickRef.current = onVesselClick;
  const vesselsRef = useRef(vessels);
  vesselsRef.current = vessels;

  // ── Fetch vessels ──────────────────────────────────────────────────────────

  const fetchVessels = useCallback(async (b: string) => {
    try {
      const res = await fetch(`/api/map/live?bbox=${b}`);
      const data = await res.json() as LiveMapVessel[];
      setVessels(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchVessels(bboxRef.current);
    const interval = setInterval(() => fetchVessels(bboxRef.current), 30_000);
    return () => clearInterval(interval);
  }, [fetchVessels]);

  useEffect(() => {
    if (onTypeCounts) {
      onTypeCounts(computeTypeCounts(vessels));
    }
  }, [vessels, onTypeCounts]);

  // ── Fetch track ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!trackMmsi) {
      setTrackPositions([]);
      return;
    }
    let cancelled = false;
    async function loadTrack() {
      try {
        const res = await fetch(`/api/vessel/${trackMmsi}/track?days=30`);
        const data = await res.json() as VesselPosition[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setTrackPositions(data);
          const map = mapRef.current;
          if (map) {
            const lons = data.map((p) => p.lon);
            const lats = data.map((p) => p.lat);
            map.fitBounds(
              [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
              { padding: 60, duration: 1000 },
            );
          }
        }
      } catch {
        // ignore
      }
    }
    loadTrack();
    return () => { cancelled = true; };
  }, [trackMmsi]);

  // ── Inizializzazione MapLibre GL (una sola volta) ──────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_DARK,
      center: [15, 38],
      zoom: 5.5,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });

    // Aggiungi controlli di navigazione
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');

    map.on('load', () => {
      // ── Source: vessels (clustered) ──
      map.addSource('vessels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Layer: cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'vessels',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#374151', 10, '#1f2937', 50, '#111827'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#6b7280',
          'circle-opacity': 0.9,
        },
      });

      // Layer: cluster count
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'vessels',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: {
          'text-color': '#e5e7eb',
        },
      });

      // Layer: individual vessel dots
      map.addLayer({
        id: 'vessel-points',
        type: 'circle',
        source: 'vessels',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': vesselColorExpr,
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // ── Source: track ──
      map.addSource('track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2.5,
          'line-opacity': 0.8,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      });

      map.addLayer({
        id: 'track-markers',
        type: 'circle',
        source: 'track',
        filter: ['has', 'marker'],
        paint: {
          'circle-color': ['match', ['get', 'marker'], 'start', '#22c55e', 'end', '#f59e0b', '#9ca3af'],
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    });

    // ── Events ──

    // Bounds change → fetch vessels
    map.on('moveend', () => {
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = setTimeout(() => {
        const bounds = map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        bboxRef.current = bbox;
        fetchVessels(bbox);
      }, 300);
    });

    // Click su vessel o cluster
    map.on('click', 'vessel-points', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const mmsi = props?.mmsi as string;
      if (!mmsi) return;

      // Popup
      const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const vessel = vesselsRef.current.find((v) => v.mmsi === mmsi);

      if (popupRef.current) popupRef.current.remove();
      const typeColor = VESSEL_COLORS[props?.ship_type as string] ?? '#9ca3af';
      popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '240px' })
        .setLngLat(coords)
        .setHTML(`
          <div style="font-size:12px;line-height:1.5">
            <strong>${props?.name ?? 'Unknown'}</strong><br/>
            <span style="color:#6b7280">${mmsi}</span> |
            <span style="background:${typeColor};color:#fff;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600">${props?.ship_type ?? 'other'}</span><br/>
            ${props?.speed ?? 0} kn | ${props?.course ?? 0}°
            ${props?.is_sanctioned ? '<div style="color:#ef4444;font-weight:700;margin-top:2px">&#9940; SANZIONATA</div>' : ''}
            ${props?.has_anomaly ? '<div style="color:#f59e0b;font-weight:600;margin-top:2px">&#9888; Anomalia</div>' : ''}
          </div>
        `)
        .addTo(map);

      onVesselClickRef.current(mmsi);
    });

    // Click su cluster → zoom in
    map.on('click', 'clusters', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id as number;
      const source = map.getSource('vessels') as maplibregl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: zoom + 1 });
      });
    });

    // Cursor pointer sui layer interattivi
    map.on('mouseenter', 'vessel-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'vessel-points', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });

    mapRef.current = map;

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [fetchVessels]);

  // ── Aggiorna dati vessels sulla source ──────────────────────────────────────

  const filteredVessels = useMemo(() => {
    if (!visibleTypes) return vessels;
    return vessels.filter((v) => visibleTypes.has(v.ship_type as ShipType));
  }, [vessels, visibleTypes]);

  const vesselsGeoJson = useMemo(() => vesselsToGeoJson(filteredVessels), [filteredVessels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('vessels') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(vesselsGeoJson);
    }
  }, [vesselsGeoJson]);

  // ── Aggiorna dati track sulla source ───────────────────────────────────────

  const trackGeoJson = useMemo(() => trackToGeoJson(trackPositions), [trackPositions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('track') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(trackGeoJson);
    }
  }, [trackGeoJson]);

  // ── Toggle globo / mercator ────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Aspetta che lo stile sia caricato
    const applyProjection = () => {
      map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
    };

    if (map.isStyleLoaded()) {
      applyProjection();
    } else {
      map.once('style.load', applyProjection);
    }
  }, [isGlobe]);

  // ── Contatori per la barra info ────────────────────────────────────────────

  const sanctionedCount = filteredVessels.filter((v) => v.is_sanctioned).length;
  const anomalyCount = filteredVessels.filter((v) => v.anomaly_flags?.length > 0).length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Container MapLibre */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Barra info navi */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 10,
        background: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(4px)',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: '7px 12px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>
          {filteredVessels.length}
        </span>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>
          navi{visibleTypes && visibleTypes.size < 8 ? ' (filtrate)' : ''}
        </span>
        {sanctionedCount > 0 && (
          <>
            <span style={separatorStyle} />
            <span style={{ color: '#ef4444', fontSize: 12 }}>&#9940; {sanctionedCount} sanzionate</span>
          </>
        )}
        {anomalyCount > 0 && (
          <>
            <span style={separatorStyle} />
            <span style={{ color: '#f59e0b', fontSize: 12 }}>&#9888; {anomalyCount} anomalie</span>
          </>
        )}
      </div>
    </div>
  );
}

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 12,
  background: '#374151',
  flexShrink: 0,
};
