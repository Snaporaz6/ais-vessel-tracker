import { test, expect } from "@playwright/test";

const photo = {
  url: "https://upload.wikimedia.org/photo-fixture.png",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Ship.jpg",
  author: "Fotografo della prova",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=",
  "base64",
);

test("the photograph decodes with attribution in the drawer and full page; changing ships clears it", async ({
  page,
}) => {
  const detail = await (
    await page.request.get("http://localhost:3001/api/vessel/900000001")
  ).json();
  const second = { ...detail, mmsi: "900000002", name: "Seconda nave" };
  await page.route("**/api/search?q=900000002", (route) =>
    route.fulfill({ json: [second] }),
  );
  await page.route("**/api/vessel/900000002", (route) =>
    route.fulfill({ json: second }),
  );
  await page.route(photo.url, (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.route("**/api/vessel-photo?**", (route) => {
    const mmsi = new URL(route.request().url()).searchParams.get("mmsi");
    return route.fulfill({
      json: { photo: mmsi === "900000001" ? photo : null },
    });
  });
  await page.goto("/");
  await page.getByLabel("Cerca una nave").fill("900000001");
  await page.getByRole("button", { name: /Aurora.*nave dimostrativa/ }).click();
  const image = page.locator(".vessel-photo img");
  await expect(
    page.getByRole("link", { name: "Foto: Fotografo della prova" }),
  ).toBeVisible();
  expect(
    await image.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
    ),
  ).toBe(true);
  await expect(page.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();
  await page.getByLabel("Cerca una nave").fill("900000002");
  await page.locator(".search-results button").first().click();
  await expect(
    page.getByText("Nessuna foto disponibile nelle fonti libere."),
  ).toBeVisible();
  await expect(image).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Foto: Fotografo della prova" }),
  ).toHaveCount(0);
  await page.goto("/vessel/900000001");
  await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Foto: Fotografo della prova" }),
  ).toBeVisible();
  expect(
    await image.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
    ),
  ).toBe(true);
});

test("a source outage allows retry and an image failure never blocks the vessel details", async ({
  page,
}) => {
  let requests = 0;
  let brokenImage = false;
  await page.route("**/api/vessel-photo?**", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
      : route.fulfill({ json: { photo } });
  });
  await page.route(photo.url, (route) =>
    brokenImage
      ? route.abort()
      : route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.goto("/vessel/900000001");
  await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  await expect(
    page.getByText("Foto temporaneamente non disponibile."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Riprova foto" }).click();
  await expect(
    page.getByRole("link", { name: "Foto: Fotografo della prova" }),
  ).toBeVisible();
  brokenImage = true;
  await page.reload();
  await expect(
    page.getByText("Foto temporaneamente non disponibile."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Soste rilevate/ }),
  ).toBeVisible();
});

test("a stalled photo lookup stops waiting while the vessel page stays usable", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/api/vessel-photo?**", () => {});
  const lookup = page.waitForRequest((request) =>
    request.url().includes("/api/vessel-photo?"),
  );
  await page.goto("/vessel/900000001");
  await lookup;
  await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  await page.clock.fastForward(12001);
  await expect(
    page.getByText("Foto temporaneamente non disponibile."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Riprova foto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mostra sulla mappa" }),
  ).toBeVisible();
  const invalid = await page.request.get("/api/vessel-photo?mmsi=invalid");
  expect(invalid.status()).toBe(400);
});
