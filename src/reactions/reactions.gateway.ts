import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { ReactionRow, ReactionTarget } from './reactions.service';
import { corsOrigin } from 'src/common/cors-origin';

@WebSocketGateway({ cors: { origin: corsOrigin, credentials: true } })
export class ReactionsGateway {
  @WebSocketServer()
  server: Server;

  /**
   * Broadcast a reaction change to the relevant rooms. Caller picks the
   * recipients (user-rooms for DM, group-room for group, trip-room for
   * trip chat).
   */
  emit(
    targetType: ReactionTarget,
    targetId: string,
    reactions: ReactionRow[],
    rooms: string[],
  ) {
    const payload = { targetType, targetId, reactions };
    for (const room of rooms) {
      const clients = this.server.sockets.adapter.rooms.get(room);
      const size = clients?.size ?? 0;
      console.log(
        `[reactions] emit ${targetType} ${targetId} → room=${room} clients=${size} reactions=${reactions.length}`,
      );
      this.server.to(room).emit('reaction_changed', payload);
    }
  }
}
