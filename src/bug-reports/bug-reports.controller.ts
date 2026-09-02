import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BugStatus, Role } from '@prisma/client';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportStatusDto } from './dto/update-bug-report-status.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('bug-reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('bug-reports')
export class BugReportsController {
  constructor(private service: BugReportsService) {}

  // Anyone signed in can file a report from their client's header button.
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post()
  @UseInterceptors(
    FilesInterceptor('screenshots', 5, { storage: memoryStorage() }),
  )
  create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateBugReportDto,
    @GetUser('id') userId: string,
    @GetUser('role') role: Role,
  ) {
    // companyId is resolved from the reporter's DB row inside the service, so
    // it's captured even for admins (whose token companyId is nulled).
    return this.service.create(userId, role, dto, files ?? []);
  }

  // Triage surface — admins only.
  @Roles('ADMIN')
  @Get()
  findAll(@Query('status') status?: BugStatus) {
    return this.service.findAll(status);
  }

  @Roles('ADMIN')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBugReportStatusDto,
  ) {
    return this.service.updateStatus(id, dto.status);
  }
}
