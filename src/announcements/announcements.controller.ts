import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  Patch,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@UseGuards(JwtGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post()
  create(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(companyId, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get()
  findAll(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
  ) {
    return this.announcementsService.findAll(companyId, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post(':id/read')
  markAsRead(
    @Param('id') announcementId: string,
    @GetUser('id') userId: string,
  ) {
    return this.announcementsService.markAsRead(announcementId, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post('drafts')
  createDraft(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateDraftDto,
  ) {
    return this.announcementsService.createDraft(companyId, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get('drafts')
  findDrafts(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Query('isTemplate') isTemplate: string,
  ) {
    return this.announcementsService.findDrafts(
      companyId,
      isTemplate === 'true',
      userId,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post('drafts/:id/publish')
  publishDraft(
    @Param('id') draftId: string,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
  ) {
    return this.announcementsService.publishDraft(draftId, companyId, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(id, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete('drafts/:id')
  removeDraft(@Param('id') id: string) {
    return this.announcementsService.removeDraft(id);
  }
}
