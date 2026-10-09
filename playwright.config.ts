import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node dist/server/index.js",
          url: "http://127.0.0.1:3001/health",
          env: {
            DEMO_MODE: "true",
            NODE_ENV: "test",
            ENV_FILE: "/nonexistent",
            STORAGE_DIR: ".test-data",
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: "npm --prefix frontend run start -- --hostname 127.0.0.1",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    storageState: {
      cookies: [
        {
          name: "ais-language",
          value: "it",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "telefono", use: { ...devices["Pixel 7"] } },
  ],
});
