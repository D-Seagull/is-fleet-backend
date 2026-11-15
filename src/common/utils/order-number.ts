import type { TransformFnParams } from 'class-transformer';

/**
 * Order numbers are shown as "#123456" by every client, so the stored value
 * must not carry its own "#" / "№" / "No." prefix (it showed as "#№123456").
 */
export function normalizeOrderNumber(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/^[\s#№]+|^no\.?\s*(?=\d)/i, '').trim();
}

/** `@Transform(trimOrderNumber)` for DTO fields. */
export const trimOrderNumber = ({ value }: TransformFnParams): unknown =>
  normalizeOrderNumber(value);
