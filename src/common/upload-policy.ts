import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/**
 * What may be uploaded where (audit P1-1). Checked on the server by size
 * (multer limits), count, total request size, and type — extension, MIME
 * AND the file's first bytes, so a renamed `.html` → `.pdf` doesn't pass.
 * SVG, HTML, scripts, archives, video and executables are refused. Voice
 * messages (short audio recordings) are the one media type let in, capped
 * per type at VOICE_MAX_BYTES.
 */
export type UploadKind = 'document' | 'image' | 'screenshot';

const MB = 1024 * 1024;

export interface UploadPolicy {
  maxFileBytes: number;
  maxFiles: number;
  /** Whole multipart request, checked from Content-Length before reading. */
  maxTotalBytes: number;
  types: FileType[];
}

interface FileType {
  name: string;
  exts: string[];
  mimes: string[];
  /** True when the first bytes look like this type. */
  sniff: (head: Buffer) => boolean;
  /** A tighter cap than the policy's maxFileBytes (voice messages). */
  maxBytes?: number;
}

const startsWith = (head: Buffer, bytes: number[], at = 0) =>
  bytes.every((b, i) => head[at + i] === b);
const ascii = (head: Buffer, text: string, at = 0) =>
  head.subarray(at, at + text.length).toString('latin1') === text;

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
  'avif',
]);
const MARKUP = /^\s*(<!doctype|<html|<script|<svg|<\?xml|<body|<head|<iframe)/i;

const JPEG: FileType = {
  name: 'jpeg',
  exts: ['jpg', 'jpeg'],
  mimes: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  sniff: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
};
const PNG: FileType = {
  name: 'png',
  exts: ['png'],
  mimes: ['image/png'],
  sniff: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]),
};
const WEBP: FileType = {
  name: 'webp',
  exts: ['webp'],
  mimes: ['image/webp'],
  sniff: (h) => ascii(h, 'RIFF') && ascii(h, 'WEBP', 8),
};
// iPhone photos — converted to JPEG on upload (SupabaseStorageService).
const HEIC: FileType = {
  name: 'heic',
  exts: ['heic', 'heif'],
  mimes: [
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  ],
  sniff: (h) =>
    ascii(h, 'ftyp', 4) &&
    HEIF_BRANDS.has(h.subarray(8, 12).toString('latin1')),
};
const GIF: FileType = {
  name: 'gif',
  exts: ['gif'],
  mimes: ['image/gif'],
  sniff: (h) => ascii(h, 'GIF8'),
};
const PDF: FileType = {
  name: 'pdf',
  exts: ['pdf'],
  mimes: ['application/pdf'],
  sniff: (h) => ascii(h, '%PDF'),
};
// DOCX / XLSX are zip containers.
const OOXML: FileType = {
  name: 'ooxml',
  exts: ['docx', 'xlsx'],
  mimes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  sniff: (h) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]),
};
// Legacy DOC / XLS (OLE compound file).
const OLE: FileType = {
  name: 'ole',
  exts: ['doc', 'xls'],
  mimes: [
    'application/msword',
    'application/vnd.ms-excel',
    'application/x-ole-storage',
  ],
  sniff: (h) => startsWith(h, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
};
// Plain text / CSV: no NUL bytes (binary) and no markup a browser would run.
const TEXT: FileType = {
  name: 'text',
  exts: ['txt', 'csv'],
  mimes: [
    'text/plain',
    'text/csv',
    'application/csv',
    'text/comma-separated-values',
    'application/vnd.ms-excel', // Windows labels .csv this way
  ],
  sniff: (h) => !h.includes(0) && !MARKUP.test(h.toString('utf8')),
};

// ── Voice messages ────────────────────────────────────────────────────────
// Recorded in the apps (AAC in an .m4a) or the browser (MediaRecorder: mp4 or
// webm/opus). Judged by extension + MIME + first bytes like everything else.
// The extension is deliberately `m4a` only — `.mp4` is where video would
// sneak in, and video stays refused.
export const VOICE_MAX_BYTES = 5 * MB;

const M4A: FileType = {
  name: 'm4a',
  exts: ['m4a'],
  mimes: ['audio/mp4', 'audio/m4a', 'audio/x-m4a'],
  // ISO base media file: "ftyp" at byte 4, and not a HEIF/AVIF image brand.
  sniff: (h) =>
    ascii(h, 'ftyp', 4) &&
    !HEIF_BRANDS.has(h.subarray(8, 12).toString('latin1')),
  maxBytes: VOICE_MAX_BYTES,
};
// Raw AAC stream (ADTS frame header: 12 sync bits).
const AAC: FileType = {
  name: 'aac',
  exts: ['aac'],
  mimes: ['audio/aac', 'audio/aacp'],
  sniff: (h) => h[0] === 0xff && (h[1] & 0xf6) === 0xf0,
  maxBytes: VOICE_MAX_BYTES,
};
const MP3: FileType = {
  name: 'mp3',
  exts: ['mp3'],
  mimes: ['audio/mpeg', 'audio/mp3'],
  sniff: (h) => ascii(h, 'ID3') || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0),
  maxBytes: VOICE_MAX_BYTES,
};
const OGG: FileType = {
  name: 'ogg',
  exts: ['ogg', 'oga', 'opus'],
  mimes: ['audio/ogg', 'audio/opus', 'application/ogg'],
  sniff: (h) => ascii(h, 'OggS'),
  maxBytes: VOICE_MAX_BYTES,
};
const WEBM_AUDIO: FileType = {
  name: 'webm',
  exts: ['webm'],
  mimes: ['audio/webm'],
  sniff: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]),
  maxBytes: VOICE_MAX_BYTES,
};
const VOICE = [M4A, AAC, MP3, OGG, WEBM_AUDIO];
const VOICE_TYPES = new Set<FileType>(VOICE);

const IMAGES = [JPEG, PNG, WEBP, HEIC];

export const UPLOAD_POLICIES: Record<UploadKind, UploadPolicy> = {
  // Trip / DM / group attachments.
  document: {
    maxFileBytes: 20 * MB,
    maxFiles: 10,
    maxTotalBytes: 60 * MB,
    types: [...IMAGES, GIF, PDF, OOXML, OLE, TEXT, ...VOICE],
  },
  // Avatars, company logos, group pictures — the server shrinks them; the
  // phone apps send the picker's file as is, hence 10 MB, not 5.
  image: {
    maxFileBytes: 10 * MB,
    maxFiles: 1,
    maxTotalBytes: 11 * MB,
    types: IMAGES,
  },
  // Bug-report screenshots.
  screenshot: {
    maxFileBytes: 10 * MB,
    maxFiles: 5,
    maxTotalBytes: 51 * MB,
    types: IMAGES,
  },
};

// Some pickers (Android document picker, older browsers) label everything
// application/octet-stream — the extension and the bytes decide then.
const GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
};

const IMAGE_TYPES = new Set<FileType>([JPEG, PNG, WEBP, HEIC, GIF]);

/**
 * The type a received file is, or throws 415. The extension picks the
 * candidate (or the MIME when the name has none, e.g. a phone photo named
 * "photo"); the declared MIME must fit it (or be generic); the first bytes
 * must match. Size and count are multer's job (limits), see UploadInterceptor.
 *
 * Images are judged by their bytes: an iPhone hands over "IMG_0042.HEIC"
 * labelled image/jpeg with JPEG bytes once the picker re-encoded it. Any
 * allowed image format is accepted then, and the name / MIME are corrected
 * to what the bytes are, so storage (HEIC conversion, previews) sees the
 * truth. Documents keep the strict rule — bytes must match the extension.
 */
export function assertAllowedFile(
  file: Pick<
    Express.Multer.File,
    'originalname' | 'mimetype' | 'buffer' | 'size'
  >,
  kind: UploadKind,
): string {
  const policy = UPLOAD_POLICIES[kind];
  if (file.size > policy.maxFileBytes) {
    throw new PayloadTooLargeException('errors.fileTooLarge');
  }
  const ext = extOf(file.originalname);
  // "audio/webm;codecs=opus" → "audio/webm": MediaRecorder labels blobs so.
  const mime = (file.mimetype ?? '').toLowerCase().split(';')[0].trim();
  const type = ext
    ? policy.types.find((t) => t.exts.includes(ext))
    : policy.types.find((t) => t.mimes.includes(mime));
  const head = (file.buffer ?? Buffer.alloc(0)).subarray(0, 4096);
  const unsupported = () =>
    new UnsupportedMediaTypeException('errors.fileTypeNotSupported');
  if (!type) throw unsupported();

  if (IMAGE_TYPES.has(type)) {
    const declaredImage =
      GENERIC_MIMES.has(mime) ||
      policy.types.some((t) => IMAGE_TYPES.has(t) && t.mimes.includes(mime));
    const actual = policy.types.find(
      (t) => IMAGE_TYPES.has(t) && t.sniff(head),
    );
    if (!declaredImage || !actual) throw unsupported();
    if (actual !== type || !actual.mimes.includes(mime)) {
      file.mimetype = actual.mimes[0];
      const base = file.originalname.replace(/\.[^.]*$/, '') || 'image';
      file.originalname = `${base}.${actual.exts[0]}`;
    }
    return actual.name;
  }

  if (!(GENERIC_MIMES.has(mime) || type.mimes.includes(mime))) {
    throw unsupported();
  }
  if (!type.sniff(head)) throw unsupported();
  if (type.maxBytes && file.size > type.maxBytes) {
    throw new PayloadTooLargeException('errors.fileTooLarge');
  }
  if (VOICE_TYPES.has(type)) {
    // Store and serve it under one canonical audio MIME, so players (and the
    // attachment kind, decided by `audio/`) don't depend on the recorder.
    file.mimetype = type.mimes[0];
  }
  return type.name;
}
