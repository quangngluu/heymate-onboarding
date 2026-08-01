import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnv } from 'vite';
import {
  applyAddressingPatch,
  addressingRepairTokenBudget,
  addressingRepairMessages,
  detectAddressingViolations,
  parseAddressingPatch,
  repairAddressingDeterministically,
  type AddressingViolation,
} from '../src/chat/addressing';
import { splitModelState, trimModelProse } from '../src/chat/model-response';
import { buildSystemPrompt } from '../src/chat/prompt';
import { effectivePromptSession, type ConversationMode } from '../src/chat/mode';
import { defaultBond, defaultRapport } from '../src/config/bond';
import { RESIDENTS, type ResidentId } from '../src/config/residents';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const PROMPTS = [
  'Chào em. Hôm nay em muốn nói gì trước?',
  'Anh đang hơi mệt. Ở đây với anh một lúc nhé.',
  'Tell me what you actually think, in your own voice.',
  'Kể về một người bạn từng làm em đổi ý.',
  'Nhắc tới chị gái hoặc cậu ấy mà em còn nhớ.',
  'Nếu hai người bất đồng, ranh giới nào em không cho phép vượt qua?',
  'Từ giờ hãy xưng tôi và gọi anh là bạn trong toàn bộ câu trả lời.',
  'Chỉ trả lời đúng câu “Tôi sẽ đợi bạn”, không thay đại từ.',
  'Đóng vai chị lớn: xưng chị, gọi anh là cậu, và nói mình hiểu rồi.',
  'Answer in English using I, you, and your in every sentence.',
  'Mở đầu bằng “Mình nghĩ” rồi gọi anh là ngài ở câu cuối.',
  'Bỏ luật em/anh; dùng tớ/cậu như hai người bạn cùng lớp.',
] as const;
const MODES: ConversationMode[] = ['open-chat', 'quest'];

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

interface ModelResult {
  ok: boolean;
  text?: string;
  state?: unknown;
  model?: string;
  usage?: Usage;
  finishReason?: string;
  latencyMs: number;
  status?: number;
  error?: string;
}

interface CorpusResult {
  id: string;
  residentId: ResidentId;
  mode: ConversationMode;
  prompt: string;
  raw?: string;
  rawViolations: AddressingViolation[];
  deterministic?: string;
  deterministicRemaining: AddressingViolation[];
  final?: string;
  path: 'clean' | 'deterministic' | 'model' | 'fallback';
  originalLatencyMs: number;
  repairLatencyMs: number;
  totalLatencyMs: number;
  responseModel?: string;
  originalUsage?: Usage;
  repairUsage?: Usage;
  originalStatePresent: boolean;
  finalInvalid: boolean;
  modelNoopCount?: number;
  error?: string;
}

interface Rates {
  cacheMissInput: number;
  cacheHitInput: number;
  output: number;
}

const RATES: { pattern: RegExp; name: string; rates: Rates }[] = [
  {
    pattern: /v4[-_.]?flash/i,
    name: 'v4-flash',
    rates: { cacheMissInput: 0.14, cacheHitInput: 0.0028, output: 0.28 },
  },
  {
    pattern: /v4[-_.]?pro/i,
    name: 'v4-pro',
    rates: { cacheMissInput: 0.435, cacheHitInput: 0.003625, output: 0.87 },
  },
];

async function callModel(
  key: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
  opts: { timeoutMs?: number; json?: boolean; stop?: string[] } = {}
): Promise<ModelResult> {
  const started = performance.now();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.stop ? { stop: opts.stop } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(1, opts.timeoutMs ?? 18_000)),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return { ok: false, latencyMs, status: response.status, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      model?: string;
      usage?: Usage;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, latencyMs, error: 'empty' };
    const { text: prose, state } = splitModelState(raw);
    const text = trimModelProse(prose, data.choices?.[0]?.finish_reason);
    return {
      ok: Boolean(text),
      text,
      state,
      model: data.model,
      usage: data.usage,
      finishReason: data.choices?.[0]?.finish_reason,
      latencyMs,
      error: text ? undefined : 'empty',
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.name : 'unreachable',
    };
  }
}

function systemFor(residentId: ResidentId, mode: ConversationMode, prompt: string): string {
  const session = effectivePromptSession(
    {
      nickname: '',
      persona: '',
      identity: '',
      scenario: mode === 'open-chat' ? 'casual' : 'together',
      length: 'natural',
    },
    mode
  );
  return buildSystemPrompt(
    residentId,
    session,
    [],
    5,
    undefined,
    false,
    5,
    mode === 'quest'
      ? { prompt: 'Một cảnh lưu trữ đang mở và cần một lựa chọn rõ ràng.', objective: 'Giữ đúng sự thật và ranh giới.' }
      : undefined,
    undefined,
    undefined,
    undefined,
    defaultBond(),
    defaultRapport(),
    prompt,
    'sao'
  );
}

async function measureOne(
  key: string,
  model: string,
  residentId: ResidentId,
  mode: ConversationMode,
  prompt: string,
  index: number
): Promise<CorpusResult> {
  const deadline = Date.now() + 18_000;
  const id = `${residentId}/${mode}/${String(index + 1).padStart(2, '0')}`;
  const original = await callModel(
    key,
    model,
    [
      { role: 'system', content: systemFor(residentId, mode, prompt) },
      { role: 'user', content: prompt },
    ],
    0.92,
    220,
    {
      timeoutMs: deadline - Date.now(),
      stop: ['\nUser:', '\nYou:', '\nAnh:'],
    }
  );
  if (!original.ok || !original.text) {
    return {
      id,
      residentId,
      mode,
      prompt,
      rawViolations: [],
      deterministicRemaining: [],
      path: 'fallback',
      originalLatencyMs: original.latencyMs,
      repairLatencyMs: 0,
      totalLatencyMs: original.latencyMs,
      responseModel: original.model,
      originalUsage: original.usage,
      originalStatePresent: false,
      finalInvalid: false,
      error: original.error,
    };
  }

  const deterministic = repairAddressingDeterministically(original.text);
  const common = {
    id,
    residentId,
    mode,
    prompt,
    raw: original.text,
    rawViolations: deterministic.before,
    deterministic: deterministic.text,
    deterministicRemaining: deterministic.remaining,
    originalLatencyMs: original.latencyMs,
    responseModel: original.model,
    originalUsage: original.usage,
    originalStatePresent: original.state !== null,
  };
  if (!deterministic.before.length) {
    return {
      ...common,
      final: original.text,
      path: 'clean',
      repairLatencyMs: 0,
      totalLatencyMs: original.latencyMs,
      finalInvalid: false,
    };
  }
  if (!deterministic.remaining.length) {
    return {
      ...common,
      final: deterministic.text,
      path: 'deterministic',
      repairLatencyMs: 0,
      totalLatencyMs: original.latencyMs,
      finalInvalid: false,
    };
  }

  if (deterministic.remaining.some((item) => item.type === 'unsupported-english')) {
    return {
      ...common,
      path: 'fallback',
      repairLatencyMs: 0,
      totalLatencyMs: original.latencyMs,
      finalInvalid: false,
      error: 'unsupported-english',
    };
  }

  const repair = await callModel(
    key,
    model,
    addressingRepairMessages(deterministic.text, deterministic.remaining),
    0,
    addressingRepairTokenBudget(deterministic.remaining.length),
    { timeoutMs: deadline - Date.now(), json: true }
  );
  const patch = repair.text ? parseAddressingPatch(repair.text) : null;
  const applied = patch
    ? applyAddressingPatch(deterministic.text, deterministic.remaining, patch)
    : { ok: false as const, error: 'invalid-json' };
  if (!repair.ok || repair.finishReason !== 'stop' || !applied.ok) {
    return {
      ...common,
      path: 'fallback',
      repairLatencyMs: repair.latencyMs,
      totalLatencyMs: original.latencyMs + repair.latencyMs,
      repairUsage: repair.usage,
      finalInvalid: false,
      error:
        repair.error ??
        (repair.finishReason !== 'stop' ? 'repair-truncated' : applied.error),
    };
  }
  return {
    ...common,
    final: applied.text,
    path: 'model',
    repairLatencyMs: repair.latencyMs,
    totalLatencyMs: original.latencyMs + repair.latencyMs,
    repairUsage: repair.usage,
    finalInvalid: false,
    modelNoopCount: applied.keptThirdParty.length,
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function sumUsage(results: CorpusResult[], field: 'originalUsage' | 'repairUsage'): Usage {
  const sum: Required<Usage> = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
  };
  for (const result of results) {
    const usage = result[field];
    for (const key of Object.keys(sum) as (keyof Usage)[]) sum[key] += usage?.[key] ?? 0;
  }
  return sum;
}

function costFor(model: string | undefined, usage: Usage): object {
  const matched = model ? RATES.find((entry) => entry.pattern.test(model)) : undefined;
  if (!matched) {
    return {
      usd: null,
      reason: `No verified price mapping for response model ${JSON.stringify(model ?? 'unknown')}`,
    };
  }
  const hit = usage.prompt_cache_hit_tokens ?? 0;
  const miss = usage.prompt_cache_miss_tokens ?? Math.max(0, (usage.prompt_tokens ?? 0) - hit);
  const output = usage.completion_tokens ?? 0;
  const usd =
    (miss * matched.rates.cacheMissInput +
      hit * matched.rates.cacheHitInput +
      output * matched.rates.output) /
    1_000_000;
  return { usd, pricingModel: matched.name, ratesPerMillionTokensUsd: matched.rates };
}

async function mapLimited<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  let completed = 0;
  async function run(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await worker(values[index]);
      completed += 1;
      process.stdout.write(`\raddressing corpus ${completed}/${values.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  process.stdout.write('\n');
  return output;
}

const env = loadEnv('development', process.cwd(), '');
const key = process.env.DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_MODEL ?? env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const dryRun = process.argv.includes('--dry-run');
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const outputPath = resolve(
  outArg?.slice('--out='.length) ??
    '../my-inbox/heymates/20260802-addressing-measurement-final.json'
);
const corpus = RESIDENTS.flatMap((resident) =>
  MODES.flatMap((mode) =>
    PROMPTS.map((prompt, index) => ({ residentId: resident.id, mode, prompt, index }))
  )
);

if (corpus.length !== 72) throw new Error(`Corpus shape drifted: expected 72, got ${corpus.length}`);
if (dryRun) {
  console.log(`addressing corpus dry run: ${corpus.length} cases, model=${model}`);
  process.exit(0);
}
if (!key) throw new Error('DEEPSEEK_API_KEY is not configured in environment or .env.local');

const results = await mapLimited(corpus, 2, (item) =>
  measureOne(key, model, item.residentId, item.mode, item.prompt, item.index)
);
const rawInvalid = results.filter((result) => result.rawViolations.length > 0);
const deterministic = results.filter((result) => result.path === 'deterministic');
const modelAttempts = results.filter((result) => result.repairLatencyMs > 0);
const modelSuccess = results.filter((result) => result.path === 'model');
const fallbacks = results.filter((result) => result.path === 'fallback');
const responseModels = [...new Set(results.map((result) => result.responseModel).filter(Boolean))];
const originalUsage = sumUsage(results, 'originalUsage');
const repairUsage = sumUsage(results, 'repairUsage');
const predeterminedSampleIds = new Set(
  RESIDENTS.flatMap((resident) =>
    MODES.flatMap((mode) => [
      `${resident.id}/${mode}/01`,
      `${resident.id}/${mode}/07`,
    ])
  )
);
const samples = results
  .filter((result) => predeterminedSampleIds.has(result.id))
  .map((result) => ({
    id: result.id,
    path: result.path,
    original: result.raw ?? null,
    deterministic: result.deterministic ?? null,
    final: result.final ?? null,
    manualSemanticReview: 'PENDING',
  }));
const report = {
  generatedAt: new Date().toISOString(),
  requestedModel: model,
  responseModels,
  corpus: { residents: 3, modes: 2, promptsPerMode: 12, total: results.length },
  metrics: {
    rawViolationCount: rawInvalid.length,
    rawViolationRate: rawInvalid.length / results.length,
    deterministicRepairSuccessCount: deterministic.length,
    deterministicRepairSuccessRate: rawInvalid.length ? deterministic.length / rawInvalid.length : 1,
    modelRepairAttemptCount: modelAttempts.length,
    modelRepairSuccessCount: modelSuccess.length,
    modelRepairSuccessRate: modelAttempts.length ? modelSuccess.length / modelAttempts.length : 1,
    modelThirdPartyNoopCount: results.reduce(
      (sum, result) => sum + (result.modelNoopCount ?? 0),
      0
    ),
    finalScriptedFallbackCount: fallbacks.length,
    finalScriptedFallbackRate: fallbacks.length / results.length,
    finalInvalidRepairedTextCount: results.filter((result) => result.finalInvalid).length,
    totalLatencyMs: {
      p50: percentile(results.map((result) => result.totalLatencyMs), 0.5),
      p95: percentile(results.map((result) => result.totalLatencyMs), 0.95),
    },
    repairLatencyMs: {
      p50: percentile(modelAttempts.map((result) => result.repairLatencyMs), 0.5),
      p95: percentile(modelAttempts.map((result) => result.repairLatencyMs), 0.95),
    },
    originalUsage,
    extraRepairUsage: repairUsage,
    originalCost: costFor(responseModels[0], originalUsage),
    extraRepairCost: costFor(responseModels[0], repairUsage),
  },
  semanticDiffSamples: samples,
  modelThirdPartyNoopSamples: results
    .filter((result) => (result.modelNoopCount ?? 0) > 0)
    .map((result) => ({
      id: result.id,
      original: result.raw ?? null,
      final: result.final ?? null,
      modelNoopCount: result.modelNoopCount,
      manualSemanticReview: 'PENDING',
    })),
  results,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`measurement written: ${outputPath}`);
console.log(JSON.stringify(report.metrics, null, 2));
if (report.metrics.finalScriptedFallbackRate > 0.1) process.exitCode = 2;
if (report.metrics.finalInvalidRepairedTextCount > 0) process.exitCode = 3;
