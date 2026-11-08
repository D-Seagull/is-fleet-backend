import { Prisma } from '@prisma/client';

/** Kind of a chat attachment, from the MIME the upload policy settled on. */
export function attachmentFileType(
  mimetype: string,
): 'PHOTO' | 'AUDIO' | 'DOCUMENT' {
  if (mimetype.startsWith('image/')) return 'PHOTO';
  if (mimetype.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}

/** Longest recording a client may claim, in ms (the 5 MB cap bites first). */
const MAX_VOICE_MS = 10 * 60 * 1000;

/**
 * `durationMs` from a multipart field (a string) — a positive whole number of
 * milliseconds or null. Only meaningful for a voice message; the caller
 * ignores it for anything else.
 */
export function parseDurationMs(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), MAX_VOICE_MS);
}

/** "0:07" / "1:23". */
function clock(durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Preview text of a voice message in lists, push-style summaries and the
 * unread bell: "🎤 0:07". Language-neutral on purpose — those strings are
 * built on the server, where one text goes to people of every UI language.
 */
export function voicePreview(durationMs?: number | null): string {
  return durationMs ? `🎤 ${clock(durationMs)}` : '🎤';
}

/**
 * The same in SQL, for the raw unread / conversation queries. `alias` is the
 * table alias of a *Document row (a trusted literal, never user input).
 */
export function voicePreviewSql(alias: string): Prisma.Sql {
  return Prisma.raw(
    `CASE WHEN ${alias}."durationMs" IS NULL THEN '🎤' ` +
      `ELSE '🎤 ' || ((${alias}."durationMs" + 500) / 1000 / 60)::text || ':' || ` +
      `LPAD((((${alias}."durationMs" + 500) / 1000) % 60)::text, 2, '0') END`,
  );
}
