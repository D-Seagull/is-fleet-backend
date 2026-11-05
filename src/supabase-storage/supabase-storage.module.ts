import { Module } from '@nestjs/common';
import { SupabaseStorageService } from './supabase-storage.service';
import { ImageUrlRefreshService } from './image-url-refresh.service';

@Module({
  providers: [SupabaseStorageService, ImageUrlRefreshService],
  exports: [SupabaseStorageService],
})
export class SupabaseStorageModule {}
