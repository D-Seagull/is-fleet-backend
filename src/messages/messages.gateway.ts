import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, forwardRef } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma/prisma.service';

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
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
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
      // Foreground flag — clients flip it via appActive/appBackground events.
      // Defaults to true on fresh connect (clients connect when they open
      // the app); mobile flips it back to false in onBackground.
      client.data.active = true;
      void client.join(userId);
      // Company-level room — kept for presence broadcasts (userPresence-
      // Changed / presenceSnapshot). Unread-related signals now go to
      // role-scoped rooms below (Phase 2 fan-out).
      if (companyId) {
        await client.join(`company-${companyId}`);

        // Role-scoped rooms for tripUnreadChanged routing. ADMIN/TEAMLEAD
        // see all chats; MANAGER only sees signals for trucks they're
        // assigned to; DRIVER receives signals through their personal
        // userId room (handled in the emit logic). Truck reassignment
        // mid-session won't move the manager between rooms — they need
        // to reconnect for that, which is an acceptable tradeoff.
        if (role === 'ADMIN' || role === 'TEAMLEAD') {
          await client.join(`company-admin-${companyId}`);
        } else if (role === 'MANAGER') {
          const trucks = await this.prisma.truck.findMany({
            where: { managerId: userId },
            select: { id: true },
          });
          await Promise.all(
            trucks.map((t) => client.join(`truck-watchers-${t.id}`)),
          );
        }

        // Tell this client who in their company is currently online so
        // they don't have to wait for the next presence event to render
        // the right dots.
        const sockets = await this.server
          .in(`company-${companyId}`)
          .fetchSockets();
        const onlineUserIds = Array.from(
          new Set(
            sockets
              .map((s) => (s.data as { userId?: string }).userId)
              .filter((id): id is string => typeof id === 'string'),
          ),
        );
        client.emit('presenceSnapshot', { userIds: onlineUserIds });

        // If this is the user's first socket in the company room, tell
        // everyone else they came online. (Skip the broadcast on the
        // 2nd+ socket — it's redundant and would flash the dot.)
        const mySockets = sockets.filter(
          (s) =>
            (s.data as { userId?: string }).userId === userId &&
            s.id !== client.id,
        );
        if (mySockets.length === 0) {
          this.server.to(`company-${companyId}`).emit('userPresenceChanged', {
            userId,
            online: true,
          });
        }
      }
      console.log(`[ws] ${client.id} → room:${userId} company:${companyId ?? 'n/a'}`);
    } catch {
      console.log(`[ws] ${client.id} connected without valid token`);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    const companyId = (client.data as { companyId?: string }).companyId;
    console.log(`Client disconnected: ${client.id} user:${userId ?? 'n/a'}`);
    if (!userId || !companyId) return;

    // Socket.io removes the socket from rooms BEFORE handleDisconnect
    // fires, so a fetch now reflects the post-disconnect state.
    const remaining = await this.server
      .in(`company-${companyId}`)
      .fetchSockets();
    const mineLeft = remaining.some(
      (s) => (s.data as { userId?: string }).userId === userId,
    );
    if (!mineLeft) {
      this.server.to(`company-${companyId}`).emit('userPresenceChanged', {
        userId,
        online: false,
      });
    }
  }

  /**
   * Client opt-in for a fresh presence snapshot. We already send one
   * automatically on connect, but the client's listener may not have
   * been registered yet — usePresenceSync re-asks once it is ready so
   * the very-first frame after login already has the dot in the right
   * colour.
   */
  @SubscribeMessage('requestPresence')
  async handleRequestPresence(@ConnectedSocket() client: Socket) {
    const companyId = (client.data as { companyId?: string }).companyId;
    if (!companyId) return;
    const sockets = await this.server
      .in(`company-${companyId}`)
      .fetchSockets();
    const onlineUserIds = Array.from(
      new Set(
        sockets
          .map((s) => (s.data as { userId?: string }).userId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    client.emit('presenceSnapshot', { userIds: onlineUserIds });
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
      // Echo the client-side tempId so the sender's UI can locate its
      // optimistic placeholder bubble and replace it with the real row.
      const payload = { ...message, tempId: dto.tempId ?? null };
      // Emit to the trip room (driver + manager in that trip) — these are
      // the only sockets that actually need the full message body to
      // render it in the chat.
      this.server.to(dto.tripId).emit('newMessage', payload);

      // Phase 2 fan-out: send the lightweight tripUnreadChanged signal
      // ONLY to the stakeholders who actually need their unread badges
      // invalidated. Drivers / managers of other trips no longer see
      // signals about chats they're not involved with.
      const companyId = client.data.companyId as string | undefined;
      const truckId = (message as { trip?: { truckId: string } }).trip?.truckId;
      const driverId = (message as { session?: { driverId: string | null } })
        .session?.driverId;
      const managerId = (message as { session?: { managerId: string | null } })
        .session?.managerId;
      const signal = { tripId: dto.tripId };

      if (companyId) {
        // ADMIN / TEAMLEAD of the company.
        this.server
          .to(`company-admin-${companyId}`)
          .emit('tripUnreadChanged', signal);
      }
      if (truckId) {
        // Managers assigned to this truck (not necessarily the current
        // session manager — they joined this room on connect via their
        // assignedTrucks list).
        this.server
          .to(`truck-watchers-${truckId}`)
          .emit('tripUnreadChanged', signal);
      }
      // Direct participants — covers the case where they're NOT in the
      // trip room (sidebar / different page) so their badge still
      // refreshes. Skip the sender (no unread for self).
      if (driverId && driverId !== senderId) {
        this.server.to(driverId).emit('tripUnreadChanged', signal);
      }
      if (managerId && managerId !== senderId) {
        this.server.to(managerId).emit('tripUnreadChanged', signal);
      }
      console.log('[ws] newMessage emitted to room', dto.tripId, 'id=', message.id);
      return payload;
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

  /**
   * Ephemeral "is typing" signal. Privacy: only the trip's current driver or
   * manager may broadcast — old participants who still hold the room can't
   * leak presence into the new pair's chat.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.tripId) return;
    const trip = await this.prisma.trip.findUnique({
      where: { id: body.tripId },
      select: { driverId: true, managerId: true },
    });
    if (!trip) return;
    if (userId !== trip.driverId && userId !== trip.managerId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    // Broadcast to everyone else in the trip room (skip the sender's socket).
    client.to(body.tripId).emit('userTyping', {
      tripId: body.tripId,
      user: { id: userId, firstName: user?.firstName ?? null, lastName: user?.lastName ?? null },
    });
  }

  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.tripId) return;
    client.to(body.tripId).emit('userStopTyping', {
      tripId: body.tripId,
      userId,
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

  emitMessageEdited(tripId: string, message: unknown) {
    this.server.to(tripId).emit('messageEdited', { tripId, message });
  }

  /** True only when at least one of the user's sockets is currently in the
   *  *foreground*. iOS keeps the socket alive a while after the app moves to
   *  background, so we can't rely on socket existence alone — clients flip
   *  `data.active` via appActive / appBackground events below. */
  async isUserOnline(userId: string): Promise<boolean> {
    if (!this.server) return false;
    const sockets = await this.server.in(userId).fetchSockets();
    return sockets.some((s) => s.data?.active === true);
  }

  @SubscribeMessage('appActive')
  handleAppActive(@ConnectedSocket() client: Socket) {
    client.data.active = true;
  }

  @SubscribeMessage('appBackground')
  handleAppBackground(@ConnectedSocket() client: Socket) {
    client.data.active = false;
  }
}
