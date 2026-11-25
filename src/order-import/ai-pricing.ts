/**
 * List prices of the Claude models we may be answered by, in USD per
 * million tokens (input / output). Thinking is billed as output and is
 * already inside `output_tokens`.
 *
 * A refusal can be re-run on a fallback model the API picks, so the table
 * covers the current family, not only ORDER_IMPORT_MODEL. When Anthropic
 * changes a price, override without a deploy of code:
 *   AI_MODEL_PRICES='{"claude-opus-5-5":[4,20]}'
 */
const LIST_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-2': [8, 40],
  'claude-fable-5-1': [10, 50],
};

/** Unknown model: price it like the default rather than as free. */
const FALLBACK_PRICE: [number, number] = [4, 20];

function overrides(): Record<string, [number, number]> {
  const raw = process.env.AI_MODEL_PRICES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, [number, number]> = {};
    for (const [model, v] of Object.entries(parsed)) {
      if (
        Array.isArray(v) &&
        v.length === 2 &&
        v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
      ) {
        out[model] = [v[0] as number, v[1] as number];
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** [input, output] USD per million tokens; `known` false → fallback used. */
export function modelPrice(model: string): {
  price: [number, number];
  known: boolean;
} {
  const table = { ...LIST_PRICES, ...overrides() };
  // "claude-opus-5-5-…" style ids (dated or suffixed) price like their base.
  const id = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => model === k || model.startsWith(`${k}-`));
  return id
    ? { price: table[id], known: true }
    : { price: FALLBACK_PRICE, known: false };
}

/** What one request cost, USD, rounded to 6 decimals (micro-dollars). */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const [pin, pout] = modelPrice(model).price;
  const cost = (inputTokens * pin + outputTokens * pout) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
