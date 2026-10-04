import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Options for every upload interceptor. Multer reads the file name from the
 * multipart header as latin1 by default, so a Cyrillic "нпу.pdf" arrived as
 * "Ð½Ð¿Ñ\u0083.pdf" and was stored that way. Browsers and the apps send the
 * name as UTF-8 — read it as such. Files stay in memory (uploaded to
 * Supabase from there).
 */
// Nest's MulterOptions type predates multer's `defParamCharset`; it is passed
// through to multer() unchanged.
export const UPLOAD_OPTIONS: MulterOptions & { defParamCharset: string } = {
  storage: memoryStorage(),
  defParamCharset: 'utf8',
};
