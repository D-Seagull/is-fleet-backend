import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
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
  findAllCompanies(@GetUser('id') adminId: string) {
    return this.adminService.findAllCompanies(adminId);
  }

  @Roles('ADMIN')
  @Get('stats')
  getStats(@GetUser('id') adminId: string) {
    return this.adminService.getStats(adminId);
  }

  @Roles('ADMIN')
  @Get('billing')
  getBilling(@Query('month') month: string, @GetUser('id') adminId: string) {
    return this.adminService.getBilling(month, adminId);
  }

  @Roles('ADMIN')
  @Patch('companies/:id/billing')
  updateBilling(@Param('id') id: string, @Body() dto: UpdateBillingDto) {
    return this.adminService.updateBilling(id, dto);
  }

  @Roles('ADMIN')
  @Get('online-users')
  getOnlineUsers(@GetUser('id') adminId: string) {
    return this.adminService.getOnlineUsers(adminId);
  }

  @Roles('ADMIN')
  @Get('companies/:id')
  findCompanyById(
    @Param('id') id: string,
    @GetUser('id') adminId: string,
  ) {
    return this.adminService.findCompanyById(id, adminId);
  }

  @Roles('ADMIN')
  @Patch('companies/:id/deactivate')
  deactivateCompany(@Param('id') id: string) {
    return this.adminService.deactivateCompany(id);
  }

  @Roles('ADMIN')
  @Patch('companies/:id/activate')
  reactivateCompany(@Param('id') id: string) {
    return this.adminService.reactivateCompany(id);
  }

  @Roles('ADMIN')
  @Post('companies/:id/resend-invite')
  resendInvite(@Param('id') id: string, @Body('email') email: string) {
    return this.adminService.resendInvite(id, email);
  }
}
