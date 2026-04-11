import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DirectMessagesService } from './direct-messages.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('direct-messages')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('direct-messages')
export class DirectMessagesController {
  constructor(private service: DirectMessagesService) {}

  @Get('conversations')
  getConversations(@GetUser('id') userId: string) {
    return this.service.getConversations(userId);
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
}
