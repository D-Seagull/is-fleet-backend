import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [SupabaseStorageModule, MessagesModule],
  providers: [DocumentsService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
