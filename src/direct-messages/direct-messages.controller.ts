import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DirectMessagesService } from './direct-messages.service';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { ReactionsService } from '../reactions/reactions.service';
import { ReactionsGateway } from '../reactions/reactions.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('direct-messages')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('direct-messages')
export class DirectMessagesController {
  constructor(
    private service: DirectMessagesService,
    private gateway: DirectMessagesGateway,
    private reactions: ReactionsService,
    private reactionsGateway: ReactionsGateway,
    private prisma: PrismaService,
  ) {}

  @Get('conversations')
  getConversations(@GetUser('id') userId: string) {
    return this.service.getConversations(userId);
  }

  @Get('unread')
  getUnreadSummary(@GetUser('id') userId: string) {
    return this.service.getUnreadSummary(userId);
  }

  @Get(':userId')
  getMessages(
    @GetUser('id') currentUserId: string,
    @Param('userId') otherUserId: string,
  ) {
    return this.service.getMessages(currentUserId, otherUserId);
  }

  @Post(':userId/read')
  markAsRead(
    @GetUser('id') currentUserId: string,
    @Param('userId') senderId: string,
  ) {
    return this.service.markAsRead(currentUserId, senderId);
  }

  @Delete('messages/:messageId')
  async delete(
    @Param('messageId') messageId: string,
    @GetUser('id') userId: string,
  ) {
    const msg = await this.service.softDelete(messageId, userId);
    this.gateway.emitDmMessageDeleted(
      messageId,
      msg.senderId,
      msg.receiverId,
    );
    return { id: messageId };
  }

  @Post('messages/:messageId/react')
  async react(
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @GetUser('id') userId: string,
  ) {
    const reactions = await this.reactions.toggle(
      'DM',
      messageId,
      userId,
      emoji,
    );
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, receiverId: true },
    });
    if (message) {
      this.reactionsGateway.emit('DM', messageId, reactions, [
        `user:${message.senderId}`,
        `user:${message.receiverId}`,
      ]);
    }
    return reactions;
  }
}
