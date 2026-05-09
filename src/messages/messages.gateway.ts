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
      const companyId = payload.companyId as string | undefined;
      const role = payload.role as string | undefined;
      client.data.userId = userId;
      client.data.companyId = companyId;
      client.data.role = role;
      void client.join(userId);
      // Company-level room so managers receive newMessage events from any
      // trip without having to explicitly join a trip room first.
      if (companyId) {
        void client.join(`company-${companyId}`);
      }
      console.log(`[ws] ${client.id} → room:${userId} company:${companyId ?? 'n/a'}`);
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
    console.log('[ws] sendMessage from', client.id, 'senderId=', senderId, 'dto=', dto);
    if (!senderId) {
      console.warn('[ws] sendMessage REJECTED — no senderId on socket', client.id);
      return;
    }

    try {
      const message = await this.messagesService.create(senderId, dto);
      // Emit to the trip room (driver + dispatcher in that trip).
      this.server.to(dto.tripId).emit('newMessage', message);
      // Also emit to the company room so managers on the trucks-list page
      // receive instant unread-summary invalidation without joining the trip.
      const companyId = client.data.companyId as string | undefined;
      if (companyId) {
        this.server.to(`company-${companyId}`).emit('newMessage', message);
      }
      console.log('[ws] newMessage emitted to room', dto.tripId, 'id=', message.id);
      return message;
    } catch (e) {
      console.error('[ws] sendMessage FAILED', e);
      throw e;
    }
  }

  @SubscribeMessage('markTripRead')
  async handleMarkTripRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = client.data.userId as string | undefined;
    const userRole = (client.data.role as string | undefined) ?? '';
    if (!userId || !body?.tripId) return;
    const result = await this.messagesService.markTripRead(
      body.tripId,
      userId,
      userRole,
    );
    if (result.messageIds.length === 0 && result.documentIds.length === 0) return;
    // Notify everyone in the trip room (incl. the original sender) so their
    // bubbles can flip to ✓✓.
    this.server.to(body.tripId).emit('tripMessagesRead', {
      tripId: body.tripId,
      readerId: userId,
      messageIds: result.messageIds,
      documentIds: result.documentIds,
    });
  }

  // Called from DocumentsService after an HTTP upload completes — pushes the
  // new doc to everyone in the trip room so the chat timeline updates without
  // a refetch.
  emitNewDocument(tripId: string, doc: unknown) {
    this.server.to(tripId).emit('newDocument', doc);
  }

  emitDocumentDeleted(tripId: string, documentId: string) {
    this.server.to(tripId).emit('documentDeleted', { tripId, documentId });
  }

  emitMessageDeleted(tripId: string, messageId: string) {
    this.server.to(tripId).emit('messageDeleted', { tripId, messageId });
  }
}
