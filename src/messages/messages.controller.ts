import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { GetUser } from '../auth/decorators/get-user.decorator';
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

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post(':messageId/react')
  async react(
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @GetUser('id') userId: string,
  ) {
    const reactions = await this.reactions.toggle(
      'TRIP',
      messageId,
      userId,
      emoji,
    );
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { tripId: true },
    });
    if (message) {
      this.reactionsGateway.emit('TRIP', messageId, reactions, [
        message.tripId,
      ]);
    }
    return reactions;
  }
}
