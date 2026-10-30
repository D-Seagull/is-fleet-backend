import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  Body,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GroupMessageDocumentsService } from './group-message-documents.service';
import { ReactionsService } from '../reactions/reactions.service';
import { ReactionsGateway } from '../reactions/reactions.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UPLOAD_OPTIONS } from 'src/common/upload-options';

@ApiTags('group-message-documents')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('group-messages/documents')
export class GroupMessageDocumentsController {
  constructor(
    private service: GroupMessageDocumentsService,
    private reactions: ReactionsService,
    private reactionsGateway: ReactionsGateway,
    private prisma: PrismaService,
  ) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, UPLOAD_OPTIONS))
  uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('groupId') groupId: string,
    @Body('replyToMessageId') replyToMessageId: string | undefined,
    @Body('replyToDocumentId') replyToDocumentId: string | undefined,
    @Body('caption') caption: string | undefined,
    @GetUser('id') userId: string,
  ) {
    return this.service.uploadMany(
      userId,
      groupId,
      files,
      replyToMessageId || null,
      replyToDocumentId || null,
      caption || null,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string, @GetUser() user: JwtUser) {
    return this.service.findByGroup(groupId, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/view')
  view(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.service.view(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/download')
  download(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.service.download(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id/album')
  removeAlbum(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.service.removeAlbum(id, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.service.remove(id, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post(':docId/react')
  async react(
    @Param('docId') docId: string,
    @Body('emoji') emoji: string,
    @GetUser() user: JwtUser,
  ) {
    const rooms = await this.reactions.assertTarget('GROUP_DOC', docId, user);
    const reactions = await this.reactions.toggle(
      'GROUP_DOC',
      docId,
      user.id,
      emoji,
    );
    this.reactionsGateway.emit('GROUP_DOC', docId, reactions, rooms, user.id);
    return reactions;
  }
}
