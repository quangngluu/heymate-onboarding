import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://api.hume.ai';
const DEFAULT_OUT_DIR = './voice-out-hume';
const DEFAULT_FORMAT = 'wav';
const PROVENANCE_PATH = fileURLToPath(
  new URL('./voice-provenance-hume.json', import.meta.url)
);

// This description must NEVER name or imply a real or celebrity person — that is what keeps the voice non-identifiable.
const HUME_VOICE_DESCRIPTION =
  'Female voice with a neutral, clear, and pleasant tone, designed for use in a consumer device. Native or near-native standard English pronunciation with a neutral international accent. Medium pitch, balanced resonance, natural pacing, and clear articulation. The voice should feel calm, approachable, reliable, and easy to listen to repeatedly throughout the day. Friendly without sounding overly cheerful, emotional, theatrical, or promotional. Use subtle natural warmth and a light conversational quality while maintaining consistency across short system messages, notifications, confirmations, and everyday interactions. Avoid strong regional accents, exaggerated personality, excessive breathiness, high-pitched or childish qualities, robotic delivery, announcer-style speech, and distinctive celebrity-like mannerisms. Overall character: neutral, modern, clear, trustworthy, unobtrusive, and suitable for long-term use as a device voice.';
const DEFAULT_PREVIEW_TEXT =
  "Hi, I'm your Heymate base. Let's get you online for fastest setup — open the Heymates app and tap Set Up a New Device.";

function parseArgs(argv) {
  const options = {
    description: HUME_VOICE_DESCRIPTION,
    text: DEFAULT_PREVIEW_TEXT,
    num: 1,
    pick: 0,
    name: undefined,
    voiceId: undefined,
    synth: false,
    batchPath: undefined,
    format: DEFAULT_FORMAT,
    outDir: DEFAULT_OUT_DIR,
  };

  const flags = {
    '--description': 'description',
    '--text': 'text',
    '--num': 'num',
    '--pick': 'pick',
    '--name': 'name',
    '--voice': 'voiceId',
    '--batch': 'batchPath',
    '--format': 'format',
    '--out': 'outDir',
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

  options.num = Number(options.num);
  options.pick = Number(options.pick);

  if (options.batchPath === undefined) {
    if (!options.description.trim()) throw new Error('--description cannot be empty.');
    if (options.description.length > 1000) {
      throw new Error('--description must be 1000 characters or fewer.');
    }
    if (!options.text.trim()) throw new Error('--text cannot be empty.');
    if (options.text.length > 5000) throw new Error('--text must be 5000 characters or fewer.');
  }
  if (!Number.isInteger(options.num) || options.num < 1 || options.num > 5) {
    throw new Error('--num must be an integer from 1 to 5.');
  }
  if (!Number.isInteger(options.pick) || options.pick < 0 || options.pick >= options.num) {
    throw new Error('--pick must be an integer from 0 to one less than --num.');
  }
  if (options.name !== undefined && !options.name.trim()) {
    throw new Error('--name cannot be empty.');
  }
  if (options.voiceId !== undefined && !options.voiceId.trim()) {
    throw new Error('--voice cannot be empty.');
  }
  if (options.batchPath !== undefined && !options.batchPath.trim()) {
    throw new Error('--batch cannot be empty.');
  }
  if (!['wav', 'mp3', 'pcm'].includes(options.format)) {
    throw new Error('--format must be one of: wav, mp3, pcm.');
  }
  if (!options.outDir.trim()) throw new Error('--out cannot be empty.');
  if (options.batchPath !== undefined && !options.voiceId) {
    throw new Error('--voice is required with --batch.');
  }
  if (options.batchPath === undefined && options.synth && !options.voiceId) {
    throw new Error('--voice is required with --synth.');
  }

  return options;
}

function findMessage(value) {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.message === 'string' && value.message.trim()) return value.message;

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') {
      const message = findMessage(nested);
      if (message) return message;
    }
  }
  return undefined;
}

async function postJson(url, key, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Hume-Api-Key': key,
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
    if (!response.ok) {
      throw new Error(`Hume HTTP ${response.status}: ${response.statusText || 'invalid JSON'}`);
    }
    throw new Error(`Hume returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const detail = findMessage(data) || response.statusText || 'Unknown error';
    throw new Error(`Hume HTTP ${response.status}: ${detail}`);
  }

  return data;
}

function decodeBase64(audio, label) {
  if (typeof audio !== 'string' || !audio) {
    throw new Error(`Hume returned invalid ${label} base64 audio.`);
  }

  const normalized = audio.replace(/\s+/g, '');
  if (
    !normalized ||
    normalized.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error(`Hume returned invalid ${label} base64 audio.`);
  }

  const bytes = Buffer.from(normalized, 'base64');
  if (!bytes.length) throw new Error(`Hume returned empty ${label} audio.`);
  return bytes;
}

function parseGenerations(data, label) {
  if (!Array.isArray(data?.generations) || data.generations.length === 0) {
    throw new Error(`Hume ${label} response did not include any generations.`);
  }

  return data.generations.map((generation, index) => {
    const generationId = generation?.generation_id;
    if (typeof generationId !== 'string' || !generationId) {
      throw new Error(`Hume ${label} generation ${index} did not include a generation_id.`);
    }
    return {
      generationId,
      audio: decodeBase64(generation.audio, `${label} generation ${index}`),
    };
  });
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

function synthBody(text, voiceId, format) {
  return {
    utterances: [
      {
        text,
        voice: { id: voiceId, provider: 'CUSTOM_VOICE' },
      },
    ],
    format: { type: format },
  };
}

async function readBatch(batchPath) {
  let items;
  try {
    items = JSON.parse(await readFile(batchPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${batchPath} is not valid JSON.`);
    }
    throw error;
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${batchPath} must contain a non-empty JSON array.`);
  }

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Batch item ${index} must be an object.`);
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`Batch item ${index} must have a non-empty string id.`);
    }
    if (typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error(`Batch item ${index} must have non-empty string text.`);
    }
  }

  return items;
}

function resolveBatchOutput(outDir, filename) {
  const outputPath = resolve(outDir, filename);
  const relativePath = relative(outDir, outputPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Batch id resolves outside the output directory: ${filename}`);
  }
  return outputPath;
}

async function runBatch(options, ttsUrl, key, outDir) {
  const batchPath = resolve(options.batchPath);
  const items = await readBatch(batchPath);
  const extension = options.format === 'pcm' ? 'pcm' : options.format;
  const manifest = [];

  await mkdir(outDir, { recursive: true });

  for (const [index, item] of items.entries()) {
    const filename = `${item.id}.${extension}`;
    const entry = {
      id: item.id,
      text: item.text,
      file: item.file || null,
      fw_const: item.fw_const || null,
      audience: item.audience || null,
      wav: null,
      bytes: null,
      status: 'error',
    };

    try {
      const data = await postJson(
        ttsUrl,
        key,
        synthBody(item.text, options.voiceId, options.format)
      );
      const [generation] = parseGenerations(data, `batch item ${item.id}`);
      await writeFile(resolveBatchOutput(outDir, filename), generation.audio);

      entry.wav = filename;
      entry.bytes = generation.audio.length;
      entry.status = 'ok';
      entry.generation_id = generation.generationId;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }

    manifest.push(entry);

    if (index < items.length - 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }
  }

  const manifestPath = resolve(outDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const okCount = manifest.filter((entry) => entry.status === 'ok').length;
  const errorIds = manifest
    .filter((entry) => entry.status === 'error')
    .map((entry) => entry.id);

  console.log(`batch: total=${manifest.length} ok=${okCount} errors=${errorIds.length}`);
  if (errorIds.length) console.log(`error_ids: ${errorIds.join(', ')}`);
  console.log(`manifest: ${manifestPath}`);

  if (okCount === 0) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = process.env.HUME_API_KEY;
  if (!key) {
    console.error('HUME_API_KEY is required.');
    process.exit(1);
  }

  const baseUrl = (process.env.HUME_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const ttsUrl = `${baseUrl}/v0/tts`;
  const voicesUrl = `${baseUrl}/v0/tts/voices`;
  const outDir = resolve(options.outDir);

  if (options.batchPath !== undefined) {
    await runBatch(options, ttsUrl, key, outDir);
    return;
  }

  if (options.synth) {
    const synthData = await postJson(
      ttsUrl,
      key,
      synthBody(options.text, options.voiceId, options.format)
    );
    const [generation] = parseGenerations(synthData, 'synthesis');
    const synthPath = resolve(outDir, `synth.${options.format}`);

    await mkdir(outDir, { recursive: true });
    await writeFile(synthPath, generation.audio);

    console.log(`voice_id: ${options.voiceId}`);
    console.log(`synth: ${synthPath}`);
    console.log(`text: ${options.text}`);
    return;
  }

  const provenance = await readProvenance();
  const designData = await postJson(ttsUrl, key, {
    utterances: [{ text: options.text, description: options.description }],
    num_generations: options.num,
    format: { type: options.format },
  });
  const generations = parseGenerations(designData, 'voice design');
  if (!generations[options.pick]) {
    throw new Error(
      `Hume returned ${generations.length} generation(s), so --pick ${options.pick} is unavailable.`
    );
  }

  await mkdir(outDir, { recursive: true });
  for (const [index, generation] of generations.entries()) {
    const filename = options.num === 1 ? `preview.${options.format}` : `preview-${index}.${options.format}`;
    const previewPath = resolve(outDir, filename);
    await writeFile(previewPath, generation.audio);
    console.log(`${index} -> ${generation.generationId}: ${previewPath}`);
  }

  const picked = generations[options.pick];
  let savedVoiceId = null;
  let savedVoiceName = null;
  let auditionPath;

  if (options.name !== undefined) {
    const savedVoice = await postJson(voicesUrl, key, {
      generation_id: picked.generationId,
      name: options.name,
    });
    if (typeof savedVoice?.id !== 'string' || !savedVoice.id) {
      throw new Error('Hume save-voice response did not include a voice id.');
    }

    savedVoiceId = savedVoice.id;
    savedVoiceName =
      typeof savedVoice.name === 'string' && savedVoice.name ? savedVoice.name : options.name;

    const auditionData = await postJson(
      ttsUrl,
      key,
      synthBody(options.text, savedVoiceId, options.format)
    );
    const [audition] = parseGenerations(auditionData, 'audition');
    auditionPath = resolve(outDir, `audition.${options.format}`);
    await writeFile(auditionPath, audition.audio);

    console.log(`voice_id: ${savedVoiceId}`);
    console.log(`audition: ${auditionPath}`);
  }

  provenance.push({
    vendor: 'Hume AI (Octave)',
    method: 'voice_design (description-based, synthetic; no reference audio)',
    note: 'not modeled on any real or public person',
    description: options.description,
    text: options.text,
    num_generations: options.num,
    picked_index: options.pick,
    generation_id: picked.generationId,
    saved_voice_id: savedVoiceId,
    saved_voice_name: savedVoiceName,
    format: options.format,
    created: new Date().toISOString(),
    commercial_route:
      'Hume TTS commercial tier (Creator/Pro/Scale/Business/Enterprise); user retains rights to custom voices per Hume docs',
  });
  await writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  console.log(`picked_generation_id: ${picked.generationId}`);
  console.log(`provenance: ${PROVENANCE_PATH}`);
  if (savedVoiceId) console.log(`HUME_VOICE_ID=${savedVoiceId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
