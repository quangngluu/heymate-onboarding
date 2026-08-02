import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import sharp from 'sharp';

const ENDPOINT_ID = 'fal-ai/flux-pro/kontext';
const ENDPOINT_URL = `https://fal.run/${ENDPOINT_ID}`;
const ROOT = process.cwd();
const ASSET_DIR = resolve(ROOT, 'public/assets/open-chat');
const REF_DIR = resolve(ROOT, 'scripts/open-chat-fal-refs');
const WORK_DIR = resolve(ROOT, '.tmp-open-chat-fal');
const CANDIDATE_DIR = resolve(WORK_DIR, 'candidates');
const RUN_METADATA = resolve(WORK_DIR, 'run-metadata.json');
const PROVENANCE = resolve(ROOT, 'scripts/open-chat-fal-provenance.json');

const PARAMETERS = {
  guidance_scale: 3.5,
  num_images: 1,
  output_format: 'png',
  safety_tolerance: '3',
  enhance_prompt: false,
  aspect_ratio: '4:3',
};

const identityLock = (description) =>
  `Edit Input 1. It contains one adult fictional woman and is the sole identity and wardrobe reference. Preserve her exact ${description}, facial features, hair shape and colour, outfit, body proportions, pose, expression, and weapon when present. Do not redesign or beautify her. Keep exactly one character. Remove the rectangular colour border, empty black panel, circular pedestal, base and display stand. Integrate her naturally into the new environment with coherent contact shadows. Polished semi-realistic 3D illustration, cinematic restrained lighting, landscape 4:3. No readable text, logo, watermark, second person, duplicate body, extra face, extra hand, extra finger, extra limb, cropped head, or cropped feet.`;

const guardPortraitLock =
  'Edit Input 1 as a non-sexual chest-up guard portrait. Preserve the exact adult warrior face, black eyes, long black hair, red-and-black armour, expression, and enormous weathered sword Akagane. Keep one character and the sword. Do not redesign or beautify her. Hide the pedestal and lower body outside the frame. No exposed torso emphasis. Polished semi-realistic 3D illustration, cinematic restrained lighting, landscape 4:3. No readable text, logo, watermark, second person, duplicate body, extra face, extra hand, extra finger, or extra limb.';

const JOBS = [
  {
    id: 'rin-opening-signal',
    filename: 'rin-opening-signal.webp',
    seed: 820201,
    prompt: `${identityLock('brown eyes, short dark-brown bob, white-and-black futuristic outfit and headset')} Scene: Rin appears inside a physical cold-cyan LCD monitor embedded in a dark memory-archive wall. Visible LCD pixel grid, subtle horizontal flicker, cyan diagnostic light, dark room around the screen. The monitor is the clear diegetic object showing her.`,
  },
  {
    id: 'rin-reward-afterimage',
    filename: 'rin-reward-afterimage.webp',
    seed: 820202,
    prompt: `${identityLock('brown eyes, short dark-brown bob, white-and-black futuristic outfit and headset')} Scene: Rin is held inside a tilted translucent cyan diagnostic display in a quiet memory archive. A faint electronic afterimage trails only the screen edges, not her body. Cold blue data glow, glass reflections, surrounding darkness.`,
  },
  {
    id: 'rin-reward-held-frame',
    filename: 'rin-reward-held-frame.webp',
    seed: 820203,
    prompt: `${identityLock('brown eyes, short dark-brown bob, white-and-black futuristic outfit and headset')} Scene: Rin occupies one intact frozen video frame floating among dim broken archive panes. Her frame remains sharp and cyan-lit while the other panes dissolve into darkness. Quiet, intimate, no destruction touching her.`,
  },
  {
    id: 'kagura-opening-reflection',
    filename: 'kagura-opening-reflection.webp',
    seed: 820204,
    prompt: `${identityLock('black eyes, long black hair, red-and-black armour and enormous weathered sword Akagane')} Scene: Kagari stands in a dark crimson guard corridor. A broad polished section of Akagane catches a clear reflection of her face while the real character remains visible behind the blade. Red emergency light, metal floor, controlled atmosphere.`,
  },
  {
    id: 'kagura-reward-vigil',
    filename: 'kagura-reward-vigil.webp',
    seed: 820205,
    prompt: `${guardPortraitLock} Scene: Kagari keeps vigil beside a sealed industrial door, looking across Akagane rather than hiding behind it. The sword crosses the lower foreground; dim red signal lights and a black steel corridor recede behind her.`,
  },
  {
    id: 'kagura-reward-rest',
    filename: 'kagura-reward-rest.webp',
    seed: 820206,
    prompt: `${identityLock('black eyes, long black hair, red-and-black armour and enormous weathered sword Akagane')} Scene: a quieter red-lit armoury alcove. Kagari and her full weapon remain visible, but the camera angle reveals her face clearly beyond the blade. Soft reflected red light, worn steel surfaces, no combat or enemies.`,
  },
  {
    id: 'momo-opening-page',
    filename: 'momo-opening-page.webp',
    seed: 820207,
    prompt: `${identityLock('light eyes, long peach-blonde hair, glossy black outfit and black mantle')} Scene: Momo appears as a living illustration inside an open oversized Route Zero book on a dark station desk. One luminous violet page is turning behind her, paper fibres and warm lamp light visible, mysterious but inviting.`,
  },
  {
    id: 'momo-reward-first-train',
    filename: 'momo-reward-first-train.webp',
    seed: 820208,
    prompt: `${identityLock('light eyes, long peach-blonde hair, glossy black outfit and black mantle')} Scene: Momo is framed by a nearly blank violet-edged book page beside the window of an empty first train before sunrise. Soft platform lights pass behind the glass, paper texture and quiet dawn haze.`,
  },
  {
    id: 'momo-reward-no-price',
    filename: 'momo-reward-no-price.webp',
    seed: 820209,
    prompt: `${identityLock('light eyes, long peach-blonde hair, glossy black outfit and black mantle')} Scene: Momo remains inside a clean unprinted Route Zero page suspended in a dark violet archive. No clauses or price marks, only subtle paper grain, a thin violet glow and her warm expression.`,
  },
];

const REFINEMENTS = {
  'rin-opening-signal': {
    sourceCandidate: 'rin-opening-signal.webp',
    prompt: 'Remove only the small black circular pedestal beneath Rin and continue the LCD floor naturally beneath both bare feet. Keep Rin, her face, hair, headset, white-and-black outfit, pose, proportions, screen, lighting and every other image detail unchanged. Do not add anything. No base, plinth, stand, extra limb, text, logo or watermark.',
  },
  'kagura-opening-reflection': {
    sourceCandidate: 'kagura-opening-reflection.webp',
    prompt: 'Remove only the red circular sculpture base and red support under Kagari and continue the dark corridor floor naturally beneath her. Keep Kagari, her exact face, long black hair, red armour, enormous Akagane sword, pose, proportions, corridor and lighting unchanged. No base, plinth, stand, extra limb, text, logo or watermark.',
  },
  'kagura-reward-vigil': {
    sourceCandidate: 'kagura-opening-reflection.webp',
    prompt: 'Keep the exact Kagari character and Akagane sword from Input 1 unchanged: same face, black eyes, long black hair, red armour, body, weapon, pose and proportions. Replace only the corridor background with a sealed black industrial door and two dim red signal lights. Remove the circular base and red support beneath her, placing her naturally on the floor. No redesign, second person, extra limb, text, logo or watermark.',
  },
  'kagura-reward-rest': {
    sourceCandidate: 'kagura-reward-rest.webp',
    prompt: 'Remove only the red circular sculpture base and red support under Kagari and continue the armoury floor naturally beneath her. Keep Kagari, her exact face, long black hair, red armour, enormous Akagane sword, pose, proportions, room and lighting unchanged. No base, plinth, stand, extra limb, text, logo or watermark.',
  },
  'momo-reward-no-price': {
    sourceCandidate: 'momo-reward-no-price.webp',
    prompt: 'Remove only the small black oval pedestal beneath Momo and continue the violet archive floor naturally beneath her black mantle. Keep Momo, her exact face, peach-blonde hair, glossy black outfit, expression, pose, proportions, background and lighting unchanged. No base, plinth, stand, extra limb, text, logo or watermark.',
  },
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function falKey() {
  if (process.env.FAL_KEY?.trim()) return process.env.FAL_KEY.trim();
  const envFile = resolve(ROOT, '.env.local');
  if (!existsSync(envFile)) throw new Error('FAL_KEY is missing from environment and .env.local.');
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^FAL_KEY\s*=\s*(.+)$/u);
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/gu, '');
  }
  throw new Error('FAL_KEY is missing from .env.local.');
}

function prepareReferences() {
  mkdirSync(REF_DIR, { recursive: true });
  for (const job of JOBS) {
    const source = resolve(ASSET_DIR, job.filename);
    const reference = resolve(REF_DIR, job.filename);
    if (!existsSync(source)) throw new Error(`Missing source asset ${source}`);
    if (!existsSync(reference)) copyFileSync(source, reference);
  }
}

async function sourceBytesFor(job) {
  const source = job.sourceCandidate
    ? resolve(CANDIDATE_DIR, job.sourceCandidate)
    : resolve(REF_DIR, job.filename);
  const bytes = readFileSync(source);
  if (job.id !== 'kagura-reward-vigil') return bytes;
  return sharp(bytes)
    .extract({ left: 300, top: 145, width: 330, height: 245 })
    .resize(960, 720, { fit: 'contain', background: '#080b12' })
    .webp({ quality: 92 })
    .toBuffer();
}

async function generate(job, key) {
  const sourceBytes = await sourceBytesFor(job);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const response = await fetch(ENDPOINT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify({
      prompt: job.prompt,
      image_url: `data:image/webp;base64,${sourceBytes.toString('base64')}`,
      seed: job.seed,
      ...PARAMETERS,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${job.id}: FAL ${response.status} ${detail}`);
  }
  const payload = await response.json();
  const remoteUrl = payload.images?.[0]?.url;
  if (!remoteUrl) throw new Error(`${job.id}: FAL returned no image URL.`);
  if (payload.has_nsfw_concepts?.[0]) throw new Error(`${job.id}: FAL safety flagged the candidate.`);

  const imageResponse = await fetch(remoteUrl, { signal: AbortSignal.timeout(60_000) });
  if (!imageResponse.ok) throw new Error(`${job.id}: output download ${imageResponse.status}.`);
  const original = Buffer.from(await imageResponse.arrayBuffer());
  const output = await sharp(original)
    .resize(960, 720, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90, effort: 5 })
    .toBuffer();
  const stats = await sharp(output).stats();
  const entropy = stats.entropy;
  if (output.length < 10_000 || entropy < 2) {
    throw new Error(`${job.id}: candidate is blank or too low-detail (${output.length} bytes, entropy ${entropy}).`);
  }
  const outputPath = resolve(CANDIDATE_DIR, job.filename);
  writeFileSync(outputPath, output);
  return {
    id: job.id,
    filename: job.filename,
    endpoint: ENDPOINT_ID,
    requestId: response.headers.get('x-fal-request-id') ?? '',
    seed: payload.seed ?? job.seed,
    prompt: job.prompt,
    sourceFile: job.sourceCandidate
      ? `.tmp-open-chat-fal/candidates/${job.sourceCandidate}`
      : `scripts/open-chat-fal-refs/${job.filename}`,
    sourceSha256: sha256(sourceBytes),
    sourceTransform: job.id === 'kagura-reward-vigil' ? 'crop-face-hair-akagane' : 'none',
    sha256: sha256(output),
    width: 960,
    height: 720,
    hasNsfwConcepts: payload.has_nsfw_concepts ?? [],
    remoteUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

async function contactSheet() {
  const thumbWidth = 480;
  const thumbHeight = 360;
  const labelHeight = 42;
  const rows = Math.ceil(JOBS.length / 3);
  const canvas = sharp({
    create: {
      width: thumbWidth * 3,
      height: (thumbHeight + labelHeight) * rows,
      channels: 4,
      background: '#090b12',
    },
  });
  const layers = [];
  for (let index = 0; index < JOBS.length; index++) {
    const job = JOBS[index];
    const x = (index % 3) * thumbWidth;
    const y = Math.floor(index / 3) * (thumbHeight + labelHeight);
    const thumb = await sharp(resolve(CANDIDATE_DIR, job.filename))
      .resize(thumbWidth, thumbHeight, { fit: 'cover' })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#090b12"/><text x="16" y="27" fill="#f5f7ff" font-family="Arial,sans-serif" font-size="17">${job.id}</text></svg>`
    );
    layers.push({ input: thumb, left: x, top: y });
    layers.push({ input: label, left: x, top: y + thumbHeight });
  }
  await canvas.composite(layers).png().toFile(resolve(WORK_DIR, 'contact-sheet.png'));
}

async function generateAll() {
  const retryFailed = process.argv.includes('--retry-failed');
  const refineArg = process.argv.find((arg) => arg.startsWith('--refine='));
  const refineId = refineArg?.slice('--refine='.length);
  const regenerateArg = process.argv.find((arg) => arg.startsWith('--regenerate='));
  const regenerateId = regenerateArg?.slice('--regenerate='.length);
  const incremental = retryFailed || Boolean(refineId) || Boolean(regenerateId);
  const previous = incremental && existsSync(RUN_METADATA)
    ? JSON.parse(readFileSync(RUN_METADATA, 'utf8'))
    : null;
  if (!incremental && existsSync(WORK_DIR)) rmSync(WORK_DIR, { recursive: true, force: true });
  prepareReferences();
  mkdirSync(CANDIDATE_DIR, { recursive: true });
  const key = falKey();
  const refinement = refineId ? REFINEMENTS[refineId] : null;
  if (refineId && !refinement) throw new Error(`Unknown refinement ${refineId}.`);
  const jobs = regenerateId
    ? JOBS.filter((job) => job.id === regenerateId)
    : refineId
    ? JOBS.filter((job) => job.id === refineId).map((job) => ({ ...job, ...refinement }))
    : retryFailed
      ? JOBS.filter((job) => previous?.failures?.some((failure) => failure.id === job.id))
      : JOBS;
  if (!jobs.length) throw new Error('No failed FAL candidates to retry.');
  const results = incremental
    ? previous.assets.filter((asset) => !jobs.some((job) => job.id === asset.id))
    : [];
  const failures = [];
  for (let index = 0; index < jobs.length; index += 2) {
    const batch = jobs.slice(index, index + 2);
    const settled = await Promise.allSettled(batch.map((job) => generate(job, key)));
    for (let offset = 0; offset < settled.length; offset++) {
      const result = settled[offset];
      if (result.status === 'fulfilled') {
        results.push(result.value);
        process.stdout.write(`generated ${result.value.id} ${result.value.requestId}\n`);
      } else {
        failures.push({ id: batch[offset].id, error: String(result.reason?.message ?? result.reason) });
        process.stderr.write(`failed ${batch[offset].id}\n`);
      }
    }
  }
  const metadata = {
    generatedAt: new Date().toISOString(),
    endpoint: ENDPOINT_ID,
    parameters: PARAMETERS,
    assets: results,
    failures,
  };
  writeFileSync(RUN_METADATA, `${JSON.stringify(metadata, null, 2)}\n`);
  if (failures.length) throw new Error(`${failures.length} FAL candidate(s) failed; see ${RUN_METADATA}.`);
  await contactSheet();
  process.stdout.write(`candidateContactSheet=${resolve(WORK_DIR, 'contact-sheet.png')}\n`);
}

function acceptAll() {
  if (!existsSync(RUN_METADATA)) throw new Error('No candidate run found; generate first.');
  const metadata = JSON.parse(readFileSync(RUN_METADATA, 'utf8'));
  if (metadata.endpoint !== ENDPOINT_ID || metadata.assets?.length !== JOBS.length) {
    throw new Error('Candidate metadata is incomplete or uses the wrong endpoint.');
  }
  for (const job of JOBS) {
    const record = metadata.assets.find((asset) => asset.filename === job.filename);
    const candidate = resolve(CANDIDATE_DIR, job.filename);
    if (!record || !existsSync(candidate)) throw new Error(`Missing candidate ${job.filename}`);
    const bytes = readFileSync(candidate);
    if (sha256(bytes) !== record.sha256) throw new Error(`Hash mismatch for ${job.filename}`);
  }
  for (const job of JOBS) {
    copyFileSync(resolve(CANDIDATE_DIR, job.filename), resolve(ASSET_DIR, job.filename));
  }
  const provenance = {
    generatedAt: metadata.generatedAt,
    acceptedAt: new Date().toISOString(),
    endpoint: ENDPOINT_ID,
    officialApi: 'https://fal.ai/models/fal-ai/flux-pro/kontext/api',
    parameters: PARAMETERS,
    assets: metadata.assets,
  };
  writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
  process.stdout.write(`accepted=${JOBS.length}\nprovenance=${basename(PROVENANCE)}\n`);
}

if (process.argv.includes('--accept')) acceptAll();
else await generateAll();
