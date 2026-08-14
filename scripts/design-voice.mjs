import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOICE_DESIGN_ENDPOINT = 'https://api.minimax.io/v1/voice_design';
const TTS_ENDPOINT = 'https://api.minimax.io/v1/t2a_v2';
const DEFAULT_MODEL = 'speech-2.8-turbo';
const DEFAULT_OUT_DIR = './voice-out';
const DEFAULT_LANGUAGE = 'Vietnamese';
const LANGUAGE_TEXT = {
  Vietnamese: {
    preview: 'Xin chào. Thiết bị đã sẵn sàng. Đã kết nối. Chào buổi sáng.',
    persistence: 'Xin chào, đây là giọng đọc của thiết bị.',
  },
  English: {
    preview: 'Hello. The device is ready. Connected. Good morning.',
    persistence: "Hello, this is the device's voice.",
  },
};
const PROVENANCE_PATH = fileURLToPath(new URL('./voice-provenance.json', import.meta.url));

// This prompt must NEVER name or imply a real/known person or voice actor — that is what keeps the voice legally non-identifiable.
const VOICE_PROMPT =
  'A calm, gender-neutral adult narrator with a clear, warm mid-range timbre. Even, unhurried pace; natural and friendly but composed, never dramatic or salesy. Clean studio sound, neutral accent, easy to understand in short spoken prompts. An original synthetic voice, not modeled on any real, public, or celebrity person.';

function parseArgs(argv) {
  const options = {
    synth: false,
    prompt: VOICE_PROMPT,
    preview: undefined,
    text: undefined,
    lang: DEFAULT_LANGUAGE,
    voiceId: undefined,
    outDir: DEFAULT_OUT_DIR,
    speed: 1,
    vol: 1,
  };

  const flags = {
    '--prompt': 'prompt',
    '--preview': 'preview',
    '--text': 'text',
    '--lang': 'lang',
    '--voice-id': 'voiceId',
    '--out': 'outDir',
    '--speed': 'speed',
    '--vol': 'vol',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--synth') {
      options.synth = true;
      continue;
    }

    const option = flags[argv[i]];
    if (!option) throw new Error(`Unknown argument: ${argv[i]}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argv[i - 1]}`);
    }
    options[option] = value;
  }

  const languageText = LANGUAGE_TEXT[options.lang] || LANGUAGE_TEXT[DEFAULT_LANGUAGE];
  options.speed = Number.parseFloat(options.speed);
  options.vol = Number.parseFloat(options.vol);

  if (!options.lang.trim()) throw new Error('--lang cannot be empty.');
  if (options.voiceId !== undefined && !options.voiceId.trim()) {
    throw new Error('--voice-id cannot be empty.');
  }
  if (!options.outDir.trim()) throw new Error('--out cannot be empty.');
  if (!Number.isFinite(options.speed) || options.speed <= 0) {
    throw new Error('--speed must be a finite number greater than 0.');
  }
  if (!Number.isFinite(options.vol) || options.vol <= 0) {
    throw new Error('--vol must be a finite number greater than 0.');
  }

  if (options.synth) {
    if (!options.voiceId) throw new Error('--voice-id is required with --synth.');
    options.text ??= options.preview ?? languageText.persistence;
    if (!options.text.trim()) throw new Error('--text cannot be empty.');
  } else {
    options.preview ??= languageText.preview;
    if (!options.prompt.trim()) throw new Error('--prompt cannot be empty.');
    if (!options.preview.trim()) throw new Error('--preview cannot be empty.');
    if (options.preview.length > 500) {
      throw new Error('--preview must be 500 characters or fewer.');
    }
  }

  return options;
}

async function postJson(url, key, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`MiniMax returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const detail = data?.base_resp?.status_msg || data?.message || response.statusText;
    throw new Error(`MiniMax HTTP ${response.status}: ${detail}`);
  }

  return data;
}

function baseRespError(data) {
  const code = data?.base_resp?.status_code;
  if (typeof code !== 'number' || code === 0) return undefined;
  return `MiniMax error ${code}: ${data.base_resp?.status_msg || 'Unknown error'}`;
}

function decodeHex(hex, label) {
  if (typeof hex !== 'string' || !hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error(`MiniMax returned invalid ${label} hex audio.`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function readProvenance() {
  let raw;
  try {
    raw = await readFile(PROVENANCE_PATH, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error(`${PROVENANCE_PATH} is not valid JSON.`);
  }
  if (!Array.isArray(entries)) throw new Error(`${PROVENANCE_PATH} must contain a JSON array.`);
  return entries;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    console.error('MINIMAX_API_KEY is required.');
    process.exit(1);
  }

  const languageText = LANGUAGE_TEXT[options.lang] || LANGUAGE_TEXT[DEFAULT_LANGUAGE];
  const model = process.env.MINIMAX_MODEL || DEFAULT_MODEL;
  const outDir = resolve(options.outDir);

  if (options.synth) {
    const synthPath = resolve(outDir, 'synth.mp3');
    const ttsData = await postJson(TTS_ENDPOINT, key, {
      model,
      text: options.text,
      voice_setting: { voice_id: options.voiceId, speed: options.speed, vol: options.vol },
      audio_setting: { format: 'mp3', sample_rate: 32000 },
      language_boost: options.lang,
    });
    const ttsError = baseRespError(ttsData);
    if (ttsError) throw new Error(ttsError);

    const synthBytes = decodeHex(ttsData?.data?.audio, 'TTS');
    await mkdir(outDir, { recursive: true });
    await writeFile(synthPath, synthBytes);

    console.log(`voice_id: ${options.voiceId}`);
    console.log(`synth: ${synthPath}`);
    console.log(`text: ${options.text}`);
    return;
  }

  const previewPath = resolve(outDir, 'preview.mp3');
  const auditionPath = resolve(outDir, 'audition.mp3');
  const provenance = await readProvenance();

  const designData = await postJson(VOICE_DESIGN_ENDPOINT, key, {
    prompt: options.prompt,
    preview_text: options.preview,
    ...(options.voiceId ? { voice_id: options.voiceId } : {}),
  });
  const designError = baseRespError(designData);
  if (designError) throw new Error(designError);

  const voiceId = designData?.voice_id;
  if (typeof voiceId !== 'string' || !voiceId) {
    throw new Error('MiniMax voice design response did not include a voice_id.');
  }
  const previewBytes = decodeHex(designData?.trial_audio, 'trial_audio');

  await mkdir(outDir, { recursive: true });
  await writeFile(previewPath, previewBytes);

  let auditionWritten = false;
  try {
    const ttsData = await postJson(TTS_ENDPOINT, key, {
      model,
      text: languageText.persistence,
      voice_setting: { voice_id: voiceId, speed: options.speed, vol: options.vol },
      audio_setting: { format: 'mp3', sample_rate: 32000 },
      language_boost: options.lang,
    });
    const ttsError = baseRespError(ttsData);
    if (ttsError) {
      console.warn(`Warning: ${ttsError}; voice persistence/audition was not confirmed.`);
    } else {
      const auditionBytes = decodeHex(ttsData?.data?.audio, 'TTS');
      await writeFile(auditionPath, auditionBytes);
      auditionWritten = true;
    }
  } catch (error) {
    console.warn(`Warning: ${error.message}; voice persistence/audition was not confirmed.`);
  }

  provenance.push({
    method: 'voice_design',
    note: 'synthetic voice generated from a text description; no human reference audio used; not modeled on any real or public person',
    voice_id: voiceId,
    prompt: options.prompt,
    preview_text: options.preview,
    language: options.lang,
    model,
    created: new Date().toISOString(),
    commercial_route: 'MiniMax Open Platform / API (voice_design), per platform.minimax.io',
  });
  await writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  console.log(`voice_id: ${voiceId}`);
  console.log(`preview: ${previewPath}`);
  console.log(
    `audition: ${auditionPath}${auditionWritten ? '' : ' (not written; persistence/audition failed)'}`
  );
  console.log(`MINIMAX_VOICE_ID=${voiceId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
