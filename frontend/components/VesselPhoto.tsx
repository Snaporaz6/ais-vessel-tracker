"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { VesselPhotoData } from "../lib/vessel-photos";

interface VesselPhotoProps {
  mmsi: string;
  imo: string | null;
  vesselName: string;
  height?: number;
}

export default function VesselPhoto(props: VesselPhotoProps) {
  // AIS can add an IMO after selection. Reset failed/loading state for each identity.
  return <Photo key={`${props.mmsi}:${props.imo ?? ""}`} {...props} />;
}

function Photo({ mmsi, imo, vesselName, height = 180 }: VesselPhotoProps) {
  const [photo, setPhoto] = useState<VesselPhotoData | null>(null);
  const [status, setStatus] = useState<
    "loading" | "image" | "ready" | "missing" | "error"
  >("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPhoto(null);
    setStatus("loading");
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) setStatus("error");
    }, 12000);
    const params = new URLSearchParams({ mmsi });
    if (imo && /^[1-9]\d{6}$/.test(imo)) params.set("imo", imo);
    fetch(`/api/vessel-photo?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Photo unavailable");
        return response.json() as Promise<{ photo: VesselPhotoData | null }>;
      })
      .then(({ photo: result }) => {
        if (!active || controller.signal.aborted) return;
        setPhoto(result);
        setStatus(result ? "image" : "missing");
      })
      .catch(() => {
        if (active) setStatus("error");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [mmsi, imo, attempt]);

  useEffect(() => {
    if (status !== "image") return;
    const timer = setTimeout(() => setStatus("error"), 12000);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <figure className="vessel-photo">
      <div className="vessel-photo-frame" style={{ height }}>
        {photo && (status === "image" || status === "ready") && (
          <Image
            src={photo.url}
            alt={`Fotografia di ${vesselName}`}
            fill
            unoptimized
            loading="lazy"
            sizes="(max-width: 900px) 100vw, 640px"
            style={{
              objectFit: "contain",
              opacity: status === "ready" ? 1 : 0,
            }}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            referrerPolicy="no-referrer"
          />
        )}
        {status !== "ready" && (
          <div className="vessel-photo-state" role="status" aria-live="polite">
            <span>
              {status === "loading" || status === "image"
                ? "Caricamento foto…"
                : status === "missing"
                  ? "Nessuna foto disponibile nelle fonti libere."
                  : "Foto temporaneamente non disponibile."}
            </span>
            {status === "error" && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Riprova foto
              </button>
            )}
          </div>
        )}
      </div>
      {photo && status === "ready" && (
        <figcaption>
          <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
            Foto: {photo.author}
          </a>
          {" · "}
          {photo.licenseUrl ? (
            <a
              href={photo.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {photo.license}
            </a>
          ) : (
            photo.license
          )}
          {" · Wikimedia Commons"}
        </figcaption>
      )}
    </figure>
  );
}
