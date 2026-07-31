import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const HOST = '127.0.0.1';
const PORT = 5198;
// Production path: v3 and Rin Quest must work without an internal query flag.
const ROUTE = '/';
const captureArg = process.argv.find((arg) => arg.startsWith('--capture-dir='));
const captureDir = captureArg ? resolve(captureArg.slice('--capture-dir='.length)) : null;
const externalUrl = process.env.QUEST_SMOKE_URL?.replace(/\/$/, '');
const baseUrl = externalUrl ?? `http://${HOST}:${PORT}`;

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Chrome not found. Set CHROME_BIN to a Chrome or Chromium executable.'
    );
  }
  return found;
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Vite did not become ready at ${url}: ${lastError}`);
}

function startVite() {
  const viteBin = resolve('node_modules/vite/bin/vite.js');
  const output = [];
  const child = spawn(
    process.execPath,
    [viteBin, '--host', HOST, '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  child.doneOutput = () => output.join('').trim();
  return child;
}

async function clickByText(page, selector, text) {
  const clicked = await page.$$eval(
    selector,
    (elements, expected) => {
      const target = elements.find((element) =>
        element.textContent?.includes(expected)
      );
      if (!(target instanceof HTMLElement)) return false;
      target.click();
      return true;
    },
    text
  );
  if (!clicked) throw new Error(`Could not click ${selector} containing "${text}"`);
}

async function clickSelector(page, selector) {
  const clicked = await page.$eval(selector, (element) => {
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  });
  if (!clicked) throw new Error(`Could not click ${selector}`);
}

async function runViewport(browser, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  const expectedWarnings = [];

  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const detail = `${response.status()} ${response.url()}`;
    if (response.url().includes('/api/tts')) expectedWarnings.push(detail);
    else pageErrors.push(detail);
  });

  await page.setViewport({
    ...viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${baseUrl}${ROUTE}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForSelector('.universe-tile', { visible: true });
  await clickByText(page, '.universe-tile', 'Vũ trụ Waifu');
  await page.waitForSelector('.step-stage', { visible: true });
  await page.waitForFunction(
    () => document.documentElement.dataset.questRig === 'ready',
    { timeout: 30_000 }
  );
  await page.click('.mobile-gear');
  await page.waitForSelector('.session-scrim:not([hidden])', { visible: true });
  const settingsShape = await page.evaluate(() => ({
    primaryRows: document.querySelectorAll('.session-primary .session-setting-row').length,
    advancedOpen: document.querySelector('.session-advanced')?.hasAttribute('open') ?? null,
    composerFontPx: Number.parseFloat(
      getComputedStyle(document.querySelector('.dock-bar .chat-input')).fontSize
    ),
    selectFontPx: Number.parseFloat(
      getComputedStyle(document.querySelector('.session-select')).fontSize
    ),
  }));
  await page.select('select[aria-label="Bối cảnh"]', 'latenight');
  await page.select('select[aria-label="Em chủ động"]', 'lead');
  const settingsSummary = await page.$eval(
    '.mobile-gear',
    (gear) => gear.parentElement?.getAttribute('aria-label') ?? ''
  );
  await page.click('button[aria-label="Đóng thiết lập"]');
  await page.waitForSelector('.quest-btn', { visible: true });
  await page.click('.quest-btn');
  await page.waitForSelector('.quest-hub:not([hidden])', { visible: true });

  const start = performance.now();
  await clickSelector(
    page,
    '.quest-card:not(.quest-unavailable) button:not([disabled])'
  );
  await page.waitForSelector('.step-stage.is-quest-mode .quest-strip:not([hidden])', {
    visible: true,
    timeout: 5_000,
  });
  await page.waitForSelector('.step-stage.is-quest-mode .bubble-resident', {
    visible: true,
    timeout: 5_000,
  });
  const firstBeatMs = Math.round(performance.now() - start);

  const state = await page.evaluate((settingsShape_, settingsSummary_) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };
    const stage = document.querySelector('.step-stage');
    const roster = document.querySelector('.roster');
    const exit = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Về chat'
    );
    const label = document.querySelector('.quest-episode-label');
    const bubble = document.querySelector('.speech-log .bubble-resident');
    const navigation = performance.getEntriesByType('navigation')[0];
    const series = document.querySelector('.card-series');

    return {
      route: localStorage.getItem('heymate.canonRoute'),
      prototype: localStorage.getItem('heymate.questPrototype'),
      rig: document.documentElement.dataset.questRig ?? null,
      series: series?.textContent?.trim() ?? '',
      questPhase: stage?.getAttribute('data-quest-phase') ?? null,
      episodeLabel: label?.textContent?.trim() ?? '',
      firstLine: bubble?.textContent?.trim() ?? '',
      rosterHidden: roster ? getComputedStyle(roster).display === 'none' : false,
      exitVisible: visible(exit),
      horizontalOverflowPx: Math.max(
        0,
        document.documentElement.scrollWidth - window.innerWidth
      ),
      navigationLoadMs:
        navigation instanceof PerformanceNavigationTiming
          ? Math.round(navigation.loadEventEnd)
          : null,
      settingsShape: settingsShape_,
      settingsSummary: settingsSummary_,
    };
  }, settingsShape, settingsSummary);

  if (captureDir) {
    mkdirSync(captureDir, { recursive: true });
    await page.screenshot({
      path: resolve(
        captureDir,
        `quest-phase2-before-${viewport.width}x${viewport.height}.png`
      ),
      fullPage: false,
    });
  }

  await context.close();

  const failures = [];
  if (state.route !== 'sao') failures.push(`route=${state.route}`);
  if (state.prototype) failures.push(`unexpected prototype=${state.prototype}`);
  if (state.rig !== 'ready') failures.push(`rig=${state.rig}`);
  if (!state.series.includes('SWORD ART ONLINE')) {
    failures.push(`series=${JSON.stringify(state.series)}`);
  }
  if (state.settingsShape.primaryRows !== 3) {
    failures.push(`settings primary rows=${state.settingsShape.primaryRows}`);
  }
  if (state.settingsShape.advancedOpen !== false) {
    failures.push(`settings advancedOpen=${state.settingsShape.advancedOpen}`);
  }
  if (state.settingsShape.composerFontPx < 16 || state.settingsShape.selectFontPx < 16) {
    failures.push(
      `mobile form fonts=${state.settingsShape.composerFontPx}/${state.settingsShape.selectFontPx}px`
    );
  }
  if (!state.settingsSummary.includes('Đêm riêng tư · Em dẫn')) {
    failures.push(`settings summary=${JSON.stringify(state.settingsSummary)}`);
  }
  if (state.questPhase !== 'threshold') {
    failures.push(`questPhase=${state.questPhase}`);
  }
  if (!state.episodeLabel.includes('MOTION ARCHIVE CORRIDOR')) {
    failures.push(`episodeLabel=${JSON.stringify(state.episodeLabel)}`);
  }
  if (!state.firstLine) failures.push('first authored line is empty');
  if (!state.rosterHidden) failures.push('resident roster remains visible');
  if (!state.exitVisible) failures.push('Quest exit is not visible');
  if (state.horizontalOverflowPx > 1) {
    failures.push(`horizontalOverflowPx=${state.horizontalOverflowPx}`);
  }
  failures.push(...pageErrors);

  return {
    viewport: `${viewport.width}x${viewport.height}`,
    firstBeatMs,
    ...state,
    expectedWarnings,
    failures,
  };
}

let vite;
let browser;
try {
  if (!externalUrl) {
    vite = startVite();
    vite.on('exit', (code) => {
      if (code && code !== 0) {
        process.stderr.write(
          `Vite exited with ${code}.\n${vite.doneOutput()}\n`
        );
      }
    });
  }
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: 'new',
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
    ],
  });

  const results = [];
  for (const viewport of VIEWPORTS) {
    results.push(await runViewport(browser, viewport));
  }

  if (captureDir) {
    writeFileSync(
      resolve(captureDir, 'quest-phase2-before.json'),
      `${JSON.stringify({ route: ROUTE, results }, null, 2)}\n`
    );
  }

  for (const result of results) {
    const status = result.failures.length ? 'FAIL' : 'PASS';
    process.stdout.write(
      `${status} ${result.viewport} firstBeat=${result.firstBeatMs}ms ` +
        `overflow=${result.horizontalOverflowPx}px warnings=${result.expectedWarnings.length}\n`
    );
    for (const failure of result.failures) {
      process.stderr.write(`  - ${failure}\n`);
    }
  }

  if (results.some((result) => result.failures.length)) process.exitCode = 1;
} finally {
  await browser?.close();
  if (vite && !vite.killed) vite.kill('SIGTERM');
}
