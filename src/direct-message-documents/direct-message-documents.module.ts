import { Module } from '@nestjs/common';
import { DirectMessageDocumentsService } from './direct-message-documents.service';
import { DirectMessageDocumentsController } from './direct-message-documents.controller';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';
import { ReactionsModule } from '../reactions/reactions.module';

@Module({
  imports: [SupabaseStorageModule, DirectMessagesModule, ReactionsModule],
  providers: [DirectMessageDocumentsService],
  controllers: [DirectMessageDocumentsController],
})
export class DirectMessageDocumentsModule {}
