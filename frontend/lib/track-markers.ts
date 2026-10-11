import { Marker, type Map } from "maplibre-gl";
import type { VesselPosition } from "../../shared/types";
import { trackMoment } from "./track-playback";

/** Distinct vessel cursor and a square reference to the latest received fix. */
export function createTrackMarkers(map: Map, onSelect: () => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "track-position-marker";
  const arrow = document.createElement("span");
  arrow.className = "track-position-arrow";
  const label = document.createElement("span");
  label.className = "track-position-label";
  element.append(arrow, label);
  element.addEventListener("click", onSelect);
  const reference = document.createElement("div");
  reference.className = "track-latest-marker";
  const square = document.createElement("span");
  square.className = "track-latest-square";
  const referenceLabel = document.createElement("span");
  referenceLabel.className = "track-position-label";
  reference.append(square, referenceLabel);
  const cursor = new Marker({ element, anchor: "center" });
  const latest = new Marker({ element: reference, anchor: "center" });
  let position: VesselPosition | null = null;
  let cursorAdded = false,
    latestAdded = false;
  const rotate = () => {
    const heading = position?.heading ?? position?.course ?? 0;
    arrow.style.transform = `rotate(${heading - map.getBearing()}deg)`;
  };
  map.on("rotate", rotate);
  return {
    update(
      moment: ReturnType<typeof trackMoment>,
      currentLabel: string,
      historicLabel: string,
    ) {
      position = moment?.position ?? null;
      if (moment && position) {
        element.dataset.historic = String(!moment.live);
        label.textContent = moment.live ? currentLabel : historicLabel;
        element.setAttribute("aria-label", label.textContent);
        element.title = label.textContent;
        cursor.setLngLat([position.lon, position.lat]);
        if (!cursorAdded) {
          cursor.addTo(map);
          cursorAdded = true;
        }
        rotate();
      } else {
        cursor.remove();
        cursorAdded = false;
      }
      if (moment && !moment.live) {
        referenceLabel.textContent = currentLabel;
        latest.setLngLat([moment.latest.lon, moment.latest.lat]);
        if (!latestAdded) {
          latest.addTo(map);
          latestAdded = true;
        }
      } else {
        latest.remove();
        latestAdded = false;
      }
    },
    destroy() {
      map.off("rotate", rotate);
      element.removeEventListener("click", onSelect);
      cursor.remove();
      latest.remove();
    },
  };
}
