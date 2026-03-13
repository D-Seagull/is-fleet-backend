import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AdvanceRequestsService } from './advance-requests.service';
import { CreateAdvanceRequestDto } from './dto/create-advance-request.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('advance-requests')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('advance-requests')
export class AdvanceRequestsController {
  constructor(private advanceRequestsService: AdvanceRequestsService) {}

  @Roles('DRIVER')
  @Post()
  create(
    @GetUser('id') driverId: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateAdvanceRequestDto,
  ) {
    return this.advanceRequestsService.create(driverId, companyId, dto);
  }
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get()
  findMyRequests(@GetUser('id') userId: string, @GetUser('role') role: string) {
    return this.advanceRequestsService.findMyRequests(userId, role);
  }
}
