import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Patch,
} from '@nestjs/common';
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

  @Roles('ADMIN', 'TEAMLEAD')
  @Post('dispatcher')
  createDispatcher(
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateDispatcherDto,
  ) {
    return this.usersService.createDispatcher(companyId, dto);
  }

  @Roles('ADMIN', 'DISPATCHER', 'TEAMLEAD')
  @Post('driver')
  createDriver(
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateDriverDto,
  ) {
    return this.usersService.createDriver(companyId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  getUsers(@GetUser('companyId') companyId: string) {
    return this.usersService.getCompanyUsers(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
  ) {
    return this.usersService.deactivate(id, companyId, role);
  }
}
