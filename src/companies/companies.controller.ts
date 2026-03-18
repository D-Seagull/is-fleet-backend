import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  getCompany(@GetUser('companyId') companyId: string) {
    return this.companiesService.getCompany(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadLogo(
    @GetUser('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companiesService.uploadLogo(companyId, file);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Patch('logo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  updateLogo(
    @GetUser('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companiesService.updateLogo(companyId, file);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Delete('logo')
  deleteLogo(@GetUser('companyId') companyId: string) {
    return this.companiesService.deleteLogo(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Patch('emails')
  updateEmails(
    @GetUser('companyId') companyId: string,
    @Body()
    dto: { accountingEmail?: string; hrEmail?: string; directorEmail?: string },
  ) {
    return this.companiesService.updateEmails(companyId, dto);
  }
}
