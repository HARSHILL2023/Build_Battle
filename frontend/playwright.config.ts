import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Serial workers: every spec shares the one isolated E2E database, so
  // parallel files would interleave writes (e.g. totalRecords snapshots).
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { channel: "chrome" },
    },
  ],
});
