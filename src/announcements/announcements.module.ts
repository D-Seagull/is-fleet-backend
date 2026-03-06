import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';

@Module({
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController]
})
export class AnnouncementsModule {}
