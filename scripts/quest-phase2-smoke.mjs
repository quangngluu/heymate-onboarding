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
const modeOnly = process.argv.includes('--mode-only');
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

async function clickSelector(page, selector) {
  const clicked = await page.$eval(selector, (element) => {
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  });
  if (!clicked) throw new Error(`Could not click ${selector}`);
}

async function fillInput(page, selector, value) {
  const filled = await page.$eval(
    selector,
    (element, next) => {
      if (!(element instanceof HTMLInputElement)) return false;
      element.value = String(next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return element.value === next;
    },
    value
  );
  if (!filled) throw new Error(`Could not fill ${selector}`);
}

async function runModeTransitionCoverage(browser) {
  const failures = [];

  const installFetchMock = () => {
    const realFetch = window.fetch.bind(window);
    const requests = [];
    const fetchUrls = [];
    const pendingChat = [];
    const pendingTts = [];
    window.__heymateModeSmoke = {
      requests,
      fetchUrls,
      pendingChat,
      pendingTts,
      releaseChat(text) {
        pendingChat.shift()?.(
          new Response(JSON.stringify({ text, rapport: { trust: 0.99 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      },
      releaseTts() {
        pendingTts.shift()?.resolve(new Response('', { status: 503 }));
      },
    };
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      fetchUrls.push(url);
      if (url.includes('/api/chat')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        requests.push(body);
        if (String(body.message).includes('DEFER')) {
          return new Promise((resolve) => pendingChat.push(resolve));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ text: 'Em đang đọc câu kiểm thử.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      if (url.includes('/api/tts')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (String(body.text).includes('đang đọc câu kiểm thử')) {
          return new Promise((resolve, reject) => {
            const pending = { resolve, reject };
            pendingTts.push(pending);
            init?.signal?.addEventListener(
              'abort',
              () => {
                const at = pendingTts.indexOf(pending);
                if (at !== -1) pendingTts.splice(at, 1);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          });
        }
        return Promise.resolve(new Response('', { status: 503 }));
      }
      return realFetch(input, init);
    };
  };

  const input = '.dock-bar .chat-input';
  const send = '.dock-bar .btn-primary';
  const openModePage = async () => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    // Install before the app module evaluates so no early request can make the
    // client's endpoint-availability circuit breaker affect this coverage.
    await page.evaluateOnNewDocument(installFetchMock);
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.click('[data-testid="universe-waifu-universe"]');
    await page.waitForSelector('.step-stage', { visible: true });
    return { context, page };
  };
  const openQuest = async (page) => {
    await page.click('[data-testid="quest-hub-open"]');
    await page.waitForSelector('.quest-hub:not([hidden])', { visible: true });
    await clickSelector(page, '[data-testid="quest-start"]:not([disabled])');
    await page.waitForSelector('.step-stage.is-quest-mode', { visible: true });
  };
  const leaveQuest = async (page) => {
    await clickSelector(page, '.quest-mode-head .btn:last-child');
    await page.waitForSelector('.step-stage:not(.is-quest-mode)', { visible: true });
  };

  // Open Chat request remains pending while the visitor enters Quest.
  {
    const { context, page } = await openModePage();
    await page.waitForSelector(`${input}:not([disabled])`);
    await fillInput(page, input, 'OPEN DEFER');
    await clickSelector(page, send);
    await page.waitForFunction(() => window.__heymateModeSmoke.requests.length === 1);
    await openQuest(page);
    await page.evaluate(() => window.__heymateModeSmoke.releaseChat('OPEN LATE REPLY'));
    await new Promise((done) => setTimeout(done, 80));
    const openRequest = await page.evaluate(() => window.__heymateModeSmoke.requests[0]);
    if (openRequest?.session?.face !== 'companion') {
      failures.push(`Open Chat face=${JSON.stringify(openRequest?.session?.face)}`);
    }
    if ((await page.$eval('.speech-log', (element) => element.textContent ?? '')).includes('OPEN LATE REPLY')) {
      failures.push('late Open Chat reply crossed into Quest');
    }
    await leaveQuest(page);
    const resumedTranscript = await page.$eval('.speech-log', (element) => element.textContent ?? '');
    if (!resumedTranscript.includes('OPEN DEFER')) failures.push('Open Chat transcript was not preserved');
    if (resumedTranscript.includes('OPEN LATE REPLY')) failures.push('late Open Chat reply entered its old transcript');
    await context.close();
  }

  // Quest request remains pending while the visitor returns to Open Chat.
  {
    const { context, page } = await openModePage();
    await openQuest(page);
    // Let the threshold's atMs=0 authored beat finish its TTS failure path;
    // otherwise the send button can toggle disabled between the selector wait
    // and the click, which tests a race in the harness rather than mode scope.
    await new Promise((done) => setTimeout(done, 120));
    await page.waitForSelector(`${input}:not([disabled])`);
    await fillInput(page, input, 'QUEST DEFER');
    await clickSelector(page, send);
    try {
      await page.waitForFunction(
        () => window.__heymateModeSmoke.requests.length === 1,
        { timeout: 2_000 }
      );
    } catch {
      const state = await page.evaluate(() => ({
        requests: window.__heymateModeSmoke.requests,
        fetchUrls: window.__heymateModeSmoke.fetchUrls,
        input: document.querySelector('.dock-bar .chat-input')?.value,
        inputDisabled: document.querySelector('.dock-bar .chat-input')?.disabled,
        sendDisabled: document.querySelector('.dock-bar .btn-primary')?.disabled,
        sendText: document.querySelector('.dock-bar .btn-primary')?.textContent,
        speakMode: document.querySelector('.stage-dock')?.classList.contains('is-speak'),
        credits: document.querySelector('.turns-left')?.textContent,
        transcript: document.querySelector('.speech-log')?.textContent,
        phase: document.querySelector('.step-stage')?.getAttribute('data-quest-phase'),
        store: window.__hm?.store?.get?.(),
      }));
      throw new Error(`Mode smoke did not send Quest request: ${JSON.stringify(state)}`);
    }
    const questRequest = await page.evaluate(() => window.__heymateModeSmoke.requests[0]);
    if (questRequest?.session?.face !== 'story') {
      failures.push(`Quest face=${JSON.stringify(questRequest?.session?.face)}`);
    }
    await leaveQuest(page);
    await page.evaluate(() => window.__heymateModeSmoke.releaseChat('QUEST LATE REPLY'));
    await new Promise((done) => setTimeout(done, 80));
    const openTranscript = await page.$eval('.speech-log', (element) => element.textContent ?? '');
    if (openTranscript.includes('QUEST LATE REPLY')) failures.push('late Quest reply crossed into Open Chat');
    await context.close();
  }

  // A completed model reply has entered TTS, then Quest starts before audio is available.
  {
    const { context, page } = await openModePage();
    await page.waitForSelector(`${input}:not([disabled])`);
    await fillInput(page, input, 'OPEN VOICE');
    await clickSelector(page, send);
    await page.waitForFunction(
      () => window.__heymateModeSmoke.requests.length === 1 && window.__heymateModeSmoke.pendingTts.length === 1
    );
    await openQuest(page);
    // Quest's own atMs=0 line briefly owns voicing. Wait for that new scope to
    // settle, then prove the still-pending Open Chat clip cannot block it.
    try {
      await page.waitForSelector(`${input}:not([disabled])`, { timeout: 5_000 });
    } catch {
      const state = await page.evaluate(() => ({
        fetchUrls: window.__heymateModeSmoke.fetchUrls,
        pendingTts: window.__heymateModeSmoke.pendingTts.length,
        inputDisabled: document.querySelector('.dock-bar .chat-input')?.disabled,
        store: window.__hm?.store?.get?.(),
      }));
      throw new Error(`Quest stayed blocked after Open Chat TTS cancellation: ${JSON.stringify(state)}`);
    }
    const questInputEnabled = await page.$eval(input, (element) =>
      element instanceof HTMLInputElement ? !element.disabled : false
    );
    if (!questInputEnabled) failures.push('old Open Chat voicing state blocked Quest input');
    await page.evaluate(() => window.__heymateModeSmoke.releaseTts());
    await new Promise((done) => setTimeout(done, 80));
    const remainsEnabled = await page.$eval(input, (element) =>
      element instanceof HTMLInputElement ? !element.disabled : false
    );
    if (!remainsEnabled) failures.push('late Open Chat TTS reclaimed Quest voicing state');
    await leaveQuest(page);
    await context.close();
  }

  return failures;
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
  await page.waitForSelector('[data-testid="universe-waifu-universe"]', { visible: true });
  await page.click('[data-testid="universe-waifu-universe"]');
  await page.waitForSelector('.step-stage', { visible: true });
  await page.waitForFunction(
    () => document.documentElement.dataset.questRig === 'ready',
    { timeout: 30_000 }
  );
  await page.click('[data-testid="session-settings-open"]');
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
  await page.select('[data-testid="session-scenario"]', 'latenight');
  await page.click('[data-testid="session-advanced"] summary');
  await page.select('[data-testid="session-length"]', 'expressive');
  const settingsState = await page.evaluate(() => {
    const scenario = document.querySelector('[data-testid="session-scenario"]');
    const length = document.querySelector('[data-testid="session-length"]');
    const voiceAction = document.querySelector('[data-testid="voice-speak-as"]');
    return {
      scenario: scenario instanceof HTMLSelectElement ? scenario.value : null,
      length: length instanceof HTMLSelectElement ? length.value : null,
      voiceActionEnabled: voiceAction instanceof HTMLButtonElement && !voiceAction.disabled,
    };
  });
  await page.click('[data-testid="session-settings-close"]');
  await page.waitForSelector('[data-testid="quest-hub-open"]', { visible: true });
  await page.click('[data-testid="quest-hub-open"]');
  await page.waitForSelector('.quest-hub:not([hidden])', { visible: true });

  const start = performance.now();
  await clickSelector(
    page,
    '[data-testid="quest-start"]:not([disabled])'
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

  const state = await page.evaluate((settingsShape_, settingsState_) => {
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
      settingsState: settingsState_,
      scenarioHiddenInQuest:
        document.querySelector('[data-testid="session-scenario"]')?.closest('.session-setting-row')
          ?.hasAttribute('hidden') ?? false,
    };
  }, settingsShape, settingsState);

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
  if (state.settingsShape.primaryRows !== 2) {
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
  if (state.settingsState.scenario !== 'latenight') {
    failures.push(`settings scenario=${JSON.stringify(state.settingsState.scenario)}`);
  }
  if (!state.scenarioHiddenInQuest) failures.push('scenario remains visible in Quest');
  if (state.settingsState.length !== 'expressive') {
    failures.push(`settings length=${JSON.stringify(state.settingsState.length)}`);
  }
  if (!state.settingsState.voiceActionEnabled) failures.push('voice action is unavailable');
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
  if (!modeOnly) {
    for (const viewport of VIEWPORTS) {
      results.push(await runViewport(browser, viewport));
    }
  }
  const modeFailures = await runModeTransitionCoverage(browser);

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

  process.stdout.write(`${modeFailures.length ? 'FAIL' : 'PASS'} mode transition/request binding\n`);
  for (const failure of modeFailures) process.stderr.write(`  - ${failure}\n`);

  if (results.some((result) => result.failures.length) || modeFailures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  if (vite && !vite.killed) vite.kill('SIGTERM');
}
