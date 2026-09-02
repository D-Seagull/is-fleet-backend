import { Module } from '@nestjs/common';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';
import { BugReportsGateway } from './bug-reports.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, SupabaseStorageModule, PushModule],
  controllers: [BugReportsController],
  providers: [BugReportsService, BugReportsGateway],
})
export class BugReportsModule {}
