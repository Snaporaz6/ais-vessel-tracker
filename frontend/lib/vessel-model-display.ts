/** Heading is the hull direction. Course is usable only while moving. */
export function vesselHeading(v: {
  heading?: number | null;
  course: number | null;
  speed: number | null;
}): number | null {
  const valid = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 360;
  if (valid(v.heading)) return v.heading;
  if (v.speed !== null && v.speed >= 1 && valid(v.course)) return v.course;
  return null;
}

/** Readable symbols with compressed size differences, not physical footprints. */
export function vesselModelPixels(
  length: number,
  metersPerPixel: number,
  mobile: boolean,
) {
  const reference = Math.min(
    mobile ? 112 : 144,
    Math.max(mobile ? 68 : 84, 180 / metersPerPixel),
  );
  return Math.min(
    mobile ? 112 : 144,
    Math.max(mobile ? 26 : 30, reference * (length / 180) ** 0.55),
  );
}
