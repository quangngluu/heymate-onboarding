import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const HOST = '127.0.0.1';
const PORT = 5197;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT = resolve('public/assets/open-chat');

const residents = [
  {
    label: 'Rin Amagi',
    accent: '#67c9e8',
    modelUrl: 'assets/waifu-nyx.glb',
    files: ['rin-opening-signal.webp', 'rin-reward-afterimage.webp', 'rin-reward-held-frame.webp'],
  },
  {
    label: 'Kagari Akagane',
    accent: '#e0402c',
    modelUrl: 'assets/waifu-aria.glb',
    files: ['kagura-opening-reflection.webp', 'kagura-reward-vigil.webp', 'kagura-reward-rest.webp'],
  },
  {
    label: 'Momo Kuroha',
    accent: '#d49cf4',
    modelUrl: 'assets/waifu-suri.glb',
    files: ['momo-opening-page.webp', 'momo-reward-first-train.webp', 'momo-reward-no-price.webp'],
  },
];

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome not found; set CHROME_BIN.');
  return found;
}

async function waitForServer(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Vite did not become ready at ${BASE_URL}.`);
}

async function capture(backgroundPng, portraitPng, filename, accent) {
  const background = await sharp(backgroundPng)
    .resize(960, 720, { fit: 'cover', position: 'centre' })
    .blur(11)
    .modulate({ brightness: 0.46, saturation: 0.72 })
    .png()
    .toBuffer();
  const portrait = await sharp(portraitPng)
    .resize(338, 620, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .modulate({ brightness: 1.04, saturation: 0.94 })
    .png()
    .toBuffer();
  const screen = await sharp({
    create: { width: 354, height: 650, channels: 4, background: '#091019' },
  })
    .composite([{ input: portrait, left: 8, top: 15 }])
    .png()
    .toBuffer();
  const panel = await sharp({
    create: { width: 370, height: 666, channels: 4, background: accent },
  })
    .composite([{ input: screen, left: 8, top: 8 }])
    .png()
    .toBuffer();
  await sharp(background)
    .composite([{ input: panel, left: 295, top: 27 }])
    .webp({ quality: 88, effort: 5 })
    .toFile(resolve(OUTPUT, filename));
}

const vite = spawn(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), '--host', HOST, '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
);

try {
  await waitForServer();
  mkdirSync(OUTPUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.click('[data-testid="universe-waifu-universe"]');
    await page.waitForSelector('.step-stage', { visible: true });
    await page.waitForSelector('.speech-log .bubble-resident', { visible: true, timeout: 30_000 });

    for (const resident of residents) {
      const selector = `.roster-chip[aria-label="${resident.label}"]`;
      const active = await page.$eval(selector, (element) => element.getAttribute('aria-checked') === 'true');
      if (!active) {
        await page.click(selector);
        await page.waitForFunction(
          (label) => document.querySelector(`.roster-chip[aria-label="${label}"]`)?.getAttribute('aria-checked') === 'true',
          {},
          resident.label
        );
      }
      await new Promise((done) => setTimeout(done, 650));
      await page.evaluate(() => {
        const ui = document.querySelector('#ui');
        const boot = document.querySelector('#boot');
        if (ui instanceof HTMLElement) ui.style.visibility = 'hidden';
        if (boot instanceof HTMLElement) boot.style.display = 'none';
      });

      const background = await page.screenshot({ type: 'png' });
      const yaws = [0, -0.34, 0.34];
      for (let index = 0; index < resident.files.length; index++) {
        const portraitData = await page.evaluate(
          async (modelUrl, yaw) => {
            const { subjectPortrait } = await import('/src/three/subject.ts');
            return subjectPortrait(modelUrl, yaw);
          },
          resident.modelUrl,
          yaws[index]
        );
        if (!portraitData) throw new Error(`Could not render portrait for ${resident.label}.`);
        const portrait = Buffer.from(portraitData.split(',')[1], 'base64');
        await capture(background, portrait, resident.files[index], resident.accent);
      }

      await page.evaluate(() => {
        const ui = document.querySelector('#ui');
        if (ui instanceof HTMLElement) ui.style.visibility = 'visible';
      });
    }
  } finally {
    await browser.close();
  }
} finally {
  vite.kill('SIGTERM');
}
