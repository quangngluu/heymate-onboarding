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
// Production path: v3 is public; Rin Quest is either gated safely or playable
// without an internal query flag, depending on the editorial ready switch.
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

  // E5 deliberately removes an arc from the public entry path until every
  // ending is approved. The full transition coverage automatically resumes on
  // the ready-flip build; before that, the only correct browser behavior is to
  // have no enabled start control.
  {
    const { context, page } = await openModePage();
    await page.click('[data-testid="quest-hub-open"]');
    await page.waitForSelector('.quest-hub:not([hidden])', { visible: true });
    const playable = await page.$('[data-testid="quest-start"]:not([disabled])');
    await context.close();
    if (!playable) return { failures, gated: true };
  }

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

  return { failures, gated: false };
}

async function runOpenChatVisualRewardCoverage(browser) {
  const failures = [];
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      Math.random = () => 0;
      const realFetch = window.fetch.bind(window);
      const fetchUrls = [];
      window.__heymateVisualSmoke = { fetchUrls };
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        fetchUrls.push(url);
        if (url.includes('/api/chat')) {
          return Promise.resolve(
            new Response(JSON.stringify({ text: 'Em nghe rồi. Đoạn này vẫn còn một nhịp chưa nói hết.' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        if (url.includes('/api/tts')) return Promise.resolve(new Response('', { status: 503 }));
        return realFetch(input, init);
      };
    });
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.click('[data-testid="universe-waifu-universe"]');
    await page.waitForSelector('.step-stage', { visible: true });
    await page.waitForSelector('[data-testid="open-chat-visual"]', { visible: true });

    const input = '.dock-bar .chat-input';
    const send = '.dock-bar .btn-primary';
    for (let turn = 1; turn <= 3; turn++) {
      await page.waitForSelector(`${input}:not([disabled])`, { visible: true, timeout: 15_000 });
      await fillInput(page, input, `Lượt reward ${turn}`);
      await clickSelector(page, send);
      await page.waitForFunction(
        (expected) => document.querySelectorAll('.speech-log .bubble-user').length >= expected,
        { timeout: 5_000 },
        turn
      );
    }

    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="open-chat-visual"]').length >= 2,
      { timeout: 15_000 }
    );
    await page.waitForFunction(
      () => document.querySelector('.speech-log')?.textContent?.includes('Em kéo khung này ra vì đoạn anh vừa nói.'),
      { timeout: 15_000 }
    );
    const state = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="open-chat-visual"]')];
      const reward = cards.at(-1);
      const image = reward?.querySelector('img');
      return {
        id: reward?.getAttribute('data-visual-id') ?? null,
        actions: reward?.querySelectorAll('.open-chat-visual-action').length ?? 0,
        imageLoaded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        transcript: document.querySelector('.speech-log')?.textContent ?? '',
        sceneRequests: window.__heymateVisualSmoke.fetchUrls.filter((url) => url.includes('/api/scene-image')).length,
      };
    });
    if (!state.id?.startsWith('rin-reward-')) failures.push(`reward visual=${JSON.stringify(state.id)}`);
    if (state.actions !== 2) failures.push(`reward actions=${state.actions}`);
    if (!state.imageLoaded) failures.push('reward image did not load');
    if (!state.transcript.includes('Em kéo khung này ra vì đoạn anh vừa nói.')) {
      failures.push('reward visual is missing its authored conversational bridge');
    }
    if (state.sceneRequests !== 0) failures.push(`reward made ${state.sceneRequests} scene-image requests`);
  } finally {
    await context.close();
  }
  return { failures };
}

async function runMuteTtsCoverage(browser) {
  const failures = [];
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      const realFetch = window.fetch.bind(window);
      window.__heymateMuteSmoke = { chats: 0, tts: 0 };
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.includes('/api/chat')) {
          window.__heymateMuteSmoke.chats++;
          return Promise.resolve(
            new Response(JSON.stringify({ text: 'Em nghe thấy lượt kiểm thử này.' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        if (url.includes('/api/tts')) {
          window.__heymateMuteSmoke.tts++;
          return Promise.resolve(new Response('', { status: 503 }));
        }
        return realFetch(input, init);
      };
    });
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.click('[data-testid="universe-waifu-universe"]');
    await page.waitForSelector('.step-stage', { visible: true });
    await page.waitForSelector('.dock-bar .chat-input:not([disabled])', { visible: true });
    await page.evaluate(() => {
      window.__heymateMuteSmoke.chats = 0;
      window.__heymateMuteSmoke.tts = 0;
    });

    await page.click('.mute-btn');
    await fillInput(page, '.dock-bar .chat-input', 'MUTED TURN');
    await clickSelector(page, '.dock-bar .btn-primary');
    await page.waitForFunction(() => window.__heymateMuteSmoke.chats === 1);
    await page.waitForSelector('.dock-bar .chat-input:not([disabled])', { visible: true });
    await new Promise((done) => setTimeout(done, 100));
    const mutedRequests = await page.evaluate(() => window.__heymateMuteSmoke.tts);
    if (mutedRequests !== 0) failures.push(`muted turn issued ${mutedRequests} TTS request(s)`);

    await page.click('.mute-btn');
    await fillInput(page, '.dock-bar .chat-input', 'AUDIBLE TURN');
    await clickSelector(page, '.dock-bar .btn-primary');
    await page.waitForFunction(() => window.__heymateMuteSmoke.tts > 0);
    const mutedState = await page.$eval('.mute-btn', (button) => button.getAttribute('aria-pressed'));
    if (mutedState !== 'false') failures.push(`mute control stayed pressed=${mutedState}`);
  } finally {
    await context.close();
  }
  return { failures };
}

async function runTurnOverlapCoverage(browser) {
  const failures = [];
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      const realFetch = window.fetch.bind(window);
      const probe = { chats: 0, streamStarts: 0, stops: 0 };
      window.__heymateOverlapSmoke = probe;
      const sourcePrototype = AudioBufferSourceNode.prototype;
      const realStart = sourcePrototype.start;
      const realStop = sourcePrototype.stop;
      sourcePrototype.start = function (...args) {
        probe.streamStarts++;
        return realStart.apply(this, args);
      };
      sourcePrototype.stop = function (...args) {
        probe.stops++;
        return realStop.apply(this, args);
      };
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.includes('/api/chat')) {
          probe.chats++;
          if (probe.chats === 2) return new Promise(() => {});
          return Promise.resolve(
            new Response(JSON.stringify({ text: 'Lượt đầu vẫn còn đang phát.' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        if (url.includes('/api/tts')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          if (!body.stream) return Promise.resolve(new Response('', { status: 503 }));
          const pcm = new Int16Array(64_000);
          pcm.fill(320);
          return Promise.resolve(
            new Response(new Uint8Array(pcm.buffer), {
              status: 200,
              headers: { 'X-Sample-Rate': '32000', 'Content-Type': 'application/octet-stream' },
            })
          );
        }
        return realFetch(input, init);
      };
    });
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.click('[data-testid="universe-waifu-universe"]');
    await page.waitForSelector('.step-stage', { visible: true });
    await page.waitForSelector('.dock-bar .chat-input:not([disabled])', { visible: true });
    await page.evaluate(() => {
      window.__heymateOverlapSmoke.chats = 0;
      window.__heymateOverlapSmoke.streamStarts = 0;
      window.__heymateOverlapSmoke.stops = 0;
    });

    await fillInput(page, '.dock-bar .chat-input', 'FIRST TURN');
    await clickSelector(page, '.dock-bar .btn-primary');
    await page.waitForFunction(
      () => window.__heymateOverlapSmoke.streamStarts > 0 && !document.querySelector('.dock-bar .chat-input')?.disabled,
      { timeout: 15_000 }
    );
    await page.evaluate(() => { window.__heymateOverlapSmoke.stops = 0; });
    await fillInput(page, '.dock-bar .chat-input', 'SECOND TURN');
    await clickSelector(page, '.dock-bar .btn-primary');
    await page.waitForFunction(() => window.__heymateOverlapSmoke.chats === 2);
    await new Promise((done) => setTimeout(done, 80));
    const stopsAtSubmit = await page.evaluate(() => window.__heymateOverlapSmoke.stops);
    if (stopsAtSubmit < 1) failures.push('turn 2 submit did not stop turn 1 playback');
  } finally {
    await context.close();
  }
  return { failures };
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
  await page.waitForFunction(
    () => {
      const image = document.querySelector('[data-testid="open-chat-visual"] img');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    },
    { timeout: 15_000 }
  );
  const openingVisualState = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="open-chat-visual"]');
    const children = [...(card?.parentElement?.children ?? [])];
    const at = card ? children.indexOf(card) : -1;
    const image = card?.querySelector('img');
    return {
      id: card?.getAttribute('data-visual-id') ?? null,
      residentBubblesBefore: at < 0
        ? -1
        : children.slice(0, at).filter((element) => element.classList.contains('bubble-resident')).length,
      actionCount: card?.querySelectorAll('.open-chat-visual-action').length ?? 0,
      alt: image?.getAttribute('alt') ?? '',
      naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });
  if (captureDir) {
    mkdirSync(captureDir, { recursive: true });
    await page.screenshot({
      path: resolve(captureDir, `open-chat-visual-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  }
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
  await page.$eval('[data-testid="session-length"]', (element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'range') {
      throw new Error('response length is not a range input');
    }
    element.value = '2';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const settingsState = await page.evaluate(() => {
    const scenario = document.querySelector('[data-testid="session-scenario"]');
    const length = document.querySelector('[data-testid="session-length"]');
    const lengthLabel = document.querySelector('[data-testid="session-length-label"]');
    const voiceAction = document.querySelector('[data-testid="voice-speak-as"]');
    return {
      scenario: scenario instanceof HTMLSelectElement ? scenario.value : null,
      length: window.__hm?.store?.get?.().session.length ?? null,
      lengthType: length instanceof HTMLInputElement ? length.type : null,
      lengthValue: length instanceof HTMLInputElement ? length.value : null,
      lengthLabel: lengthLabel?.textContent?.trim() ?? '',
      voiceActionEnabled: voiceAction instanceof HTMLButtonElement && !voiceAction.disabled,
    };
  });
  await page.click('[data-testid="session-settings-close"]');
  await page.waitForSelector('[data-testid="quest-hub-open"]', { visible: true });
  await page.click('[data-testid="quest-hub-open"]');
  await page.waitForSelector('.quest-hub:not([hidden])', { visible: true });

  const start = performance.now();
  const playable = await page.$('[data-testid="quest-start"]:not([disabled])');
  const gatedCardVisible = await page.$eval('.quest-unavailable', (element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }).catch(() => false);
  let firstBeatMs = null;
  if (playable) {
    await clickSelector(page, '[data-testid="quest-start"]:not([disabled])');
    await page.waitForSelector('.step-stage.is-quest-mode .quest-strip:not([hidden])', {
      visible: true,
      timeout: 5_000,
    });
    await page.waitForSelector('.step-stage.is-quest-mode .bubble-resident', {
      visible: true,
      timeout: 5_000,
    });
    firstBeatMs = Math.round(performance.now() - start);
  }

  const state = await page.evaluate((settingsShape_, settingsState_, questPlayable_, gatedCardVisible_, openingVisualState_) => {
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
      questPlayable: questPlayable_,
      gatedCardVisible: gatedCardVisible_,
      openingVisual: openingVisualState_,
    };
  }, settingsShape, settingsState, Boolean(playable), gatedCardVisible, openingVisualState);

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
  if (state.settingsState.length !== 'expressive') {
    failures.push(`settings length=${JSON.stringify(state.settingsState.length)}`);
  }
  if (
    state.settingsState.lengthType !== 'range' ||
    state.settingsState.lengthValue !== '2' ||
    state.settingsState.lengthLabel !== 'Nhiều cảm xúc'
  ) {
    failures.push(`settings length slider=${JSON.stringify(state.settingsState)}`);
  }
  if (!state.settingsState.voiceActionEnabled) failures.push('voice action is unavailable');
  if (state.openingVisual.id !== 'rin-opening-signal') {
    failures.push(`opening visual=${JSON.stringify(state.openingVisual.id)}`);
  }
  if (state.openingVisual.residentBubblesBefore !== 2) {
    failures.push(`opening visual after ${state.openingVisual.residentBubblesBefore} sentences`);
  }
  if (state.openingVisual.actionCount !== 2) {
    failures.push(`opening visual actions=${state.openingVisual.actionCount}`);
  }
  if (!state.openingVisual.alt || state.openingVisual.naturalWidth < 1) {
    failures.push('opening visual lacks a loaded accessible image');
  }
  if (state.openingVisual.horizontalOverflowPx > 1) {
    failures.push(`opening horizontalOverflowPx=${state.openingVisual.horizontalOverflowPx}`);
  }
  if (state.questPlayable) {
    if (!state.scenarioHiddenInQuest) failures.push('scenario remains visible in Quest');
    if (state.questPhase !== 'threshold') failures.push(`questPhase=${state.questPhase}`);
    if (!state.episodeLabel.includes('MOTION ARCHIVE CORRIDOR')) {
      failures.push(`episodeLabel=${JSON.stringify(state.episodeLabel)}`);
    }
    if (!state.firstLine) failures.push('first authored line is empty');
    if (!state.rosterHidden) failures.push('resident roster remains visible');
    if (!state.exitVisible) failures.push('Quest exit is not visible');
  } else {
    if (!state.gatedCardVisible) failures.push('unplayable quest has no safe unavailable card');
    if (state.questPhase) failures.push(`gated quest entered phase=${state.questPhase}`);
  }
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
  const modeCoverage = await runModeTransitionCoverage(browser);
  const openChatVisualCoverage = await runOpenChatVisualRewardCoverage(browser);
  const muteTtsCoverage = await runMuteTtsCoverage(browser);
  const turnOverlapCoverage = await runTurnOverlapCoverage(browser);

  if (captureDir) {
    writeFileSync(
      resolve(captureDir, 'quest-phase2-before.json'),
      `${JSON.stringify({ route: ROUTE, results }, null, 2)}\n`
    );
  }

  for (const result of results) {
    const status = result.failures.length ? 'FAIL' : 'PASS';
    process.stdout.write(
      `${status} ${result.viewport} firstBeat=${result.firstBeatMs === null ? 'gated' : `${result.firstBeatMs}ms`} ` +
        `overflow=${result.horizontalOverflowPx}px warnings=${result.expectedWarnings.length}\n`
    );
    for (const failure of result.failures) {
      process.stderr.write(`  - ${failure}\n`);
    }
  }

  process.stdout.write(
    `${modeCoverage.failures.length ? 'FAIL' : modeCoverage.gated ? 'SKIP' : 'PASS'} ` +
      `mode transition/request binding${modeCoverage.gated ? ' (ending gate closed)' : ''}\n`
  );
  for (const failure of modeCoverage.failures) process.stderr.write(`  - ${failure}\n`);

  process.stdout.write(
    `${openChatVisualCoverage.failures.length ? 'FAIL' : 'PASS'} Open Chat visual reward scheduling\n`
  );
  for (const failure of openChatVisualCoverage.failures) process.stderr.write(`  - ${failure}\n`);

  process.stdout.write(
    `${muteTtsCoverage.failures.length ? 'FAIL' : 'PASS'} mute skips TTS generation\n`
  );
  for (const failure of muteTtsCoverage.failures) process.stderr.write(`  - ${failure}\n`);

  process.stdout.write(
    `${turnOverlapCoverage.failures.length ? 'FAIL' : 'PASS'} turn submit stops prior playback\n`
  );
  for (const failure of turnOverlapCoverage.failures) process.stderr.write(`  - ${failure}\n`);

  if (
    results.some((result) => result.failures.length) ||
    modeCoverage.failures.length ||
    openChatVisualCoverage.failures.length ||
    muteTtsCoverage.failures.length ||
    turnOverlapCoverage.failures.length
  ) process.exitCode = 1;
} finally {
  await browser?.close();
  if (vite && !vite.killed) vite.kill('SIGTERM');
}
