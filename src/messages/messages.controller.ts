import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReactionsService } from '../reactions/reactions.service';
import { ReactionsGateway } from '../reactions/reactions.gateway';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly gateway: MessagesGateway,
    private readonly reactions: ReactionsService,
    private readonly reactionsGateway: ReactionsGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
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

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete(':id')
  async remove(@Param('id') id: string, @GetUser() user: JwtUser) {
    const { tripId } = await this.messagesService.remove(id, user);
    // Broadcast so every client in the trip room drops the message instantly.
    this.gateway.emitMessageDeleted(tripId, id);
    return { id };
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Patch(':id')
  async edit(
    @Param('id') id: string,
    @Body('content') content: string,
    @GetUser('id') userId: string,
  ) {
    const message = await this.messagesService.editMessage(id, userId, content);
    this.gateway.emitMessageEdited(message.tripId, message);
    return message;
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post(':messageId/react')
  async react(
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @GetUser() user: JwtUser,
  ) {
    const rooms = await this.reactions.assertTarget('TRIP', messageId, user);
    const reactions = await this.reactions.toggle(
      'TRIP',
      messageId,
      user.id,
      emoji,
    );
    this.reactionsGateway.emit('TRIP', messageId, reactions, rooms, user.id);
    return reactions;
  }
}
