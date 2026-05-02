import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';

import { CreateMessageDto } from './dto/create-message.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow all origins in dev; in production restrict via FRONTEND_URL
      cb(null, true);
    },
    credentials: true,
  },
})
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private messagesService: MessagesService,

    private jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    try {
      // Support both:
      //  - mobile app: query.userId (full JWT token, despite the field name)
      //  - web frontend: auth.token
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.userId as string | undefined);

      if (!token) throw new Error('No token');

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      const userId = payload.sub as string;
      client.data.userId = userId;
      void client.join(userId);
      console.log(`[ws] ${client.id} → room:${userId}`);
    } catch {
      console.log(`[ws] ${client.id} connected without valid token`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinTrip')
  async handleJoinTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    await client.join(body.tripId);
    console.log(`[ws] ${client.id} joined room:${body.tripId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleTripMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CreateMessageDto,
  ) {
    // Always use the authenticated userId from the JWT — never trust client-sent senderId
    const senderId = client.data.userId as string | undefined;
    if (!senderId) return;

    const message = await this.messagesService.create(senderId, dto);
    this.server.to(dto.tripId).emit('newMessage', message);
    return message;
  }
}
