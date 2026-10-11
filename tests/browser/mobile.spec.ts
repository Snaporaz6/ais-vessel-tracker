import { test, expect, type Page, type Locator } from "@playwright/test";
import type {
  LiveMapResponse,
  VesselDetail,
  VesselPosition,
} from "../../shared/types";

const MMSI = "900000001";
const sheetSelector =
  ".vessel-drawer, .mobile-track-sheet, .marine-feature-panel, .marine-layer-panel, .vessel-filter-panel, .map-status";

/** Local style and responses leave the real MapLibre worker and browser interactions in use. */
async function fixtures(page: Page, options: { port?: boolean } = {}) {
  const timestamp = new Date(Date.now() - 60_000).toISOString();
  const points: VesselPosition[] = Array.from({ length: 12 }, (_, index) => ({
    mmsi: MMSI,
    lat: 38 + (index - 11) * 0.0003,
    lon: 15 + (index - 11) * 0.0003,
    speed: 9,
    course: 90,
    heading: 90,
    nav_status: "underway_engine",
    timestamp: new Date(
      Date.parse(timestamp) - (11 - index) * 60_000,
    ).toISOString(),
    gap_before: index === 6,
  }));
  const detail: VesselDetail = {
    mmsi: MMSI,
    imo: null,
    name: "Aurora — nave dimostrativa",
    ship_type: "cargo",
    flag: "IT",
    length: 120,
    width: 20,
    max_speed: null,
    destination: "ITGOA",
    eta: null,
    updated_at: timestamp,
    last_position: points[11],
    sanctions: [],
    sanctions_check: { status: "unavailable", checked_at: null, sources: [] },
    anomalies: [],
    data_status: "ok",
  };
  const live: LiveMapResponse = {
    vessels: options.port
      ? []
      : [
          {
            mmsi: MMSI,
            name: detail.name,
            ship_type: "cargo",
            lat: 38,
            lon: 15,
            speed: 9,
            course: 90,
            is_sanctioned: false,
            anomaly_flags: [],
            timestamp,
            sanction_status: "unavailable",
          },
        ],
    total_live: options.port ? 0 : 1,
    total_in_bbox: options.port ? 0 : 1,
    truncated: false,
    generated_at: timestamp,
    history_started_at: points[0].timestamp,
    source: {
      connected: false,
      subscribed: false,
      last_message_at: timestamp,
      last_disconnect_at: null,
      status: "demo",
      outages: [],
    },
  };
  await page.route(
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "sea",
              type: "background",
              paint: { "background-color": "#101a29" },
            },
          ],
        },
      }),
  );
  await page.route("**/api/map/live?*", (route) =>
    route.fulfill({ json: live }),
  );
  await page.route("**/api/search?*", (route) =>
    route.fulfill({ json: [detail] }),
  );
  await page.route(`**/api/vessel/${MMSI}`, (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route(`**/api/vessel/${MMSI}/portcalls`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/vessel/${MMSI}/track?*`, (route) =>
    route.fulfill({
      json: points,
      headers: {
        "X-Track-First-At": points[0].timestamp,
        "X-Track-Last-At": points[11].timestamp,
      },
    }),
  );
  await page.route("**/api/vessel-photo?*", (route) =>
    route.fulfill({ json: { photo: null } }),
  );
  const metadata = {
    source: "Fixture locale",
    coverage: "Fixture di verifica",
    status: "ok",
    count: 0,
    activeCount: 0,
    unmappedCount: 0,
    updatedAt: timestamp,
    sources: [],
  };
  await page.route("**/api/maritime-warnings?*", (route) =>
    route.fulfill({
      json: { type: "FeatureCollection", features: [], metadata },
    }),
  );
  await page.route("**/api/map-data?*", (route) => {
    const port =
      options.port &&
      new URL(route.request().url()).searchParams.get("layer") === "ports";
    return route.fulfill({
      json: {
        type: "FeatureCollection",
        metadata: { ...metadata, count: port ? 1 : 0 },
        features: port
          ? [
              {
                type: "Feature",
                id: "fixture-port",
                geometry: { type: "Point", coordinates: [15, 38] },
                properties: {
                  name: "Porto della prova",
                  source: "Fixture locale",
                  kind: "port",
                },
              },
            ]
          : [],
      },
    });
  });
  return points;
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu mappa", exact: true }).click();
  await expect(page.locator(".mobile-map-menu")).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

async function oneSheet(page: Page, panel: Locator) {
  await expect(panel).toBeVisible();
  await expect(
    page.locator(sheetSelector).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(page.locator(".mobile-map-menu")).toBeHidden();
  const viewport = page.viewportSize()!;
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeLessThanOrEqual(viewport.height * 0.46 + 2);
  expect(bounds!.y).toBeGreaterThan(viewport.height * 0.49);
  await noOverflow(page);
}

async function selectVessel(page: Page) {
  await page.getByLabel("Cerca una nave").fill(MMSI);
  await page.getByRole("option", { name: /Aurora.*nave dimostrativa/ }).click();
  await expect(page.locator(".vessel-drawer h1")).toContainText("Aurora");
}

test.beforeEach(async ({ isMobile }, info) => {
  test.skip(
    !isMobile || info.project.name !== "telefono",
    "Le prove mobili usano il browser touch; il desktop ha la suite beta.",
  );
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`mappa libera, menu e pannelli esclusivi a ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await fixtures(page);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Menu mappa", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Cerca una nave")).toBeVisible();
    await expect(page.getByLabel("Lingua", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Stile mappa", { exact: true })).toBeHidden();
    await expect(
      page.getByRole("button", { name: /Livelli mappa/ }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Filtra tipologie navi" }),
    ).toBeHidden();
    await expect(
      page.locator(sheetSelector).filter({ visible: true }),
    ).toHaveCount(0);
    const map = await page.locator("canvas.maplibregl-canvas").boundingBox();
    expect(map).not.toBeNull();
    expect(map!.height).toBeGreaterThanOrEqual(viewport.height * 0.95);
    await noOverflow(page);

    await openMenu(page);
    await page.getByRole("button", { name: /Livelli mappa/ }).click();
    const layers = page.locator(".marine-layer-panel");
    await oneSheet(page, layers);
    await layers.getByLabel("Porti", { exact: true }).check();
    await layers.getByRole("button", { name: "Chiudi livelli" }).click();
    await expect(layers).toBeHidden();

    await openMenu(page);
    await page.getByRole("button", { name: "Filtra tipologie navi" }).click();
    const filters = page.locator(".vessel-filter-panel");
    await oneSheet(page, filters);
    await filters.getByRole("button", { name: "Nessuno", exact: true }).click();
    await expect(
      filters.getByLabel("Cargo", { exact: false }),
    ).not.toBeChecked();
    await filters.getByRole("button", { name: "Tutti", exact: true }).click();
    await expect(filters.getByLabel("Cargo", { exact: false })).toBeChecked();
    await filters.getByRole("button", { name: "Chiudi filtri" }).click();

    await selectVessel(page);
    await oneSheet(page, page.locator(".vessel-drawer"));
    await openMenu(page);
    await expect(
      page.locator(sheetSelector).filter({ visible: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Chiudi menu", exact: true })
      .click();
    await page
      .locator(".mobile-map-dock")
      .getByRole("button", { name: "Nave", exact: true })
      .click();
    await oneSheet(page, page.locator(".vessel-drawer"));
    await page.screenshot({ path: info.outputPath("vessel-sheet.png") });
    await page
      .getByRole("button", { name: "Riduci scheda", exact: true })
      .click();
    await expect(
      page.locator(sheetSelector).filter({ visible: true }),
    ).toHaveCount(0);
    await noOverflow(page);
  });
}

test("timeline mobile: un pannello, riproduzione, intervalli vuoti e attiva/disattiva", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixtures(page);
  await page.goto("/");
  await selectVessel(page);
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  const panel = page.locator(".mobile-track-sheet");
  await expect(panel.locator(".track-timeline")).toBeVisible();
  await oneSheet(page, panel);
  await expect(page.locator(".vessel-drawer")).toBeHidden();
  const range = panel.getByRole("slider", { name: "Data e ora della traccia" });
  await range.focus();
  await range.press("Home");
  await expect(page.locator(".track-position-marker")).toHaveAttribute(
    "data-historic",
    "true",
  );
  await panel.getByRole("button", { name: "Riproduci", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Pausa", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Pausa", exact: true }).click();
  const rangeBounds = await range.boundingBox();
  await range.click({
    position: { x: rangeBounds!.width / 2, y: rangeBounds!.height / 2 },
  });
  await expect(
    panel.getByText("Nessuna posizione ricevuta in questo intervallo.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Centra sulla posizione mostrata" }),
  ).toBeDisabled();
  await expect(page.locator(".track-position-marker")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Ultima posizione", exact: true })
    .click();
  await expect(page.locator(".track-position-marker")).toHaveAttribute(
    "data-historic",
    "false",
  );
  await page.screenshot({ path: info.outputPath("track-sheet.png") });
  await panel.getByLabel("Storico", { exact: true }).selectOption("1");
  await expect(range).toBeVisible();
  await panel
    .getByRole("button", { name: "Riduci traccia", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await page
    .locator(".mobile-map-dock")
    .getByRole("button", { name: "Traccia", exact: true })
    .click();
  await oneSheet(page, panel);
  await expect(panel.getByLabel("Storico", { exact: true })).toHaveValue("1");
  await panel.getByRole("button", { name: "Nave", exact: true }).click();
  await oneSheet(page, page.locator(".vessel-drawer"));
  await page
    .getByRole("button", { name: "Nascondi traccia", exact: true })
    .click();
  await expect(page.locator(".track-position-marker")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mostra traccia", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("track")).toBe(false);
  expect(errors).toEqual([]);
});

test("preferenze nel menu, stato dati accessibile e ritorno alla stessa nave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto("/");
  await openMenu(page);
  await page.getByLabel("Stile mappa", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-map-theme", "light");
  await page.locator("#site-language").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.locator("#site-language").selectOption("it");
  await page.getByRole("button", { name: /^Stato dati/ }).click();
  await oneSheet(page, page.locator(".map-status"));
  await expect(page.locator(".map-status")).toContainText("DEMO");
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-status")).toBeHidden();
  await selectVessel(page);
  await page
    .getByRole("link", { name: "Scheda completa", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vessel/${MMSI}$`));
  await expect(page.locator("html")).toHaveAttribute("data-map-theme", "light");
  await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  await page.getByRole("link", { name: /← Mappa/ }).click();
  await expect(page).toHaveURL(new RegExp(`vessel=${MMSI}`));
  await expect(page.locator(".vessel-drawer h1")).toContainText("Aurora");
  await oneSheet(page, page.locator(".vessel-drawer"));
  await expect(page.locator("html")).toHaveAttribute("data-map-theme", "light");
  await page
    .getByRole("link", { name: "Scheda completa", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vessel/${MMSI}$`));
  await page.goBack();
  await expect(page.locator(".vessel-drawer h1")).toContainText("Aurora");
  await expect(page.locator("html")).toHaveAttribute("data-map-theme", "light");
  await noOverflow(page);
});

test("il dettaglio portuale occupa un solo pannello e si chiude senza coprire la mappa", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, { port: true });
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("button", { name: /Livelli mappa/ }).click();
  await page.getByLabel("Porti", { exact: true }).check();
  await page.getByRole("button", { name: "Chiudi livelli" }).click();
  const canvas = page.locator("canvas.maplibregl-canvas");
  const bounds = await canvas.boundingBox();
  await expect(async () => {
    await canvas.click({
      position: { x: bounds!.width / 2, y: bounds!.height / 2 },
    });
    await expect(page.locator(".marine-feature-panel h2")).toContainText(
      "Porto della prova",
      { timeout: 1000 },
    );
  }).toPass({ timeout: 15_000 });
  await oneSheet(page, page.locator(".marine-feature-panel"));
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator(".marine-feature-panel h2")).toContainText(
    "Porto della prova",
  );
  await expect(
    page.getByRole("button", { name: "Menu mappa", exact: true }),
  ).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await oneSheet(page, page.locator(".marine-feature-panel"));
  await openMenu(page);
  await expect(page.locator(".marine-feature-panel")).toBeHidden();
  await page.getByRole("button", { name: "Filtra tipologie navi" }).click();
  await oneSheet(page, page.locator(".vessel-filter-panel"));
  await page.keyboard.press("Escape");
  await expect(
    page.locator(sheetSelector).filter({ visible: true }),
  ).toHaveCount(0);
});

test("ricerca con tastiera e tocco sulla mappa mantengono accessibili i pannelli", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await fixtures(page);
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Cerca una nave" });
  await search.fill(MMSI);
  await expect(page.getByRole("option", { name: /Aurora/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await oneSheet(page, page.locator(".vessel-drawer"));
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await openMenu(page);
  await page.touchscreen.tap(20, 180);
  await expect(page.locator(".mobile-map-menu")).toBeHidden();
  await page
    .locator(".mobile-map-dock")
    .getByRole("button", { name: "Nave", exact: true })
    .click();
  await oneSheet(page, page.locator(".vessel-drawer"));
  await search.focus();
  await expect(page.locator(".vessel-drawer")).toBeHidden();
  await search.fill(MMSI);
  await expect(page.getByRole("option", { name: /Aurora/ })).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(
    page.locator(sheetSelector).filter({ visible: true }),
  ).toHaveCount(0);
  await noOverflow(page);
});

test("una ricerca in attesa non riapre risultati sul menu e Escape restituisce il focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/search?*", async (route) => {
    await pending;
    await route.fulfill({
      json: [
        {
          mmsi: MMSI,
          name: "Aurora — nave dimostrativa",
          ship_type: "cargo",
          flag: "IT",
        },
      ],
    });
  });
  await page.goto("/");
  const requested = page.waitForRequest((request) =>
    request.url().includes("/api/search?"),
  );
  const search = page.getByRole("combobox", { name: "Cerca una nave" });
  await search.fill(MMSI);
  await requested;
  await openMenu(page);
  const received = page.waitForResponse((response) =>
    response.url().includes("/api/search?"),
  );
  release();
  await received;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mobile-map-menu")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Menu mappa", exact: true }),
  ).toBeFocused();
  await noOverflow(page);
});
