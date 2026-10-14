import {
  MercatorCoordinate,
  type Map as VesselMap,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type CustomLayerProjectionData,
} from "maplibre-gl";
import type {
  LiveMapVessel,
  ShipType,
  VesselPosition,
} from "../../shared/types";
import { VESSEL_COLORS } from "./vessel-colors";
import { LIVE_TTL_MS } from "../../shared/config";
import {
  createVesselMesh,
  MODEL_SPECS,
  cross,
  unit,
  type VesselModelProfile,
  type Vec3,
} from "./vessel-models";

type ModelVessel = Pick<
  LiveMapVessel,
  "mmsi" | "name" | "ship_type" | "lat" | "lon" | "course" | "timestamp"
> & { heading?: number | null; priority?: boolean };
type Drawn = {
  vessel: ModelVessel;
  center: { x: number; y: number };
  radius: number;
};
type GPUModel = {
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  count: number;
  cell: number;
};
type Program = {
  value: WebGLProgram;
  locations: globalThis.Map<string, WebGLUniformLocation | null>;
};
const ID = "vessel-models-3d",
  BADGE_ID = "vessel-model-sanction-badges",
  MIN_ZOOM = 13,
  CELL = 128,
  ATLAS_W = CELL * 4,
  ATLAS_H = CELL * 2;
const TYPES = Object.keys(MODEL_SPECS) as ShipType[];
const LIGHT: Vec3 = unit([-0.45, -0.65, 1]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const right = unit(cross([0, 0, 1], LIGHT)),
  up = cross(LIGHT, right),
  center: Vec3 = [0, 0, 0.16];
const LIGHT_MATRIX = new Float32Array([
  right[0] / 0.7,
  up[0] / 0.7,
  -LIGHT[0] / 0.8,
  0,
  right[1] / 0.7,
  up[1] / 0.7,
  -LIGHT[1] / 0.8,
  0,
  right[2] / 0.7,
  up[2] / 0.7,
  -LIGHT[2] / 0.8,
  0,
  -dot(right, center) / 0.7,
  -dot(up, center) / 0.7,
  dot(LIGHT, center) / 0.8,
  1,
]);
const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
uniform mat4 u_light;
void main(){gl_Position=u_light*vec4(a_position,1.0);}`;
const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
void main(){}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal;
in float v_shade;
in vec4 v_shadow;
uniform vec3 u_color;
uniform sampler2D u_shadow;
uniform vec4 u_cell;
uniform float u_has_shadow;
uniform vec3 u_view;
uniform float u_opacity;
out vec4 fragColor;
void main(){
  vec3 p=v_shadow.xyz/v_shadow.w*.5+.5;
  float visibility=1.0;
  if(u_has_shadow>.5 && p.x>0.0 && p.x<1.0 && p.y>0.0 && p.y<1.0){
    float hits=0.0;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
      vec2 uv=u_cell.xy+clamp(p.xy+vec2(float(x),float(y))/128.0,vec2(.004),vec2(.996))*u_cell.zw;
      hits += p.z-.003 > texture(u_shadow,uv).r ? 1.0 : 0.0;
    }
    visibility=1.0-hits/9.0*.65;
  }
  float diffuse=max(dot(normalize(v_normal),normalize(vec3(-.45,-.65,1.0))),0.0);
  float lighting=.48+.52*diffuse*visibility;
  vec3 n=normalize(v_normal),view=normalize(u_view);
  vec3 halfway=normalize(normalize(vec3(-.45,-.65,1.0))+view);
  float gloss=pow(max(dot(n,halfway),0.0),18.0)*.18*visibility;
  float frost=pow(1.0-max(dot(n,view),0.0),4.0)*.16;
  vec3 color=u_color*v_shade*lighting;
  color=mix(color,vec3(.90),frost)+vec3(gloss);
  color += vec3(.12)*max(v_shade-1.0,0.0);
  float alpha=u_opacity;
  fragColor=vec4(clamp(color,0.0,1.0)*alpha,alpha);
}`;

function compile(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): Program {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error("3D program unavailable");
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("3D shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "3D shader failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "3D program failed");
    return { value: program, locations: new globalThis.Map() };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}
function location(gl: WebGL2RenderingContext, p: Program, key: string) {
  if (!p.locations.has(key))
    p.locations.set(key, gl.getUniformLocation(p.value, key));
  return p.locations.get(key)!;
}
function projectionUniforms(
  gl: WebGL2RenderingContext,
  p: Program,
  data: CustomLayerProjectionData,
) {
  gl.uniformMatrix4fv(
    location(gl, p, "u_projection_matrix"),
    false,
    new Float32Array(data.mainMatrix),
  );
  gl.uniformMatrix4fv(
    location(gl, p, "u_projection_fallback_matrix"),
    false,
    new Float32Array(data.fallbackMatrix),
  );
  gl.uniform4f(
    location(gl, p, "u_projection_tile_mercator_coords"),
    ...data.tileMercatorCoords,
  );
  gl.uniform4f(
    location(gl, p, "u_projection_clipping_plane"),
    ...data.clippingPlane,
  );
  gl.uniform1f(
    location(gl, p, "u_projection_transition"),
    data.projectionTransition,
  );
}

/** One shared map context, eight meshes and a single 256 KiB depth shadow atlas. */
export function createVesselModelLayer(
  map: VesselMap,
  onSelect: (mmsi: string) => void,
  onHover: (v: ModelVessel | null) => void,
) {
  let input: ModelVessel[] = [],
    profiles: VesselModelProfile[] = [],
    mobile = false,
    enabled = true,
    shadows = true,
    failed = false;
  let gl: WebGL2RenderingContext | null = null,
    depth: WebGLTexture | null = null,
    framebuffer: WebGLFramebuffer | null = null,
    shadowProgram: Program | null = null,
    shadowReady = false;
  const programs = new globalThis.Map<string, Program>(),
    models = new globalThis.Map<ShipType, GPUModel>();
  let drawn: Drawn[] = [],
    shownKey = "",
    hovered: string | null = null;
  const pointOpacity = map.getLayer("vessel-points")
    ? (map.getPaintProperty("vessel-points", "circle-opacity") ?? 1)
    : 1;
  const strokeOpacity = map.getLayer("vessel-points")
    ? (map.getPaintProperty("vessel-points", "circle-stroke-opacity") ?? 1)
    : 1;
  function publish(ids: string[]) {
    if (hovered && !ids.includes(hovered)) {
      hovered = null;
      onHover(null);
    }
    for (const marker of map
      .getContainer()
      .querySelectorAll<HTMLElement>(".track-position-marker")) {
      marker.dataset.modelVisible = String(
        ids.includes(marker.dataset.mmsi ?? ""),
      );
    }
    const key = ids.slice().sort().join(",");
    if (key === shownKey) return;
    shownKey = key;
    if (map.getLayer(BADGE_ID))
      map.setFilter(BADGE_ID, [
        "all",
        ["!", ["has", "point_count"]],
        ["==", ["get", "color"], "#ef4444"],
        ["in", ["get", "mmsi"], ["literal", ids]],
      ]);
    if (map.getLayer("vessel-points")) {
      const opacity = (base: any): any => [
        "case",
        ["in", ["get", "mmsi"], ["literal", ids]],
        0,
        base,
      ];
      map.setPaintProperty(
        "vessel-points",
        "circle-opacity",
        opacity(pointOpacity),
      );
      map.setPaintProperty(
        "vessel-points",
        "circle-stroke-opacity",
        opacity(strokeOpacity),
      );
    }
  }
  function release() {
    if (gl) {
      for (const m of models.values()) {
        gl.deleteVertexArray(m.vao);
        gl.deleteBuffer(m.buffer);
      }
      for (const p of programs.values()) gl.deleteProgram(p.value);
      if (shadowProgram) gl.deleteProgram(shadowProgram.value);
      gl.deleteTexture(depth);
      gl.deleteFramebuffer(framebuffer);
    }
    models.clear();
    programs.clear();
    depth = null;
    framebuffer = null;
    shadowProgram = null;
    shadowReady = false;
    drawn = [];
    gl = null;
  }
  function fail() {
    failed = true;
    drawn = [];
    publish([]);
  }
  function init(context: WebGL2RenderingContext) {
    gl = context;
    failed = false;
    try {
      for (const [cell, type] of TYPES.entries()) {
        const mesh = createVesselMesh(type),
          buffer = gl.createBuffer(),
          vao = gl.createVertexArray();
        if (!buffer || !vao) {
          gl.deleteBuffer(buffer);
          gl.deleteVertexArray(vao);
          throw new Error("3D buffer unavailable");
        }
        models.set(type, { buffer, vao, count: mesh.count, cell });
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        for (const [attribute, size, offset] of [
          [0, 3, 0],
          [1, 3, 12],
          [2, 1, 24],
        ]) {
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
        }
      }
      // Shadow resources are optional: flat lighting still works if allocation fails.
      depth = gl.createTexture();
      framebuffer = gl.createFramebuffer();
      if (depth && framebuffer) {
        gl.bindTexture(gl.TEXTURE_2D, depth);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.DEPTH_COMPONENT16,
          ATLAS_W,
          ATLAS_H,
          0,
          gl.DEPTH_COMPONENT,
          gl.UNSIGNED_SHORT,
          null,
        );
        for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
          gl.texParameteri(gl.TEXTURE_2D, param, gl.NEAREST);
        for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
          gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.TEXTURE_2D,
          depth,
          0,
        );
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
        )
          shadowProgram = compile(gl, SHADOW_VERTEX, SHADOW_FRAGMENT);
      }
    } catch {
      release();
      fail();
    } finally {
      context.bindFramebuffer(context.FRAMEBUFFER, null);
      context.bindVertexArray(null);
      context.bindBuffer(context.ARRAY_BUFFER, null);
    }
  }
  function shader(args: CustomRenderMethodInput) {
    const variant = args.shaderData.variantName;
    let p = programs.get(variant);
    if (!p) {
      p = compile(
        gl!,
        `#version 300 es
      ${args.shaderData.vertexShaderPrelude}
      ${args.shaderData.define}
      precision highp float;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec3 a_normal;
      layout(location=2) in float a_shade;
      uniform vec2 u_origin;
      uniform vec3 u_scale;
      uniform float u_angle;
      uniform mat4 u_light;
      out vec3 v_normal;
      out float v_shade;
      out vec4 v_shadow;
      void main(){
        vec2 p=a_position.xy*u_scale.xy;
        float s=sin(u_angle),c=cos(u_angle);
        vec2 rotated=vec2(p.x*c+p.y*s,p.x*s-p.y*c);
        gl_Position=projectTileFor3D(u_origin+rotated,a_position.z*u_scale.z);
        v_normal=a_normal;v_shade=a_shade;v_shadow=u_light*vec4(a_position,1.0);
      }`,
        FRAGMENT,
      );
      programs.set(variant, p);
    }
    return p;
  }
  const layer: CustomLayerInterface = {
    id: ID,
    type: "custom",
    renderingMode: "3d",
    onAdd: (_map, context) => init(context),
    prerender(context) {
      if (
        failed ||
        !enabled ||
        !shadows ||
        shadowReady ||
        !shadowProgram ||
        !framebuffer ||
        map.getZoom() < MIN_ZOOM
      )
        return;
      const previous = context.getParameter(context.FRAMEBUFFER_BINDING),
        viewport = context.getParameter(context.VIEWPORT),
        colorMask = context.getParameter(context.COLOR_WRITEMASK);
      try {
        context.bindFramebuffer(context.FRAMEBUFFER, framebuffer);
        context.disable(context.SCISSOR_TEST);
        context.disable(context.STENCIL_TEST);
        context.disable(context.BLEND);
        context.disable(context.CULL_FACE);
        context.enable(context.DEPTH_TEST);
        context.depthFunc(context.LESS);
        context.depthMask(true);
        context.colorMask(false, false, false, false);
        context.clearDepth(1);
        context.clear(context.DEPTH_BUFFER_BIT);
        context.useProgram(shadowProgram.value);
        context.uniformMatrix4fv(
          location(context, shadowProgram, "u_light"),
          false,
          LIGHT_MATRIX,
        );
        for (const m of models.values()) {
          context.viewport(
            (m.cell % 4) * CELL,
            Math.floor(m.cell / 4) * CELL,
            CELL,
            CELL,
          );
          context.bindVertexArray(m.vao);
          context.drawArrays(context.TRIANGLES, 0, m.count);
        }
        shadowReady = true;
      } finally {
        context.bindFramebuffer(context.FRAMEBUFFER, previous);
        context.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        context.colorMask(
          colorMask[0],
          colorMask[1],
          colorMask[2],
          colorMask[3],
        );
        context.bindVertexArray(null);
      }
    },
    render(context, args) {
      drawn = [];
      if (failed || !enabled || map.getZoom() < MIN_ZOOM) {
        publish([]);
        return;
      }
      try {
        if (!gl) init(context);
        if (failed) return;
        const p = shader(args);
        context.useProgram(p.value);
        context.disable(context.CULL_FACE);
        context.disable(context.STENCIL_TEST);
        context.enable(context.BLEND);
        context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA);
        context.enable(context.DEPTH_TEST);
        context.depthFunc(context.LEQUAL);
        context.depthMask(true);
        context.uniformMatrix4fv(
          location(context, p, "u_light"),
          false,
          LIGHT_MATRIX,
        );
        context.uniform1f(
          location(context, p, "u_has_shadow"),
          shadows && shadowReady ? 1 : 0,
        );
        context.activeTexture(context.TEXTURE0);
        context.bindTexture(context.TEXTURE_2D, depth);
        context.uniform1i(location(context, p, "u_shadow"), 0);
        const w = map.getCanvas().clientWidth,
          h = map.getCanvas().clientHeight;
        const bounds = map.getBounds();
        const candidates = input
          .filter((v) => bounds.contains([v.lon, v.lat]))
          .map((v) => ({ v, p: map.project([v.lon, v.lat]) }))
          .filter(
            ({ p }) => p.x > -90 && p.x < w + 90 && p.y > -90 && p.y < h + 90,
          );
        candidates.sort(
          (a, b) =>
            Number(!!b.v.priority) - Number(!!a.v.priority) ||
            Math.hypot(a.p.x - w / 2, a.p.y - h / 2) -
              Math.hypot(b.p.x - w / 2, b.p.y - h / 2),
        );
        const visible = candidates.slice(0, mobile ? 32 : 96);
        const referenceLength = Math.max(
          180,
          ...visible.map(({ v }) => {
            const l = profiles.find((p) => p.mmsi === v.mmsi)?.length;
            return l && l > 0 && l <= 500
              ? l
              : (MODEL_SPECS[v.ship_type]?.length ?? 40);
          }),
        );
        for (const { v, p: screen } of visible) {
          const type = MODEL_SPECS[v.ship_type] ? v.ship_type : "other",
            spec = MODEL_SPECS[type],
            m = models.get(type)!;
          const profile = profiles.find((p) => p.mmsi === v.mmsi),
            realLength =
              profile?.length && profile.length > 0 && profile.length <= 500
                ? profile.length
                : spec.length;
          const beam =
            profile?.width && profile.width > 0
              ? Math.min(0.6, Math.max(0.08, profile.width / realLength))
              : spec.beam;
          const metersPerPixel =
            (40075016.686 * Math.cos((v.lat * Math.PI) / 180)) /
            (512 * 2 ** map.getZoom());
          const displayScale = Math.min(
            1,
            ((mobile ? 112 : 144) * metersPerPixel) / referenceLength,
          );
          const length = realLength * displayScale;
          if (length / metersPerPixel < 7) continue;
          const merc = MercatorCoordinate.fromLngLat([v.lon, v.lat]);
          const tiles = 2 ** 16,
            x = Math.floor(merc.x * tiles),
            y = Math.floor(merc.y * tiles),
            scale = merc.meterInMercatorCoordinateUnits() * tiles * 8192;
          const projection = args.getProjectionData({
            tileID: { canonical: { x, y, z: 16 } },
            applyGlobeMatrix: true,
          });
          projectionUniforms(context, p, projection);
          context.uniform2f(
            location(context, p, "u_origin"),
            (merc.x * tiles - x) * 8192,
            (merc.y * tiles - y) * 8192,
          );
          context.uniform3f(
            location(context, p, "u_scale"),
            (length * scale * beam) / spec.beam,
            length * scale,
            length,
          );
          context.uniform1f(
            location(context, p, "u_angle"),
            ((v.heading ?? v.course ?? 0) * Math.PI) / 180,
          );
          const viewAngle =
              (((v.heading ?? v.course ?? 0) - map.getBearing()) * Math.PI) /
              180,
            pitch = (map.getPitch() * Math.PI) / 180;
          context.uniform3f(
            location(context, p, "u_view"),
            Math.sin(viewAngle) * Math.sin(pitch),
            -Math.cos(viewAngle) * Math.sin(pitch),
            Math.cos(pitch),
          );
          context.uniform1f(
            location(context, p, "u_opacity"),
            Date.now() - Date.parse(v.timestamp) > LIVE_TTL_MS ? 0.6 : 0.95,
          );
          const hex = VESSEL_COLORS[type];
          context.uniform3f(
            location(context, p, "u_color"),
            parseInt(hex.slice(1, 3), 16) / 255,
            parseInt(hex.slice(3, 5), 16) / 255,
            parseInt(hex.slice(5, 7), 16) / 255,
          );
          context.uniform4f(
            location(context, p, "u_cell"),
            ((m.cell % 4) * CELL) / ATLAS_W,
            (Math.floor(m.cell / 4) * CELL) / ATLAS_H,
            CELL / ATLAS_W,
            CELL / ATLAS_H,
          );
          context.bindVertexArray(m.vao);
          context.drawArrays(context.TRIANGLES, 0, m.count);
          drawn.push({
            vessel: v,
            center: screen,
            radius: Math.min(
              60,
              Math.max(18, (length / metersPerPixel) * 0.52),
            ),
          });
        }
        publish(drawn.map((d) => d.vessel.mmsi));
      } catch {
        fail();
      } finally {
        context.bindVertexArray(null);
        context.activeTexture(context.TEXTURE0);
      }
    },
    onRemove: () => {
      release();
      publish([]);
    },
  };
  const pick = (point: { x: number; y: number }) => {
    let nearest: Drawn | undefined,
      distance = Infinity;
    for (const d of drawn) {
      const candidate = Math.hypot(point.x - d.center.x, point.y - d.center.y);
      if (candidate <= d.radius && candidate < distance) {
        nearest = d;
        distance = candidate;
      }
    }
    return nearest?.vessel ?? null;
  };
  const handleClick = (event: { point: { x: number; y: number } }) => {
    const v = pick(event.point);
    if (v) onSelect(v.mmsi);
  };
  const handleHover = (event: { point: { x: number; y: number } }) => {
    const v = pick(event.point);
    if ((v?.mmsi ?? null) !== hovered) {
      hovered = v?.mmsi ?? null;
      onHover(v);
    }
  };
  const leave = () => {
    hovered = null;
    onHover(null);
  };
  const lost = () => {
    gl = null;
    models.clear();
    programs.clear();
    shadowProgram = null;
    framebuffer = null;
    depth = null;
    shadowReady = false;
    drawn = [];
    publish([]);
  };
  const restored = () => {
    failed = false;
    map.triggerRepaint();
  };
  map.addLayer(layer);
  // Keep the existing red sanctions indicator alongside category-colored models.
  if (map.getSource("vessels"))
    map.addLayer({
      id: BADGE_ID,
      type: "circle",
      source: "vessels",
      minzoom: MIN_ZOOM,
      filter: ["in", ["get", "mmsi"], ["literal", []]],
      paint: {
        "circle-radius": 4,
        "circle-color": "#ef4444",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
        "circle-translate": [10, -10],
        "circle-translate-anchor": "viewport",
      },
    });
  map.on("click", handleClick);
  map.on("mousemove", handleHover);
  map.on("movestart", leave);
  map.getCanvas().addEventListener("mouseleave", leave);
  map.on("webglcontextlost", lost);
  map.on("webglcontextrestored", restored);
  return {
    visible(mmsi: string) {
      return drawn.some((d) => d.vessel.mmsi === mmsi);
    },
    update(
      vessels: LiveMapVessel[],
      fixes: {
        position: VesselPosition;
        profile?: VesselModelProfile;
        name?: string;
      }[],
      settings: { mobile: boolean; enabled: boolean; shadows: boolean },
    ) {
      mobile = settings.mobile;
      enabled = settings.enabled;
      shadows = settings.shadows;
      profiles = fixes.flatMap((f) => (f.profile ? [f.profile] : []));
      const replace = new Set(fixes.map((f) => f.position.mmsi));
      input = [
        ...fixes.map(({ position, profile, name }): ModelVessel => ({
          ...position,
          name: name ?? position.mmsi,
          ship_type:
            profile?.ship_type ??
            vessels.find((v) => v.mmsi === position.mmsi)?.ship_type ??
            "other",
          priority: true,
        })),
        ...vessels.filter((v) => !replace.has(v.mmsi)),
      ];
      if (!enabled) {
        drawn = [];
        publish([]);
      }
      map.triggerRepaint();
    },
    destroy() {
      map.off("click", handleClick);
      map.off("mousemove", handleHover);
      map.off("movestart", leave);
      map.getCanvas().removeEventListener("mouseleave", leave);
      map.off("webglcontextlost", lost);
      map.off("webglcontextrestored", restored);
      if (map.getLayer(BADGE_ID)) map.removeLayer(BADGE_ID);
      if (map.getLayer(ID)) map.removeLayer(ID);
      else release();
    },
  };
}
