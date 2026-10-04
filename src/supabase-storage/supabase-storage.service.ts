import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import heicConvert from 'heic-convert';
import sharp from 'sharp';

const BUCKET = 'is-fleet';

// Display images (avatars, group pictures, company logos) are shown at a few
// dozen pixels, yet phones upload multi-megabyte camera shots. Every list and
// chat would pull those full-size, which stalls on mobile data (avatars
// "falling off") and burns Supabase egress. Shrink them once, on upload.
const IMAGE_PRESETS = {
  // Square crop — rendered at ≤ 96 px, so 256 covers 2–3× screens.
  avatar: { size: 256, fit: 'cover' },
  // Keep the aspect ratio (and transparency) — logos are not always square.
  logo: { size: 512, fit: 'inside' },
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

// HEIC/HEIF is what iPhones shoot by default. Desktop browsers (Chrome/Edge/
// Firefox on Windows) can't render it, so they download the file instead of
// showing it. We normalise every HEIC upload to JPEG so photos open inline
// everywhere. Detected by mimetype or extension (some clients send a generic
// content-type). See docs/gotchas: this is the single choke point for ALL
// uploads (trip docs, chat, groups, avatars, logos).
const HEIC_MIME = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

// Photo attachments (chat, trip documents). A phone shot is 3–8 MB at 12–48 MP,
// far beyond any screen. We keep ONE full copy at 2560 px on the long edge —
// sharp on a 4K monitor and when zoomed in the gallery, with no visible loss
// at MozJPEG q85 — and a small WebP preview that chat bubbles and grids load
// instead. EXIF (GPS included) is dropped; orientation is baked in first.
const PHOTO_MAX = 2560;
const PHOTO_QUALITY = 85;
const THUMB_MAX = 800; // ~280 css px bubble × 3 dpr phones
const THUMB_QUALITY = 75;
// Animated GIFs would lose their frames, SVG is not raster — store as-is.
const SKIP_OPTIMISE = /^image\/(gif|svg\+xml)$/i;

// Paths are random UUIDs and never overwritten, so the bytes behind a path
// never change: let browsers and phones cache them for a year.
const IMMUTABLE_CACHE = '31536000';

// Signed URLs are cached so the same file gets the SAME URL on every request —
// otherwise each refetch hands out a new token and every client cache misses,
// re-downloading photos the user has already seen. Signed for a day, reused
// while at least half of that is left, so a client always holds ≥ 12 h.
const SIGN_TTL = 24 * 3600;
const SIGN_REUSE_MIN_LEFT = 12 * 3600;
const SIGN_CACHE_MAX = 20_000;

// sharp holds the decoded image in memory (~150 MB for a 48 MP shot). A
// 10-photo upload processed all at once could exhaust a small Render
// instance, so photos are optimised a couple at a time.
const OPTIMISE_CONCURRENCY = 2;
sharp.cache(false);

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;
  private readonly logger = new Logger(SupabaseStorageService.name);

  constructor(private config: ConfigService) {
    this.client = createClient(
      config.getOrThrow('SUPABASE_URL'),
      config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // Convert a HEIC/HEIF buffer to JPEG. Mutates `file` in place so callers that
  // read `file.originalname` / `file.mimetype` afterwards (for the stored
  // fileName + fileType) see the normalised values. Best-effort: if conversion
  // fails we keep the original so an upload never hard-fails on this.
  private async normaliseHeic(file: Express.Multer.File): Promise<void> {
    const looksHeic =
      HEIC_MIME.test(file.mimetype) || HEIC_EXT.test(file.originalname);
    if (!looksHeic) return;

    try {
      const jpeg = await heicConvert({
        buffer: file.buffer,
        format: 'JPEG',
        quality: 0.9,
      });
      file.buffer = Buffer.from(jpeg);
      file.mimetype = 'image/jpeg';
      // Keep the stored fileName extension consistent with the JPEG content so
      // downloads open correctly: swap .heic/.heif → .jpg, or append .jpg when
      // the format was only detectable from the mimetype.
      if (HEIC_EXT.test(file.originalname)) {
        file.originalname = file.originalname.replace(HEIC_EXT, '.jpg');
      } else if (!/\.jpe?g$/i.test(file.originalname)) {
        file.originalname = `${file.originalname}.jpg`;
      }
    } catch (err) {
      this.logger.error(
        `HEIC→JPEG conversion failed for "${file.originalname}", storing original`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // Downscale a display image to its preset. Mutates `file` like
  // normaliseHeic (buffer, mimetype, extension). Best-effort: an image sharp
  // can't read is stored as-is rather than failing the upload.
  private async shrinkImage(
    file: Express.Multer.File,
    preset: ImagePreset,
  ): Promise<void> {
    if (!file.mimetype.startsWith('image/')) return;
    const { size, fit } = IMAGE_PRESETS[preset];
    try {
      const { hasAlpha } = await sharp(file.buffer).metadata();
      const pipeline = sharp(file.buffer)
        .rotate() // apply EXIF orientation before the metadata is dropped
        .resize(size, size, { fit, withoutEnlargement: true });
      // PNG only when there is transparency to keep; JPEG is far smaller.
      file.buffer = hasAlpha
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      file.mimetype = hasAlpha ? 'image/png' : 'image/jpeg';
      const ext = hasAlpha ? '.png' : '.jpg';
      file.originalname = file.originalname.replace(/\.[^.]*$/, '') + ext;
      file.size = file.buffer.length;
    } catch (err) {
      this.logger.error(
        `Image shrink (${preset}) failed for "${file.originalname}", storing original`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // Run `task` once fewer than OPTIMISE_CONCURRENCY optimisations are active.
  private optimiseActive = 0;
  private optimiseQueue: Array<() => void> = [];
  private async withOptimiseSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.optimiseActive >= OPTIMISE_CONCURRENCY) {
      await new Promise<void>((resolve) => this.optimiseQueue.push(resolve));
    }
    this.optimiseActive++;
    try {
      return await task();
    } finally {
      this.optimiseActive--;
      this.optimiseQueue.shift()?.();
    }
  }

  /**
   * Shrink a photo attachment to PHOTO_MAX and build its preview. Mutates
   * `file` like normaliseHeic (buffer, mimetype, extension, size) and returns
   * the preview bytes, or null when the file is not a photo we can process.
   *
   * The full copy replaces the upload only when it actually comes out
   * smaller — an already-small, well-compressed image is kept untouched
   * rather than re-encoded for nothing. Best-effort throughout: an image
   * sharp can't read is stored as-is, without a preview.
   */
  async optimisePhoto(file: Express.Multer.File): Promise<Buffer | null> {
    if (!file.mimetype.startsWith('image/')) return null;
    if (SKIP_OPTIMISE.test(file.mimetype)) return null;

    return this.withOptimiseSlot(async () => {
      try {
        const { hasAlpha, format, width, height, exif } = await sharp(
          file.buffer,
        ).metadata();
        // .rotate() applies EXIF orientation before metadata is dropped.
        const base = () => sharp(file.buffer, { failOn: 'none' }).rotate();

        // The phone apps already resize to PHOTO_MAX and encode once at high
        // quality (lib/compress-photo.ts), which also drops EXIF. Encoding
        // that again would only add a second generation of loss — on
        // photographed documents that is the small print — so keep it as is.
        const alreadyOptimised =
          format === 'jpeg' &&
          !exif &&
          Math.max(width ?? Infinity, height ?? Infinity) <= PHOTO_MAX;

        const full = base().resize(PHOTO_MAX, PHOTO_MAX, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        // PNG only when there is transparency to keep; JPEG is far smaller.
        const fullBuf = alreadyOptimised
          ? file.buffer
          : hasAlpha
            ? await full.png({ compressionLevel: 9, palette: false }).toBuffer()
            : await full
                .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
                .toBuffer();

        const thumb = await base()
          .resize(THUMB_MAX, THUMB_MAX, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: THUMB_QUALITY, alphaQuality: 80 })
          .toBuffer();

        if (fullBuf.length < file.buffer.length) {
          file.buffer = fullBuf;
          file.mimetype = hasAlpha ? 'image/png' : 'image/jpeg';
          const ext = hasAlpha ? '.png' : '.jpg';
          if (path.extname(file.originalname).toLowerCase() !== ext) {
            file.originalname =
              file.originalname.replace(/\.[^.]*$/, '') + ext;
          }
          file.size = fullBuf.length;
        }
        return thumb;
      } catch (err) {
        this.logger.error(
          `Photo optimise failed for "${file.originalname}", storing original`,
          err instanceof Error ? err.stack : String(err),
        );
        return null;
      }
    });
  }

  private async put(
    storagePath: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(storagePath, body, {
        contentType,
        upsert: false,
        cacheControl: IMMUTABLE_CACHE,
      });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  }

  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<{ storagePath: string }> {
    await this.normaliseHeic(file);

    const isImage = file.mimetype.startsWith('image/');
    const resolvedFolder = folder ?? (isImage ? 'photos' : 'documents');
    const ext = path.extname(file.originalname) || '';
    const storagePath = `${resolvedFolder}/${randomUUID()}${ext}`;

    await this.put(storagePath, file.buffer, file.mimetype);
    return { storagePath };
  }

  /**
   * Chat / trip attachment upload. Photos are optimised and get a preview
   * stored next to them (`<uuid>.thumb.webp`); other files go up untouched.
   * `file` reflects what was stored (name, type) once this resolves.
   */
  async uploadAttachment(
    file: Express.Multer.File,
  ): Promise<{ storagePath: string; thumbPath: string | null }> {
    await this.normaliseHeic(file);
    const thumb = await this.optimisePhoto(file);
    const { storagePath } = await this.uploadFile(file);
    if (!thumb) return { storagePath, thumbPath: null };

    const thumbPath = storagePath.replace(/(\.[^./]*)?$/, '.thumb.webp');
    try {
      await this.put(thumbPath, thumb, 'image/webp');
      return { storagePath, thumbPath };
    } catch (err) {
      // The photo itself is stored — clients fall back to it without a preview.
      this.logger.error(
        `Preview upload failed for ${storagePath}`,
        err instanceof Error ? err.stack : String(err),
      );
      return { storagePath, thumbPath: null };
    }
  }

  // Upload and return a long-lived signed URL (10 years) for display in UI.
  // Used for avatars and logos where the URL is stored directly in the DB.
  // `preset` downscales display images first (HEIC is converted before, since
  // sharp can't decode it).
  async uploadWithUrl(
    file: Express.Multer.File,
    folder: string,
    preset?: ImagePreset,
  ): Promise<{ url: string; storagePath: string }> {
    if (preset) {
      await this.normaliseHeic(file);
      await this.shrinkImage(file, preset);
    }
    const { storagePath } = await this.uploadFile(file, folder);
    const url = await this.getSignedUrl(storagePath, 315_360_000); // ~10 years
    return { url, storagePath };
  }

  // Extra paths (a photo's preview) go in the same request; nulls are skipped.
  async deleteFile(
    storagePath: string,
    ...more: Array<string | null | undefined>
  ): Promise<void> {
    const paths = [storagePath, ...more].filter((p): p is string => !!p);
    for (const p of paths) this.signCache.delete(p);
    await this.client.storage.from(BUCKET).remove(paths);
  }

  // storagePath → signed URL, for display URLs only (no `download` variant).
  private signCache = new Map<string, { url: string; expiresAt: number }>();

  // Підписаний URL дійсний expiresIn секунд (default 1 година)
  /**
   * Signs a URL, distinguishing a missing object from a broken bucket.
   *
   * A file deleted straight from the Supabase dashboard leaves its database
   * row behind, and signing it fails. That is a state of the data, not a
   * server fault: answering 500 both misleads the user and files a Sentry
   * issue every time anyone opens the document. Storage being unreachable is
   * a different thing entirely and must keep throwing.
   */
  private async sign(
    storagePath: string,
    expiresIn: number,
    download?: string,
  ): Promise<{ url: string } | { missing: true }> {
    // Display URLs (no download name, standard 1 h ask) come from the cache
    // and are signed for SIGN_TTL instead — see the note on SIGN_TTL. Long
    // custom lifetimes (avatars) and downloads are signed as asked.
    const cacheable = !download && expiresIn <= SIGN_TTL;
    if (cacheable) {
      const hit = this.signCache.get(storagePath);
      if (hit && hit.expiresAt - Date.now() > SIGN_REUSE_MIN_LEFT * 1000) {
        return { url: hit.url };
      }
      expiresIn = SIGN_TTL;
    }

    const options = download ? { download } : undefined;
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn, options);

    if (data?.signedUrl) {
      if (cacheable) {
        // Plain size cap: dropping the oldest entry only costs a re-sign.
        if (this.signCache.size >= SIGN_CACHE_MAX) {
          const oldest = this.signCache.keys().next().value;
          if (oldest !== undefined) this.signCache.delete(oldest);
        }
        this.signCache.set(storagePath, {
          url: data.signedUrl,
          expiresAt: Date.now() + expiresIn * 1000,
        });
      }
      return { url: data.signedUrl };
    }

    // Supabase reports an absent object as "Object not found", sometimes with
    // a 404 status attached. Match on either — the message wording is not a
    // contract, so a status check alone would be as fragile as a string one.
    const status = Number(
      (error as { statusCode?: string | number } | null)?.statusCode,
    );
    const missing =
      status === 404 || /not\s*found/i.test(error?.message ?? '');
    if (missing) return { missing: true };

    throw new Error(`Cannot create signed URL: ${error?.message}`);
  }

  /**
   * Signed URL for a file that must exist. Throws a translated 404 when the
   * object is gone, so the client can say so instead of showing a crash.
   */
  async getSignedUrl(
    storagePath: string,
    expiresIn = 3600,
    download?: string,
  ): Promise<string> {
    const result = await this.sign(storagePath, expiresIn, download);
    if ('missing' in result) {
      this.logger.warn(`Storage object missing: ${storagePath}`);
      throw new NotFoundException('errors.fileMissing');
    }
    return result.url;
  }

  /**
   * Signed URL, or null when the object no longer exists. For list endpoints:
   * one orphaned row must not take the whole list down with it. Real storage
   * failures still throw — an outage must never look like a bucket full of
   * missing files.
   */
  async getSignedUrlOrNull(
    storagePath: string,
    expiresIn = 3600,
    download?: string,
  ): Promise<string | null> {
    const result = await this.sign(storagePath, expiresIn, download);
    if ('missing' in result) {
      this.logger.warn(`Storage object missing: ${storagePath}`);
      return null;
    }
    return result.url;
  }

  /**
   * Preview URL for a photo, or null — for no preview, a missing one, or any
   * signing error. A preview is an optimisation: the client falls back to the
   * full photo, so it must never fail a request or heal a row.
   */
  async getThumbUrl(thumbPath: string | null | undefined): Promise<string | null> {
    if (!thumbPath) return null;
    try {
      const result = await this.sign(thumbPath, 3600);
      return 'url' in result ? result.url : null;
    } catch {
      return null;
    }
  }
}
