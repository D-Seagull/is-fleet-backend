import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { MessagesModule } from '../messages/messages.module';
import { ReactionsModule } from '../reactions/reactions.module';

@Module({
  imports: [SupabaseStorageModule, MessagesModule, ReactionsModule],
  providers: [DocumentsService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
