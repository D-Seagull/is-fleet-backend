import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * Only the message TEMPLATES of the "broadcast to my trucks" dialog are left
 * here (web My Trucks + is-manager). Announcements themselves are scoped out;
 * their publish / read / edit routes were removed (audit H7, N3 — they acted
 * on ids across companies). A template is private to its author.
 */
@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post('drafts')
  createDraft(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateDraftDto,
  ) {
    return this.announcementsService.createDraft(companyId, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
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

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete('drafts/:id')
  removeDraft(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.announcementsService.removeDraft(id, userId);
  }
}
