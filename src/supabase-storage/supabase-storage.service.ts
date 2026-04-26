import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as path from 'path';

const BUCKET = 'is-fleet';

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;

  constructor(private config: ConfigService) {
    this.client = createClient(
      config.getOrThrow('SUPABASE_URL'),
      config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<{ storagePath: string }> {
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
