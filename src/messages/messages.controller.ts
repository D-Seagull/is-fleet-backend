import {
  Controller,
  Delete,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly gateway: MessagesGateway,
  ) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get('unread')
  getUnreadSummary(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.messagesService.getUnreadSummary(companyId, userId, role);
  }

  @Roles('DRIVER')
  @Get('unread/driver')
  getDriverUnreadSummary(@GetUser('id') userId: string) {
    return this.messagesService.getDriverUnreadSummary(userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    const { tripId } = await this.messagesService.remove(id, userId, role);
    // Broadcast so every client in the trip room drops the message instantly.
    this.gateway.emitMessageDeleted(tripId, id);
    return { id };
  }
}
