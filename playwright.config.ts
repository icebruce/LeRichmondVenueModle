import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// The cloud container ships Chromium at /opt/pw-browsers/chromium; CI installs its own.
const localChromium = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(localChromium) ? localChromium : undefined);
const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
};

export default defineConfig({
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "visual/**/*.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", launchOptions },
  webServer: { command: "npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop", testMatch: "e2e/**/*.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: "phone", testMatch: "e2e/**/*.phone.spec.ts", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, launchOptions } },
    { name: "visual", testMatch: "visual/**/*.spec.ts", use: { viewport: { width: 1280, height: 720 }, launchOptions } },
  ],
});
