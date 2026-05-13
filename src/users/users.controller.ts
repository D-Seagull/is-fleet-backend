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
import { UpdateDriverDto } from './dto/update-driver.dto';
import { RegisterPushTokenDto } from './dto/push-token.dto';
import { SetTimezoneDto } from './dto/timezone.dto';
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
  @Patch(':id')
  updateDriver(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.usersService.updateDriver(id, companyId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id/activate')
  activate(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.usersService.activate(id, companyId);
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

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post(':id/ratings')
  upsertRating(
    @Param('id') driverId: string,
    @GetUser('id') ratedById: string,
    @Body() body: { score: number; comment?: string; anonymous?: boolean },
  ) {
    return this.usersService.upsertRating(
      driverId,
      ratedById,
      body.score,
      body.comment,
      body.anonymous,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get(':id/ratings')
  getDriverRatings(@Param('id') driverId: string) {
    return this.usersService.getDriverRatings(driverId);
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

  // ── Push tokens (mobile-driven) ───────────────────────────────────────
  /** Register / refresh an Expo push token for the current device. */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post('me/push-token')
  registerPushToken(
    @GetUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.usersService.registerPushToken(userId, dto.token, dto.platform);
  }

  /** Unregister this device (call from logout flow). */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Delete('me/push-token/:token')
  unregisterPushToken(
    @GetUser('id') userId: string,
    @Param('token') token: string,
  ) {
    return this.usersService.deletePushToken(userId, token);
  }

  /** Update the current user's IANA timezone. Called by clients on auth so
   *  alarms scheduled by others fire on the user's wall-clock time. */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Patch('me/timezone')
  setTimezone(
    @GetUser('id') userId: string,
    @Body() dto: SetTimezoneDto,
  ) {
    return this.usersService.setTimezone(userId, dto.timezone);
  }
}
