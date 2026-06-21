import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ChatService } from './chat.service';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  /**
   * Single round-trip for the /chat page on mount. Returns conversations
   * + DM unread + group unread + trip unread (manager or driver flavour
   * depending on role) so the page does one network request instead of
   * four parallel ones competing for the connection pool.
   */
  @Get('init')
  getInit(
    @GetUser('id') userId: string,
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
  ) {
    return this.service.getInit(userId, companyId, role);
  }
}
