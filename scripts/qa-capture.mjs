// QA + screenshot capture via system Chrome (headless).
// Drives the studio flow with real DOM events and captures deliverable
// screenshots at desktop (1440x900) and mobile (390x844).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.QA_URL ?? 'http://localhost:5199';
const OUT = new globalThis.URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, selector, text, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await page.evaluate(
      ({ selector, text }) => {
        const el = [...document.querySelectorAll(selector)].find((b) =>
          b.textContent.trim().includes(text)
        );
        if (el) el.click();
        return !!el;
      },
      { selector, text }
    );
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`clickByText miss: ${selector} "${text}"`);
    await sleep(300);
  }
}

async function journey(page, tag) {
  const shots = [];
  const shot = async (name) => {
    const file = `${OUT}${tag}-${name}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(1600);
  await shot('1-arrival');

  await clickByText(page, 'button', 'Enter Afterburn City');
  await sleep(5800); // hall flight + fly to first character (slower under load)
  await shot('2-studio-rex');

  // Slider: jump to VALE via thumbnail, then arrow to UNIT K-6 and back
  await clickByText(page, ".slider-thumb", "VALE");
  await sleep(2000);
  await shot('3-studio-vale');
  await clickByText(page, '.slider-arrow[aria-label="Next character"]', '›');
  await sleep(1800);
  await clickByText(page, '.slider-arrow[aria-label="Previous character"]', '‹');
  await sleep(1800);

  // Generate from text
  await page.waitForSelector('.describe-input', { timeout: 10000 });
  await page.type('.describe-input', 'Layered black hair, calm, smart casual, silver details.');
  await clickByText(page, 'button', 'Generate My Mate');
  await sleep(1200);
  await shot('4-generating');
  await sleep(4200); // processing + reveal flight
  await shot('5-reveal');

  await page.waitForSelector('.name-input', { timeout: 10000 });
  await page.type('.name-input', 'Quang');
  await clickByText(page, 'button', 'Join Afterburn City');
  await sleep(3400);
  await shot('6-joined');

  return { shots, errors };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});

try {
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const d = await journey(desktop, 'desktop');
  console.log('desktop shots:', d.shots.length, 'errors:', JSON.stringify(d.errors.slice(0, 5)));
} finally {
  await browser.close();
}
