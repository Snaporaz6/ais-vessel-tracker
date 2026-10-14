import { test, expect, type Page } from "@playwright/test";
import type {
  VesselDetail,
  VesselPosition,
  LiveMapResponse,
} from "../../shared/types";
const MMSI = "636092919";
async function fixture(page: Page) {
  const at = new Date(Date.now() - 20 * 60000).toISOString();
  const fix: VesselPosition = {
    mmsi: MMSI,
    lat: 44.4047,
    lon: 8.8963,
    speed: 0,
    course: 0.9,
    heading: 172,
    nav_status: "moored",
    timestamp: at,
  };
  const detail: VesselDetail = {
    mmsi: MMSI,
    name: "RDO CONCORD",
    imo: "9401283",
    flag: "",
    ship_type: "cargo",
    length: 304,
    width: 40,
    max_speed: null,
    destination: "ITGOA>ESBCN",
    eta: null,
    updated_at: at,
    last_position: fix,
    sanctions: [],
    sanctions_check: { status: "unavailable", checked_at: null, sources: [] },
    anomalies: [],
    data_status: "ok",
  };
  const state = {
    detail,
    mode: "normal" as "normal" | "empty" | "error",
    trackRequests: 0,
  };
  const live: LiveMapResponse = {
    vessels: [],
    total_live: 0,
    total_in_bbox: 0,
    truncated: false,
    generated_at: new Date().toISOString(),
    history_started_at: at,
    source: {
      connected: true,
      subscribed: true,
      last_message_at: new Date().toISOString(),
      last_disconnect_at: null,
      status: "live",
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
  await page.route("**/api/vessel/" + MMSI, (route) =>
    route.fulfill({ json: state.detail }),
  );
  await page.route("**/api/vessel/" + MMSI + "/portcalls", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/vessel/" + MMSI + "/track?*", (route) => {
    state.trackRequests++;
    if (state.mode === "error")
      return route.fulfill({
        status: 503,
        json: { error: "Archivio temporaneamente non disponibile." },
      });
    const points =
      state.mode === "empty"
        ? []
        : [
            {
              ...fix,
              lat: 44.4037,
              timestamp: new Date(Date.parse(at) - 60000).toISOString(),
            },
            fix,
          ];
    return route.fulfill({
      json: points,
      headers: {
        "X-Track-First-At": points[0]?.timestamp ?? "",
        "X-Track-Last-At": points.at(-1)?.timestamp ?? "",
      },
    });
  });
  return state;
}
async function vesselPanel(page: Page, mobile: boolean) {
  if (mobile)
    await page
      .locator(".mobile-track-sheet")
      .getByRole("button", { name: "Nave", exact: true })
      .click();
}
test("la nave assente dal live rimane visibile prima e dopo mostra/nascondi traccia", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = await fixture(page);
  await page.goto("/");
  await page.getByLabel("Cerca una nave").fill("RDO CONCORD");
  await page.getByRole("option", { name: /RDO CONCORD/ }).click();
  const marker = page.locator(".selected-vessel-marker");
  await expect(marker).toHaveCount(1);
  await expect(marker).toBeInViewport();
  await expect(marker).toContainText("Ultima posizione AIS");
  await expect(marker).toContainText(
    state.detail.last_position!.timestamp.slice(11, 16),
  );
  await page.screenshot({
    path: info.outputPath("selected-without-track.png"),
  });
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  await expect(
    page.locator(".track-position-marker:not(.selected-vessel-marker)"),
  ).toBeInViewport();
  await expect(marker).toHaveCount(0);
  await vesselPanel(page, info.project.name === "telefono");
  await page
    .locator(".vessel-drawer")
    .getByRole("button", { name: "Nascondi traccia", exact: true })
    .click();
  await expect(marker).toHaveCount(1);
  await expect(marker).toBeInViewport();
  await expect(page.locator(".track-position-marker")).toHaveCount(1);
  await expect(marker).toContainText(
    state.detail.last_position!.timestamp.slice(11, 16),
  );
  await page.screenshot({ path: info.outputPath("selected-after-hide.png") });
  await page
    .getByRole("button", { name: "Chiudi scheda", exact: true })
    .click();
  await expect(marker).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("traccia vuota o fallita non cancella il punto selezionato e gli aggiornamenti della scheda lo aggiornano", async ({
  page,
}, info) => {
  const state = await fixture(page);
  state.mode = "empty";
  await page.goto("/?vessel=" + MMSI);
  const marker = page.locator(".selected-vessel-marker");
  await expect(marker).toBeInViewport();
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  await expect.poll(() => state.trackRequests).toBe(1);
  await expect(marker).toBeInViewport();
  await vesselPanel(page, info.project.name === "telefono");
  await page
    .locator(".vessel-drawer")
    .getByRole("button", { name: "Nascondi traccia", exact: true })
    .click();
  state.mode = "error";
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  await expect.poll(() => state.trackRequests).toBe(2);
  await expect(marker).toBeInViewport();
  const newer = {
    ...state.detail.last_position!,
    lon: 8.897,
    timestamp: new Date(Date.now() - 60000).toISOString(),
  };
  state.detail = { ...state.detail, last_position: newer };
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(marker).toContainText(newer.timestamp.slice(11, 16));
  await expect(page.locator(".track-position-marker")).toHaveCount(1);
  state.detail = { ...state.detail, last_position: null };
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(marker).toHaveCount(0);
});

test("il punto meno recente è disegnato e cliccabile nella zona senza ricerca o selezione", async ({
  page,
}, info) => {
  const state = await fixture(page);
  const fix = { ...state.detail.last_position!, lat: 38, lon: 15 };
  state.detail = { ...state.detail, last_position: fix };
  await page.route("**/api/map/live?*", (route) =>
    route.fulfill({
      json: {
        vessels: [
          {
            ...fix,
            name: state.detail.name,
            ship_type: "cargo",
            is_sanctioned: false,
            is_stale: true,
            anomaly_flags: [],
          },
        ],
        total_live: 0,
        total_in_bbox: 1,
        recent_in_bbox: 0,
        last_known_in_bbox: 1,
        truncated: false,
        generated_at: new Date().toISOString(),
        history_started_at: fix.timestamp,
        source: {
          connected: true,
          subscribed: true,
          last_message_at: new Date().toISOString(),
          last_disconnect_at: null,
          status: "live",
          outages: [],
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".vessel-drawer")).toHaveCount(0);
  await expect(page.locator(".selected-vessel-marker")).toHaveCount(0);
  if (info.project.name === "telefono") {
    await page.getByRole("button", { name: "Menu mappa", exact: true }).click();
    await page.getByRole("button", { name: /^Stato dati/ }).click();
  }
  await expect(page.locator(".map-status")).toContainText(
    "0 recenti · 1 meno recenti nell’area",
  );
  if (info.project.name === "telefono")
    await page.getByRole("button", { name: "Chiudi stato dati" }).click();
  const canvas = page.locator("canvas.maplibregl-canvas"),
    box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await expect(async () => {
    await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
    await expect(page.locator(".vessel-drawer h1")).toHaveText("RDO CONCORD", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Mostra traccia", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("dated-vessel-clicked.png") });
});
