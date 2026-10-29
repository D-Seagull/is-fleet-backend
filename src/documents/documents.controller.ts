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
import { DocumentsService } from './documents.service';
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

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private reactions: ReactionsService,
    private reactionsGateway: ReactionsGateway,
    private prisma: PrismaService,
  ) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, UPLOAD_OPTIONS))
  uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('tripId') tripId: string,
    @Body('replyToMessageId') replyToMessageId: string | undefined,
    @Body('replyToDocumentId') replyToDocumentId: string | undefined,
    @Body('caption') caption: string | undefined,
    @GetUser() user: JwtUser,
  ) {
    return this.documentsService.uploadMany(
      tripId,
      user,
      files,
      replyToMessageId || null,
      replyToDocumentId || null,
      caption || null,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get()
  findAll(@GetUser('companyId') companyId: string) {
    return this.documentsService.findByCompany(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get('trip/:tripId')
  findByTrip(@Param('tripId') tripId: string, @GetUser() user: JwtUser) {
    return this.documentsService.findByTrip(tripId, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get('truck/:truckId')
  findByTruck(@Param('truckId') truckId: string, @GetUser() user: JwtUser) {
    return this.documentsService.findByTruck(truckId, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/view')
  view(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.documentsService.view(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/download')
  download(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.documentsService.download(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id/album')
  removeAlbum(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.documentsService.removeAlbum(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.documentsService.remove(id, user);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post(':docId/react')
  async react(
    @Param('docId') docId: string,
    @Body('emoji') emoji: string,
    @GetUser() user: JwtUser,
  ) {
    const rooms = await this.reactions.assertTarget('TRIP_DOC', docId, user);
    const reactions = await this.reactions.toggle(
      'TRIP_DOC',
      docId,
      user.id,
      emoji,
    );
    this.reactionsGateway.emit('TRIP_DOC', docId, reactions, rooms, user.id);
    return reactions;
  }
}
