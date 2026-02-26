import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles('TEAMLEAD')
  @Post('dispatcher')
  createDispatcher(
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateDispatcherDto,
  ) {
    return this.usersService.createDispatcher(companyId, dto);
  }

  @Roles('DISPATCHER', 'TEAMLEAD')
  @Post('driver')
  createDriver(
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateDriverDto,
  ) {
    return this.usersService.createDriver(companyId, dto);
  }

  @Roles('TEAMLEAD', 'DISPATCHER')
  @Get()
  getUsers(@GetUser('companyId') companyId: string) {
    return this.usersService.getCompanyUsers(companyId);
  }
}
