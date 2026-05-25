import { Module } from '@nestjs/common';
import { GroupMessageDocumentsService } from './group-message-documents.service';
import { GroupMessageDocumentsController } from './group-message-documents.controller';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';
import { ReactionsModule } from '../reactions/reactions.module';

@Module({
  imports: [SupabaseStorageModule, DirectMessagesModule, ReactionsModule],
  providers: [GroupMessageDocumentsService],
  controllers: [GroupMessageDocumentsController],
})
export class GroupMessageDocumentsModule {}
