import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SupabaseStorageModule } from 'src/supabase-storage/supabase-storage.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [SupabaseStorageModule, MailModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
