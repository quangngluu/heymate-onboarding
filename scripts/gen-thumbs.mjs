// Bake the runtime-rendered character thumbnails into static WebP files so
// the studio slider shows real portraits instantly, before any GLB arrives.
// Drives the live app (dev server must be running), waits for every model to
// stream in, then saves each thumbnail's data URL.
//
// Usage: node scripts/gen-thumbs.mjs

import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.QA_URL ?? 'http://localhost:5199';
const OUT = new globalThis.URL('../public/assets/thumbs/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Enter Afterburn')).click()
  );

  // Wait until every slider thumb has been upgraded to a rendered data URL.
  await page.waitForFunction(
    () => {
      const imgs = [...document.querySelectorAll('.slider-thumb img')];
      return imgs.length > 0 && imgs.every((i) => i.src.startsWith('data:image/png'));
    },
    { timeout: 120000, polling: 500 }
  );

  const thumbs = await page.evaluate(() =>
    [...document.querySelectorAll('.slider-thumb')].map((b) => ({
      label: b.getAttribute('aria-label'),
      src: b.querySelector('img').src,
    }))
  );

  const ids = ['rex', 'vexa', 'grind', 'hex', 'vale', 'k6', 'iona', 'echo'];
  for (let i = 0; i < thumbs.length; i++) {
    const buf = Buffer.from(thumbs[i].src.split(',')[1], 'base64');
    const out = `${OUT}${ids[i]}.webp`;
    const webp = await sharp(buf).resize(112, 140).webp({ quality: 82 }).toBuffer();
    writeFileSync(out, webp);
    console.log(out, `${(webp.length / 1024).toFixed(0)}KB`, `(${thumbs[i].label})`);
  }
} finally {
  await browser.close();
}
