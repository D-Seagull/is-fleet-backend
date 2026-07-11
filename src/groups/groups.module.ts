import { Module, forwardRef } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { SupabaseStorageModule } from 'src/supabase-storage/supabase-storage.module';
import { DirectMessagesModule } from 'src/direct-messages/direct-messages.module';

@Module({
  imports: [SupabaseStorageModule, forwardRef(() => DirectMessagesModule)],
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupsModule {}
