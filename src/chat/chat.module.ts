import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';
import { GroupMessagesModule } from '../group-messages/group-messages.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    DirectMessagesModule,
    GroupMessagesModule,
    forwardRef(() => MessagesModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
