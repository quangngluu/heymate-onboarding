// QA + screenshot capture via system Chrome (headless).
// Drives the studio flow with real DOM events and captures deliverable
// screenshots at desktop (1440x900) and mobile (390x844).
//
// Journey (updated to the current UI, intent preserved):
//   gallery → "ENTER UNIVERSE" → teaser ("Bỏ qua") → stage showcase →
//   "PRESS TO TALK" (chat playground) → chat turn → session sheet (open/apply)
//   → 5 turns to reach the save gate → save → leave back to the gallery.
//
// TRIMMED: the Afterburn City creator flow (slider → describe → "Generate My
// Mate" → reveal → "Join Afterburn City" → joined) no longer exists in the
// live UI. Afterburn is out of the entry gallery (ENTRY_GALLERY_ALLOW =
// ['waifu-universe']) and the studio step is now the Worldform Studio, so the
// old shots 6-generating / 7-reveal / 8-joined have no equivalent to capture.
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
        const vis = (el) => !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0;
        const el = [...document.querySelectorAll(selector)].find(
          (b) => vis(b) && b.textContent.replace(/\s+/g, ' ').trim().includes(text)
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

/** Open the session sheet on either viewport (mobile gear vs desktop chip). */
async function openSession(page) {
  const deadline = Date.now() + 15000;
  for (;;) {
    const ok = await page.evaluate(() => {
      const vis = (el) => el && !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0;
      const mobile = document.querySelector('[data-testid="session-settings-open"]');
      if (vis(mobile)) {
        mobile.click();
        return true;
      }
      const chip = [...document.querySelectorAll('.dock-chip')].find(
        (b) => vis(b) && b.textContent.includes('Là chính anh')
      );
      if (chip) {
        chip.click();
        return true;
      }
      return false;
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error('openSession miss: no visible session control');
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

  // Each journey is a fresh visitor: clear persisted progress so the desktop
  // run's saved chapter/turns do not leak into the mobile run (same origin).
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(1600);
  await shot('0-gallery');
  // --- Waifu Universe: enter, skip the teaser, land on the stage ---
  await clickByText(page, '.universe-enter-button', 'ENTER UNIVERSE');
  await sleep(4500);
  await shot('1-encounter');
  await clickByText(page, '.teaser-skip', 'Bỏ qua');
  await page.waitForSelector('[data-testid="press-to-talk"]', { timeout: 30000 });
  await sleep(1200);
  await shot('2-resident');

  // --- Meet the resident: enter the chat playground ---
  // NOTE: `.chat-input` also matches a hidden bond input inside the session
  // sheet, so scope every chat interaction to the dock composer.
  await clickByText(page, '[data-testid="press-to-talk"]', 'PRESS TO TALK');
  // Wait for the opening line to finish streaming before typing the first turn.
  await page.waitForFunction(() => !document.querySelector('.stage-dock .chat-input')?.disabled, { timeout: 30000 });

  await page.type('.stage-dock .chat-input', 'i am preparing for a design review');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.stage-dock .chat-input')?.disabled, { timeout: 30000 });
  await sleep(800);
  await shot('3-chat');

  // --- Session setup (minimal: open + apply; the persona builder replaced
  // the old "Playful / Take the lead" segments) ---
  await openSession(page);
  await sleep(900);
  await shot('4-session');
  await clickByText(page, '.session-sheet .btn-primary', 'Xong');
  await sleep(600);

  // --- Spend the free encounter to reach the save gate (opens on turn 5) ---
  for (const line of ['i love late night walks', 'what breaks first?', 'my project is late', 'thanks']) {
    await page.waitForFunction(() => !document.querySelector('.stage-dock .chat-input')?.disabled, { timeout: 30000 });
    await page.type('.stage-dock .chat-input', line);
    await page.keyboard.press('Enter');
    await sleep(1800);
  }
  await page.waitForFunction(
    () => {
      const gate = document.querySelector('.save-gate');
      return !!gate && !gate.hidden;
    },
    { timeout: 40000 }
  );
  await sleep(600);
  await shot('5-save-gate');
  await clickByText(page, '.gate-card .btn-primary', 'Lưu chương');
  await sleep(1200);

  // --- Leave back to the gallery (where Afterburn used to sit) ---
  await clickByText(page, '.stage-top .btn', 'Tất cả vũ trụ');
  await sleep(1800);
  await shot('6-gallery-again');

  return { shots, errors };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb'],
});

try {
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const d = await journey(desktop, 'desktop');
  console.log('desktop shots:', d.shots.length, 'errors:', JSON.stringify(d.errors.slice(0, 8)));
  // Close before the mobile run: a backgrounded page gets no rAF in headless
  // Chrome, which freezes the app's animation loop mid-journey.
  await desktop.close();

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await journey(mobile, 'mobile');
  console.log('mobile shots:', m.shots.length, 'errors:', JSON.stringify(m.errors.slice(0, 8)));
} finally {
  await browser.close();
}
