import { Module } from '@nestjs/common';
import { SupabaseStorageModule } from '../supabase-storage/supabase-storage.module';
import { OrderImportController } from './order-import.controller';
import { OrderImportService } from './order-import.service';
import { OrderFilesService } from './order-files.service';
import { TripFinanceService } from './trip-finance.service';

@Module({
  imports: [SupabaseStorageModule],
  controllers: [OrderImportController],
  providers: [OrderImportService, OrderFilesService, TripFinanceService],
})
export class OrderImportModule {}
