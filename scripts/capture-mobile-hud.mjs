/**
 * Mobile + desktop HUD captures (offer + after accept).
 * Usage: node scripts/capture-mobile-hud.mjs <baseUrl> <outDir>
 */
import { chromium } from "@playwright/test";
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
  await page.waitForSelector('button:has-text("Start riding")', { timeout: 180_000 });
}

async function startShift(page) {
  await page.goto(`${baseUrl}/?shift=720`, { waitUntil: "networkidle" });
  await waitMenu(page);
  await page.locator('button:has-text("Start riding")').click();
  await page.waitForFunction(
    () => /Accept order/i.test(document.body.textContent ?? ""),
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1500);
}

async function mobileOffer(page, w) {
  await page.setViewportSize({ width: w, height: 844 });
  await startShift(page);
  await snap(page, `mobile-${w}-offer.png`);
}

async function mobileAccepted(page, w) {
  await page.setViewportSize({ width: w, height: 844 });
  await startShift(page);
  await page.locator('button').filter({ hasText: /Accept order/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, `mobile-${w}-accepted.png`);
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
await desktop.locator('button:has-text("Accept order")').click();
await desktop.waitForTimeout(3000);
await snap(desktop, "desktop-1440x900-05-in-game-hud.png");
await desktop.close();

const mobile = await context.newPage();
for (const w of [360, 390, 430]) {
  await mobileOffer(mobile, w);
}
await mobileAccepted(mobile, 390);
await mobile.close();

await browser.close();
console.log("done", outDir);
