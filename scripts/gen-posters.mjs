// Bake the gallery tile posters by photographing each universe's own stage,
// so the picker shows real 3D instead of a placeholder. Run with the dev
// server up: node scripts/gen-posters.mjs

import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.QA_URL ?? 'http://localhost:5199';
const OUT = new globalThis.URL('../public/assets/posters/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shootUniverse(page, tileText, slug, prepare) {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.evaluate(
    (t) => [...document.querySelectorAll('.universe-tile')].find((x) => x.textContent.includes(t)).click(),
    tileText
  );
  await sleep(11000);
  if (prepare) await prepare(page);
  // Hide the overlay so the poster is pure scene.
  await page.evaluate(() => ((document.getElementById('ui')).style.opacity = '0'));
  await sleep(400);
  const buf = await page.screenshot({ clip: { x: 220, y: 60, width: 1000, height: 750 } });
  const webp = await sharp(buf).resize(680, 510).webp({ quality: 78 }).toBuffer();
  writeFileSync(`${OUT}${slug}.webp`, webp);
  console.log(`${slug}.webp ${(webp.length / 1024).toFixed(0)}KB`);
  await page.evaluate(() => ((document.getElementById('ui')).style.opacity = ''));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await shootUniverse(page, 'Waifu', 'waifu-universe');
  await shootUniverse(page, 'Afterburn', 'afterburn-city', async (p) => {
    await p.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Enter Afterburn'))?.click()
    );
    await sleep(6000);
  });
} finally {
  await browser.close();
}
