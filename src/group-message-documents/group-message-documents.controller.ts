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
import { memoryStorage } from 'multer';
import { GroupMessageDocumentsService } from './group-message-documents.service';
import { ReactionsService } from '../reactions/reactions.service';
import { ReactionsGateway } from '../reactions/reactions.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

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

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('groupId') groupId: string,
    @GetUser('id') userId: string,
  ) {
    return this.service.uploadMany(userId, groupId, files);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string) {
    return this.service.findByGroup(groupId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get(':id/view')
  view(@Param('id') id: string) {
    return this.service.view(id);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get(':id/download')
  download(@Param('id') id: string) {
    return this.service.download(id);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.service.remove(id, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':docId/react')
  async react(
    @Param('docId') docId: string,
    @Body('emoji') emoji: string,
    @GetUser('id') userId: string,
  ) {
    const reactions = await this.reactions.toggle(
      'GROUP_DOC',
      docId,
      userId,
      emoji,
    );
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id: docId },
      select: { groupId: true },
    });
    if (doc) {
      this.reactionsGateway.emit('GROUP_DOC', docId, reactions, [
        `group:${doc.groupId}`,
      ]);
    }
    return reactions;
  }
}
