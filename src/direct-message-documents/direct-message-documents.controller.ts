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
import { DirectMessageDocumentsService } from './direct-message-documents.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('direct-message-documents')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('direct-messages/documents')
export class DirectMessageDocumentsController {
  constructor(private service: DirectMessageDocumentsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('otherUserId') otherUserId: string,
    @GetUser('id') userId: string,
  ) {
    return this.service.uploadMany(userId, otherUserId, files);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get('conversation/:otherUserId')
  findByConversation(
    @Param('otherUserId') otherUserId: string,
    @GetUser('id') userId: string,
  ) {
    return this.service.findByConversation(userId, otherUserId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/view')
  view(@Param('id') id: string) {
    return this.service.view(id);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/download')
  download(@Param('id') id: string) {
    return this.service.download(id);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.service.remove(id, userId);
  }
}
