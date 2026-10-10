// EMODnet's generalised contours (CC BY 4.0), styled for the dark map.
// Fixed upstream and bounded XYZ parameters prevent an arbitrary URL proxy.
export const runtime = "nodejs";
export const maxDuration = 15;

function style(zoom: number) {
  const depths =
    zoom < 6
      ? [1000, 2000, 5000, 7000]
      : zoom < 8
        ? [200, 500, 1000, 2000, 5000, 7000]
        : [50, 100, 200, 500, 1000, 2000, 5000, 7000];
  const filter = depths
    .map(
      (depth) =>
        `<ogc:PropertyIsEqualTo><ogc:PropertyName>elevation</ogc:PropertyName><ogc:Literal>${depth}</ogc:Literal></ogc:PropertyIsEqualTo>`,
    )
    .join("");
  return `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>emodnet:contours</Name><UserStyle><FeatureTypeStyle><Rule><ogc:Filter><ogc:Or>${filter}</ogc:Or></ogc:Filter><LineSymbolizer><Stroke><CssParameter name="stroke">#648797</CssParameter><CssParameter name="stroke-width">1</CssParameter><CssParameter name="stroke-opacity">0.7</CssParameter></Stroke></LineSymbolizer><TextSymbolizer><Label><ogc:Function name="Concatenate"><ogc:PropertyName>elevation</ogc:PropertyName><ogc:Literal> m</ogc:Literal></ogc:Function></Label><Font><CssParameter name="font-family">DejaVu Sans</CssParameter><CssParameter name="font-size">11</CssParameter></Font><LabelPlacement><LinePlacement/></LabelPlacement><Halo><Radius>1.5</Radius><Fill><CssParameter name="fill">#2b353b</CssParameter></Fill></Halo><Fill><CssParameter name="fill">#a2bac5</CssParameter></Fill><VendorOption name="followLine">true</VendorOption><VendorOption name="repeat">220</VendorOption><VendorOption name="maxDisplacement">80</VendorOption><VendorOption name="group">yes</VendorOption><VendorOption name="labelAllGroup">true</VendorOption><VendorOption name="spaceAround">20</VendorOption></TextSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const values = ["z", "x", "y"].map((key) => query.get(key) ?? "");
  if (values.some((value) => !/^\d{1,4}$/.test(value)))
    return Response.json({ error: "Invalid tile" }, { status: 400 });
  const [z, x, y] = values.map(Number);
  if (z < 4 || z > 12 || x >= 2 ** z || y >= 2 ** z)
    return Response.json({ error: "Invalid tile" }, { status: 400 });
  const extent = 20037508.342789244;
  const size = (extent * 2) / 2 ** z;
  const west = -extent + x * size,
    north = extent - y * size;
  const queryUpstream = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: "emodnet:contours",
    styles: "",
    format: "image/png",
    transparent: "true",
    width: "512",
    height: "512",
    srs: "EPSG:3857",
    bbox: [west, north - size, west + size, north].join(","),
    SLD_BODY: style(z),
    buffer: "16",
  });
  try {
    const response = await fetch(
      `https://ows.emodnet-bathymetry.eu/wms?${queryUpstream}`,
      {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        next: { revalidate: 86400 },
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      throw new Error("Bathymetry upstream unavailable");
    const png = await response.arrayBuffer();
    const bytes = new Uint8Array(png);
    if (
      bytes.length > 2_000_000 ||
      bytes[0] !== 137 ||
      bytes[1] !== 80 ||
      bytes[2] !== 78 ||
      bytes[3] !== 71
    )
      throw new Error("Invalid bathymetry tile");
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json(
      { error: "Bathymetry unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
