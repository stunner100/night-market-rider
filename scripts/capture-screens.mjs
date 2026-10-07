/**
 * Capture UI screenshots for polish documentation.
 * Usage: node scripts/capture-screens.mjs <baseUrl> <outDir>
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3000";
const outDir = process.argv[3] || "/opt/cursor/artifacts/before";

async function snap(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function runViewport(label, viewport, isMobile) {
  const dir = path.join(outDir, label);
  await mkdir(dir, { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: isMobile ? 2 : 1,
    ...(isMobile ? devices["iPhone 13"] : {}),
  });
  const page = await context.newPage();

  // Loading — catch early frame
  await page.goto(`${baseUrl}/?shift=720`, { waitUntil: "commit" });
  try {
    await snap(page, path.join(label, "01-loading"));
  } catch {}

  await page.waitForSelector('button:has-text("Start riding"), button:has-text("START")', { timeout: 120000 });
  await page.waitForTimeout(800);
  await snap(page, path.join(label, "02-title-menu"));

  await page.locator('button').filter({ hasText: /Leaderboard/i }).first().click({ force: true });
  await page.waitForTimeout(400);
  await snap(page, path.join(label, "03-leaderboard"));
  await page.locator('button').filter({ hasText: /CLOSE/i }).click();

  await page.locator('button').filter({ hasText: /How to Play/i }).first().click();
  await page.waitForTimeout(400);
  await snap(page, path.join(label, "04-how-to-play"));
  await page.locator('button').filter({ hasText: /CLOSE/i }).click();

  await page.locator('button').filter({ hasText: /Start riding|START/i }).first().click();
  await page.waitForFunction(() => {
    const t = document.body?.textContent ?? "";
    return !t.includes("Go!") && (t.includes("Pause") || t.includes("ACCEPT"));
  }, { timeout: 20000 }).catch(() => page.waitForTimeout(5000));
  await page.waitForTimeout(1500);
  await snap(page, path.join(label, "05-in-game-hud"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await snap(page, path.join(label, "06-pause"));

  await page.locator('button').filter({ hasText: /Resume|RESUME/i }).first().click();
  await page.waitForTimeout(300);

  // Debug events for phone event HUD
  await page.goto(`${baseUrl}/?shift=720&events=order_surge,police_checkpoint,rain_shower`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector('button:has-text("START")', { timeout: 120000 });
  await page.locator('button').filter({ hasText: /Start riding|START/i }).first().click();
  await page.waitForTimeout(8000);
  await snap(page, path.join(label, "07-events-hud"));

  // End shift quickly via strikes — ram or wait; use short shift + quit
  await page.goto(`${baseUrl}/?shift=30`, { waitUntil: "networkidle" });
  await page.waitForSelector('button:has-text("START")', { timeout: 120000 });
  await page.locator('button').filter({ hasText: /Start riding|START/i }).first().click();
  await page.waitForTimeout(35000);
  await snap(page, path.join(label, "08-shift-results"));

  await browser.close();
}

await mkdir(outDir, { recursive: true });
await runViewport("desktop-1440x900", { width: 1440, height: 900 }, false);
await runViewport("mobile-390x844", { width: 390, height: 844 }, true);
console.log("done", outDir);
