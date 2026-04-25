import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('tripId') tripId: string,
    @GetUser('id') userId: string,
  ) {
    return this.documentsService.uploadMany(tripId, userId, files);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('trip/:tripId')
  findByTrip(@Param('tripId') tripId: string) {
    return this.documentsService.findByTrip(tripId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('truck/:truckId')
  findByTruck(@Param('truckId') truckId: string) {
    return this.documentsService.findByTruck(truckId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get(':id/view')
  view(@Param('id') id: string, @Res() res: Response) {
    return this.documentsService.view(id, res);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get(':id/download')
  download(@Param('id') id: string, @Res() res: Response) {
    return this.documentsService.download(id, res);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
