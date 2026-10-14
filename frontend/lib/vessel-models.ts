import type { ShipType } from "../../shared/types";

export type VesselModelProfile = {
  mmsi: string;
  name?: string;
  ship_type: ShipType;
  length: number | null;
  width: number | null;
};
export const MODEL_SPECS: Record<
  ShipType,
  { length: number; beam: number; reference: string | null }
> = {
  cargo: { length: 180, beam: 0.2, reference: "/vessel-types/cargo.jpg" },
  tanker: { length: 170, beam: 0.19, reference: "/vessel-types/tanker.jpg" },
  passenger: {
    length: 140,
    beam: 0.23,
    reference: "/vessel-types/passenger.jpg",
  },
  fishing: { length: 30, beam: 0.3, reference: "/vessel-types/fishing.jpg" },
  tug: { length: 24, beam: 0.36, reference: "/vessel-types/tug.jpg" },
  pleasure: { length: 32, beam: 0.25, reference: "/vessel-types/pleasure.jpg" },
  military: {
    length: 130,
    beam: 0.15,
    reference: "/vessel-types/military.jpg",
  },
  other: { length: 40, beam: 0.25, reference: null },
};
export type Vec3 = [number, number, number];
export type VesselMesh = { vertices: Float32Array; count: number };
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function unit(a: Vec3): Vec3 {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** Low-poly solids, modelled from the user's category illustrations. No textures. */
export function createVesselMesh(type: ShipType): VesselMesh {
  const data: number[] = [],
    beam = MODEL_SPECS[type].beam;
  function triangle(a: Vec3, b: Vec3, c: Vec3, shade: number) {
    const normal = unit(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) data.push(...p, ...normal, shade);
  }
  function solid(rings: Vec3[][], shade = 1) {
    for (let j = 0; j < rings.length - 1; j++)
      for (let i = 0; i < rings[j].length; i++) {
        const next = (i + 1) % rings[j].length,
          a = rings[j][i],
          b = rings[j][next],
          c = rings[j + 1][next],
          d = rings[j + 1][i];
        triangle(a, b, c, shade);
        triangle(a, c, d, shade);
      }
    for (const [ring, reverse] of [
      [rings[0], true],
      [rings.at(-1)!, false],
    ] as const) {
      const center = ring.reduce<Vec3>(
        (a, p) => [
          a[0] + p[0] / ring.length,
          a[1] + p[1] / ring.length,
          a[2] + p[2] / ring.length,
        ],
        [0, 0, 0],
      );
      for (let i = 0; i < ring.length; i++)
        reverse
          ? triangle(center, ring[(i + 1) % ring.length], ring[i], shade)
          : triangle(center, ring[i], ring[(i + 1) % ring.length], shade);
    }
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    l: number,
    h: number,
    shade = 1,
    taper = 1,
  ) {
    const ring = (width: number, length: number, height: number): Vec3[] => [
      [-width / 2 + x, -length / 2 + y, height],
      [width / 2 + x, -length / 2 + y, height],
      [width / 2 + x, length / 2 + y, height],
      [-width / 2 + x, length / 2 + y, height],
    ];
    solid([ring(w, l, z), ring(w * taper, l * taper, z + h)], shade);
  }
  function rod(a: Vec3, b: Vec3, r: number, shade = 1, sides = 6) {
    const axis = unit(sub(b, a)),
      right = unit(
        cross(axis, Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]),
      ),
      up = cross(axis, right);
    const ring = (p: Vec3) =>
      Array.from({ length: sides }, (_, i): Vec3 => {
        const angle = (i / sides) * Math.PI * 2;
        return [0, 1, 2].map(
          (k) =>
            p[k] + r * (Math.cos(angle) * right[k] + Math.sin(angle) * up[k]),
        ) as Vec3;
      });
    solid([ring(a), ring(b)], shade);
  }
  const outline: [number, number][] = [
    [-0.5, -0.45],
    [0.5, -0.45],
    [0.5, 0.25],
    [0.34, 0.4],
    [0, 0.5],
    [-0.34, 0.4],
    [-0.5, 0.25],
  ];
  const hull = (width: number, z: number, yscale = 1) =>
    outline.map(([x, y]): Vec3 => [x * beam * width, y * yscale, z]);
  solid([hull(0.68, 0.006, 0.94), hull(0.94, 0.04), hull(1, 0.085)], 0.9);
  function bridge(y: number, height = 0.11, width = 0.88, length = 0.13) {
    box(0, y, 0.085, beam * width, length, height, 1.15, 0.86);
    box(
      0,
      y + length * 0.45,
      0.085 + height * 0.72,
      beam * width * 0.84,
      0.006,
      0.021,
      0.25,
    );
    rod([0, y, 0.085 + height], [0, y, 0.085 + height + 0.08], 0.004, 0.65);
    rod(
      [-beam * 0.3, y, 0.085 + height + 0.04],
      [beam * 0.3, y, 0.085 + height + 0.04],
      0.003,
      0.65,
    );
  }
  switch (type) {
    case "cargo":
      bridge(-0.33, 0.14);
      box(beam * 0.25, -0.38, 0.22, 0.026, 0.035, 0.055, 0.65);
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 3; col++) {
          const height = 0.065 + ((row + col) % 3) * 0.023;
          box(
            (col - 1) * beam * 0.3,
            -0.16 + row * 0.104,
            0.085,
            beam * 0.275,
            0.094,
            height,
            0.8 + ((row + col) % 3) * 0.18,
          );
          box(
            (col - 1) * beam * 0.3,
            -0.16 + row * 0.104,
            0.085 + height / 2,
            beam * 0.278,
            0.095,
            0.003,
            0.65,
          );
        }
      rod([0, 0.39, 0.085], [0, 0.39, 0.2], 0.003, 0.8);
      break;
    case "tanker":
      bridge(-0.33, 0.13);
      for (let i = 0; i < 5; i++) {
        box(0, -0.13 + i * 0.1, 0.085, beam * 0.84, 0.079, 0.024, 0.95);
        rod(
          [-0.045, -0.14 + i * 0.1, 0.13],
          [0.045, -0.14 + i * 0.1, 0.13],
          0.006,
          0.7,
        );
      }
      for (const x of [-0.032, 0.032])
        rod([x, -0.23, 0.127], [x, 0.33, 0.127], 0.005, 1.25);
      rod([0, 0.38, 0.085], [0, 0.38, 0.22], 0.003, 0.75);
      box(0.04, -0.34, 0.215, 0.02, 0.025, 0.055, 0.55);
      break;
    case "passenger":
      for (let deck = 0; deck < 4; deck++) {
        const z = 0.085 + deck * 0.035,
          w = beam * (0.94 - deck * 0.11),
          l = 0.72 - deck * 0.08;
        box(0, 0.01, z, w, l, 0.035, 1.02 + deck * 0.07, 0.94);
        for (const x of [-w / 2, w / 2])
          for (let y = -0.27; y < 0.29; y += 0.057)
            box(x, y, z + 0.012, 0.003, 0.025, 0.013, 0.25);
      }
      box(0, -0.2, 0.225, 0.042, 0.052, 0.06, 0.6, 0.8);
      for (const x of [-beam * 0.44, beam * 0.44])
        for (let y = -0.2; y < 0.16; y += 0.11)
          box(x, y, 0.13, 0.022, 0.07, 0.015, 1.35, 0.7);
      rod([0, 0.18, 0.225], [0, 0.18, 0.32], 0.004, 0.7);
      break;
    case "fishing":
      bridge(0.16, 0.13, 0.83, 0.21);
      for (const y of [-0.3, -0.08]) {
        for (const x of [-beam * 0.44, beam * 0.44])
          rod([x, y, 0.085], [x, y, 0.29], 0.006, 0.85);
        rod([-beam * 0.44, y, 0.29], [beam * 0.44, y, 0.29], 0.006, 0.85);
      }
      rod([0, 0.16, 0.215], [0, 0.16, 0.38], 0.005, 0.7);
      rod([-0.07, -0.23, 0.11], [0.07, -0.23, 0.11], 0.034, 0.6, 8);
      box(0, -0.03, 0.085, 0.09, 0.095, 0.037, 0.8);
      break;
    case "tug":
      bridge(0.12, 0.15, 0.82, 0.28);
      box(0, 0.12, 0.235, beam * 0.87, 0.24, 0.027, 0.85, 0.85);
      for (const x of [-beam * 0.49, beam * 0.49])
        for (const y of [-0.29, -0.1, 0.1, 0.29])
          rod([x, y, 0.04], [x, y, 0.095], 0.026, 0.28, 8);
      rod([-beam * 0.45, 0.3, 0.085], [beam * 0.45, 0.3, 0.085], 0.029, 0.3, 8);
      rod([-0.06, -0.25, 0.12], [0.06, -0.25, 0.12], 0.035, 0.55, 8);
      box(-0.07, -0.02, 0.2, 0.027, 0.045, 0.08, 0.45);
      break;
    case "pleasure":
      box(0, -0.03, 0.085, beam * 0.84, 0.58, 0.075, 1.08, 0.86);
      box(0, 0.005, 0.16, beam * 0.67, 0.4, 0.06, 1.18, 0.76);
      box(0, 0.04, 0.22, beam * 0.56, 0.24, 0.032, 1.3, 0.86);
      box(0, 0.196, 0.177, beam * 0.58, 0.008, 0.025, 0.25);
      for (const x of [-beam * 0.335, beam * 0.335])
        box(x, -0.01, 0.175, 0.004, 0.25, 0.024, 0.25);
      rod([0, -0.045, 0.25], [0, -0.045, 0.33], 0.004, 0.75);
      for (const x of [-0.048, 0.048])
        rod([x, -0.095, 0.26], [x, -0.095, 0.29], 0.02, 1.35, 8);
      break;
    case "military":
      box(0, -0.05, 0.085, beam * 0.8, 0.5, 0.085, 1.05, 0.8);
      bridge(0.08, 0.1, 0.74, 0.21);
      box(0, 0.27, 0.085, 0.068, 0.073, 0.045, 0.85, 0.72);
      rod([0, 0.29, 0.126], [0, 0.39, 0.15], 0.008, 0.7);
      box(0, -0.13, 0.17, 0.037, 0.06, 0.063, 0.6, 0.76);
      box(0, -0.02, 0.17, 0.044, 0.053, 0.18, 1.08, 0.42);
      box(0, -0.02, 0.345, 0.071, 0.015, 0.021, 0.7);
      for (const z of [0.235, 0.29])
        rod([-0.04, -0.02, z], [0.04, -0.02, z], 0.003, 0.65);
      for (const x of [-0.04, 0.04])
        rod([x, 0.06, 0.19], [x, 0.06, 0.22], 0.017, 1.3, 8);
      box(0, -0.32, 0.086, beam * 0.8, 0.17, 0.003, 1.15);
      break;
    default:
      bridge(-0.1, 0.12, 0.75, 0.2);
      box(0, 0.18, 0.085, beam * 0.76, 0.3, 0.012, 0.82);
  }
  return { vertices: new Float32Array(data), count: data.length / 7 };
}
