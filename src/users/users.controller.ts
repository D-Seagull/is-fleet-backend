import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles('ADMIN', 'TEAMLEAD')
  @Post('dispatcher')
  createDispatcher(
    @GetUser('companyId') companyId: string,
    @GetUser('id') creatorId: string,
    @Body() dto: CreateDispatcherDto,
  ) {
    return this.usersService.createDispatcher(companyId, creatorId, dto);
  }

  @Roles('ADMIN', 'DISPATCHER', 'TEAMLEAD')
  @Post('driver')
  createDriver(
    @GetUser('companyId') companyId: string,
    @GetUser('id') creatorId: string,
    @Body() dto: CreateDriverDto,
  ) {
    return this.usersService.createDriver(companyId, creatorId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  getUsers(@GetUser('companyId') companyId: string) {
    return this.usersService.getCompanyUsers(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
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

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Delete('avatar')
  deleteAvatar(@GetUser('id') userId: string) {
    return this.usersService.deleteAvatar(userId);
  }
}
