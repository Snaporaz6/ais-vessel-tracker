import { test, expect } from "@playwright/test";
import type { LiveMapResponse } from "../../shared/types";

test("i punti AIS sono disegnati e selezionabili attraverso il worker cartografico", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // A local style removes CDN variability; the real MapLibre worker still renders GeoJSON.
  await page.route(
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          version: 8,
          sources: {},
          layers: [
            {
              id: "sea",
              type: "background",
              paint: { "background-color": "#101a29" },
            },
          ],
        }),
      }),
  );
  const at = new Date().toISOString();
  const data: LiveMapResponse = {
    vessels: [
      {
        mmsi: "900000001",
        name: "Aurora cartografica",
        ship_type: "cargo",
        lat: 38,
        lon: 15,
        speed: 9,
        course: 90,
        is_sanctioned: false,
        anomaly_flags: [],
        timestamp: at,
        sanction_status: "unavailable",
      },
    ],
    total_live: 1,
    total_in_bbox: 1,
    truncated: false,
    generated_at: at,
    history_started_at: at,
    source: {
      connected: false,
      subscribed: false,
      last_message_at: at,
      last_disconnect_at: null,
      status: "demo",
      outages: [],
    },
  };
  await page.route("**/api/map/live?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
  await page.goto("/");
  await expect(page.locator(".map-status")).toContainText("1 navi nell’area");
  const canvas = page.locator("canvas.maplibregl-canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await expect(async () => {
    await canvas.click({
      position: { x: bounds!.width / 2, y: bounds!.height / 2 },
    });
    await expect(page.locator(".maplibregl-popup-content")).toContainText(
      "Aurora cartografica",
      { timeout: 1000 },
    );
  }).toPass({ timeout: 15_000 });
  await expect(page.locator(".vessel-drawer h1")).toContainText("Aurora");
  expect(errors).toEqual([]);
});

test("una traccia al limite con molte interruzioni mantiene la mappa utilizzabile e segnala il limite", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const lastAt = Date.now() - 3600_000;
  const points = Array.from({ length: 5000 }, (_, i) => ({
    mmsi: "900000001",
    lat: 38,
    lon: 15,
    speed: 9,
    course: 90,
    heading: null,
    nav_status: "unknown",
    timestamp: new Date(lastAt - (4999 - i) * 60_000).toISOString(),
    gap_before: i > 0 && i % 2 === 0,
  }));
  await page.route("**/api/vessel/900000001/track?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(points),
      headers: {
        "X-Track-First-At": points[0].timestamp,
        "X-Track-Last-At": points[4999].timestamp,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("DEMO · dati interamente fittizi")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel("Cerca una nave").fill("900000001");
  await page.getByRole("button", { name: /Aurora.*nave dimostrativa/ }).click();
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  await expect(page.locator(".map-status")).toContainText(
    "Scegli una finestra più breve.",
  );
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
test("mappa → ricerca → scheda → storico → località funziona e dichiara demo/controlli mancanti", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("DEMO · dati interamente fittizi")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.getByLabel("Cerca una nave").fill("900000001");
  await page.getByRole("button", { name: /Aurora.*nave dimostrativa/ }).click();
  await expect(page.locator(".vessel-drawer h1")).toContainText("Aurora");
  await expect(
    page.getByText(
      "Controllo non disponibile: nessuna conclusione disponibile.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mostra traccia", exact: true })
    .click();
  await page.getByLabel("Storico", { exact: true }).selectOption("90");
  await expect(page.locator(".map-status")).toContainText("punti");
  await page.getByRole("button", { name: "Chiudi scheda" }).click();
  await expect(page.getByLabel("Storico", { exact: true })).toHaveValue("90");
  await page.screenshot({
    path: `test-results/${info.project.name}-mappa.png`,
    fullPage: true,
  });
  await page.goto("/vessel/900000001");
  await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Soste rilevate/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "38.12,13.37" }).click();
  await expect(
    page.getByRole("heading", { name: "Soste rilevate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Le coordinate non identificano un porto.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("ricerca fallita resta un errore esplicito e un nome AIS non diventa HTML", async ({
  page,
}) => {
  await page.route("**/api/search?*", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Ricerca temporaneamente non disponibile.",
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Cerca una nave").fill("test");
  await expect(page.getByRole("status")).toContainText(
    "Ricerca temporaneamente non disponibile.",
  );
  await page.unroute("**/api/search?*");
  await page.route("**/api/search?*", async (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          mmsi: "900000001",
          name: "<img src=x onerror=alert(1)>",
          ship_type: "cargo",
          flag: "",
        },
      ]),
    }),
  );
  await page.getByLabel("Cerca una nave").fill("test2");
  await expect(page.getByRole("button", { name: /<img src=x/ })).toBeVisible();
  expect(await page.locator(".search-results img").count()).toBe(0);
});
