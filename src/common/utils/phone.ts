/**
 * Strips whitespace, dashes, parens; ensures a leading `+`; validates 8–16 digits.
 * Returns the canonical E.164-ish form on success, or null if the input is
 * not parseable (callers decide whether to throw or silently bail).
 */
export function normalizePhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[^\d+]/g, '');
  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  if (!/^\+\d{8,16}$/.test(withPlus)) return null;
  return withPlus;
}

/**
 * Log-safe form of a phone number: only the last 3 digits (`***567`).
 * Full numbers are personal data and never go to production logs.
 */
export function maskPhone(input: string | null | undefined): string {
  if (typeof input !== 'string') return 'INVALID';
  const digits = input.replace(/\D/g, '');
  if (digits.length < 3) return '***';
  return `***${digits.slice(-3)}`;
}
