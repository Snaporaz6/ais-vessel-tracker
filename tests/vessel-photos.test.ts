import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVesselPhoto } from "../frontend/lib/vessel-photos.js";

const identity = { mmsi: "352594000", imo: "9387085" };
const claim = (value: string, rank = "normal") => ({
  rank,
  mainsnak: { datavalue: { value } },
});
function source({
  shipImo = identity.imo,
  shipMmsi = identity.mmsi,
  rank = "normal",
  duplicate = false,
  imageUrl = "https://thumb.wikimedia.org/example.jpg",
  author = '<a href="//commons.wikimedia.org/wiki/User:Artist">A &amp; B</a>',
  license = "CC BY-SA 4.0",
} = {}) {
  const entity = {
    claims: {
      P458: [claim(shipImo, rank)],
      P587: [claim(shipMmsi, rank)],
      P18: [claim("Ship.jpg")],
    },
  };
  return async (url: string) => {
    const params = new URL(url).searchParams;
    if (params.get("list") === "search")
      return { query: { search: [{ title: "Q1" }] } };
    if (params.get("action") === "wbgetentities")
      return {
        entities: duplicate ? { Q1: entity, Q2: entity } : { Q1: entity },
      };
    if (params.get("prop") === "categoryinfo")
      return { query: { pages: [{ missing: true }] } };
    assert.equal(params.get("prop"), "imageinfo");
    return {
      query: {
        pages: [
          {
            imageinfo: [
              {
                mime: "image/jpeg",
                thumburl: imageUrl,
                descriptionurl:
                  "https://commons.wikimedia.org/wiki/File:Ship.jpg",
                extmetadata: {
                  Artist: { value: author },
                  LicenseShortName: { value: license },
                  LicenseUrl: {
                    value: "https://creativecommons.org/licenses/by-sa/4.0/",
                  },
                },
              },
            ],
          },
        ],
      },
    };
  };
}

test("photos identify the exact ship and preserve readable attribution and license", async () => {
  const photo = await resolveVesselPhoto(
    identity,
    AbortSignal.timeout(1000),
    source(),
  );
  assert.equal(photo?.author, "A & B");
  assert.equal(photo?.license, "CC BY-SA 4.0");
  assert.equal(
    photo?.sourceUrl,
    "https://commons.wikimedia.org/wiki/File:Ship.jpg",
  );
  assert.equal(photo?.url, "https://thumb.wikimedia.org/example.jpg");
  const byMmsi = await resolveVesselPhoto(
    { ...identity, imo: null },
    AbortSignal.timeout(1000),
    source(),
  );
  assert.equal(byMmsi?.url, photo?.url);
});

test("unrelated, deprecated and ambiguous identities never produce another ship's photo", async () => {
  for (const options of [
    { shipImo: "1234567" },
    { rank: "deprecated" },
    { duplicate: true },
  ]) {
    assert.equal(
      await resolveVesselPhoto(
        identity,
        AbortSignal.timeout(1000),
        source(options),
      ),
      null,
    );
  }
  assert.equal(
    await resolveVesselPhoto(
      { ...identity, imo: null },
      AbortSignal.timeout(1000),
      source({ shipMmsi: "123456789" }),
    ),
    null,
  );
});

test("photos without attribution or with an unsafe image source are not displayed", async () => {
  for (const options of [
    { author: "" },
    { license: "" },
    { imageUrl: "https://untrusted.example/ship.jpg" },
    { imageUrl: "javascript:alert(1)" },
  ]) {
    assert.equal(
      await resolveVesselPhoto(
        identity,
        AbortSignal.timeout(1000),
        source(options),
      ),
      null,
    );
  }
});

test("missing photos and source failures remain different outcomes", async () => {
  const missing = async () => ({
    query: { search: [], pages: [{ missing: true }] },
  });
  assert.equal(
    await resolveVesselPhoto(identity, AbortSignal.timeout(1000), missing),
    null,
  );
  await assert.rejects(
    resolveVesselPhoto(identity, AbortSignal.timeout(1000), async () => {
      throw new Error("Source unavailable");
    }),
    /Source unavailable/,
  );
});

test("an exact Commons IMO category can supply a photo when Wikidata has none", async () => {
  const withImage = source();
  const photo = await resolveVesselPhoto(
    identity,
    AbortSignal.timeout(1000),
    async (url) => {
      const params = new URL(url).searchParams;
      if (params.get("list") === "search") return { query: { search: [] } };
      if (params.get("prop") === "categoryinfo") {
        assert.equal(params.get("titles"), "Category:IMO 9387085");
        return {
          query: { pages: [{ ns: 14, title: "Category:Ship (2010)" }] },
        };
      }
      if (params.get("list") === "categorymembers")
        return { query: { categorymembers: [{ title: "File:Ship.jpg" }] } };
      return withImage(url);
    },
  );
  assert.equal(photo?.author, "A & B");
});
