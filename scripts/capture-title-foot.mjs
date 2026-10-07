/**
 * Title + in-ride HUD captures for PR review.
 * Usage: node scripts/capture-title-foot.mjs <baseUrl> <outDir>
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3000";
const outDir = process.argv[3] || "/opt/cursor/artifacts/after";

async function snap(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false, timeout: 90_000 });
  console.log("wrote", file);
}

async function waitMenu(page) {
  await page.waitForSelector('button:has-text("Start riding")', { timeout: 180_000 });
  await page.waitForTimeout(2500);
}

async function titleShots(page, prefix) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await waitMenu(page);
  await snap(page, `${prefix}-title.png`);
}

async function hudShot(page, prefix) {
  await page.goto(`${baseUrl}/?shift=720`, { waitUntil: "networkidle" });
  await waitMenu(page);
  await page.locator('button:has-text("Start riding")').click();
  await page.waitForFunction(() => document.body.textContent?.includes("Pause"), { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await snap(page, `${prefix}-in-ride-hud.png`);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext();
context.setDefaultTimeout(180_000);

for (const [label, viewport] of [
  ["desktop-1440x900", { width: 1440, height: 900 }],
  ["desktop-1920x1080", { width: 1920, height: 1080 }],
  ["mobile-390w", { width: 390, height: 844 }],
]) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await titleShots(page, label);
  if (label === "desktop-1440x900") await hudShot(page, label);
  if (label === "mobile-390w") await hudShot(page, label);
  await page.close();
}

await browser.close();
console.log("done", outDir);
