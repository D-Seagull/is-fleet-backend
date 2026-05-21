import { Module } from '@nestjs/common';
import { GroupMessageDocumentsService } from './group-message-documents.service';
import { GroupMessageDocumentsController } from './group-message-documents.controller';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';

@Module({
  imports: [SupabaseStorageModule, DirectMessagesModule],
  providers: [GroupMessageDocumentsService],
  controllers: [GroupMessageDocumentsController],
})
export class GroupMessageDocumentsModule {}
