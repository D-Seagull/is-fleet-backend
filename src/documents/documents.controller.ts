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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('tripId') tripId: string,
    @GetUser('id') userId: string,
  ) {
    return this.documentsService.upload(tripId, userId, file);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('trip/:tripId')
  findByTrip(@Param('tripId') tripId: string) {
    return this.documentsService.findByTrip(tripId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
