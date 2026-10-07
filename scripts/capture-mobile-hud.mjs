/**
 * Mobile HUD layout verification captures.
 * Usage: node scripts/capture-mobile-hud.mjs <baseUrl> <outDir>
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3000";
const outDir = process.argv[3] || "/opt/cursor/artifacts/hud-round";

async function snap(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, timeout: 90_000 });
  console.log("wrote", file);
}

async function waitMenu(page) {
  await page.waitForSelector('button:has-text("Start riding"), button:has-text("START")', {
    timeout: 180_000,
  });
  await page.waitForTimeout(2500);
}

async function startShift(page) {
  await page.goto(`${baseUrl}/?shift=720`, { waitUntil: "networkidle" });
  await waitMenu(page);
  await page.locator('button[aria-label="Start riding"]').click({ force: true });
  await page.waitForFunction(
    () => /Accept order/i.test(document.body.textContent ?? ""),
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2000);
}

async function setMobile(page, w) {
  await page.setViewportSize({ width: w, height: 844 });
  await page.waitForTimeout(400);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext();
context.setDefaultTimeout(180_000);

const desktop = await context.newPage();
await desktop.setViewportSize({ width: 1440, height: 900 });
await startShift(desktop);
await snap(desktop, "desktop-1440x900-offer.png");
await desktop.locator("button").filter({ hasText: /Accept order/i }).click();
await desktop.waitForTimeout(3500);
await snap(desktop, "desktop-1440x900-05-in-game-hud.png");
await desktop.close();

const mobileContext = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
mobileContext.setDefaultTimeout(180_000);
const mobile = await mobileContext.newPage();
for (const w of [360, 390, 430]) {
  await setMobile(mobile, w);
  await startShift(mobile);
  await snap(mobile, `mobile-${w}-offer.png`);
  await mobile.locator("button").filter({ hasText: /Accept order/i }).click();
  await mobile.waitForTimeout(2800);
  await snap(mobile, `mobile-${w}-accepted.png`);
  await mobile.waitForTimeout(800);
  await snap(mobile, `mobile-${w}-collapsed.png`);
}
await mobile.close();
await mobileContext.close();

await browser.close();
console.log("done", outDir);
