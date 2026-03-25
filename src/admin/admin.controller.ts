import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Roles('ADMIN')
  @Post('companies')
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.adminService.createCompany(dto);
  }

  @Roles('ADMIN')
  @Get('companies')
  findAllCompanies() {
    return this.adminService.findAllCompanies();
  }

  @Roles('ADMIN')
  @Patch('companies/:id/deactivate')
  deactivateCompany(@Param('id') id: string) {
    return this.adminService.deactivateCompany(id);
  }

  @Roles('ADMIN')
  @Post('companies/:id/resend-invite')
  resendInvite(@Param('id') id: string, @Body('email') email: string) {
    return this.adminService.resendInvite(id, email);
  }
}
