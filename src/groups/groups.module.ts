import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { SupabaseStorageModule } from 'src/supabase-storage/supabase-storage.module';

@Module({
  imports: [SupabaseStorageModule],
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupsModule {}
