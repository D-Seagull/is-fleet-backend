import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService } from './direct-messages.service';
import { DirectMessagesController } from './direct-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupMessagesModule } from 'src/group-messages/group-messages.module';
@Module({
  imports: [
    PrismaModule,
    GroupMessagesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [DirectMessagesController],
  providers: [DirectMessagesGateway, DirectMessagesService],
})
export class DirectMessagesModule {}
