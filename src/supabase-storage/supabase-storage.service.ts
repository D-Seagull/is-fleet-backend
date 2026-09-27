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

  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<{ storagePath: string }> {
    await this.normaliseHeic(file);

    const isImage = file.mimetype.startsWith('image/');
    const resolvedFolder = folder ?? (isImage ? 'photos' : 'documents');
    const ext = path.extname(file.originalname) || '';
    const storagePath = `${resolvedFolder}/${randomUUID()}${ext}`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    return { storagePath };
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

  async deleteFile(storagePath: string): Promise<void> {
    await this.client.storage.from(BUCKET).remove([storagePath]);
  }

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
    const options = download ? { download } : undefined;
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn, options);

    if (data?.signedUrl) return { url: data.signedUrl };

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
}
