import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import heicConvert from 'heic-convert';

const BUCKET = 'is-fleet';

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
  async uploadWithUrl(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string; storagePath: string }> {
    const { storagePath } = await this.uploadFile(file, folder);
    const url = await this.getSignedUrl(storagePath, 315_360_000); // ~10 years
    return { url, storagePath };
  }

  async deleteFile(storagePath: string): Promise<void> {
    await this.client.storage.from(BUCKET).remove([storagePath]);
  }

  // Підписаний URL дійсний expiresIn секунд (default 1 година)
  async getSignedUrl(
    storagePath: string,
    expiresIn = 3600,
    download?: string,
  ): Promise<string> {
    const options = download ? { download } : undefined;
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn, options);

    if (error || !data?.signedUrl) {
      throw new Error(`Cannot create signed URL: ${error?.message}`);
    }

    return data.signedUrl;
  }
}
