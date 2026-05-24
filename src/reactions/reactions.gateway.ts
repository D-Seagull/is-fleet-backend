import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { ReactionRow, ReactionTarget } from './reactions.service';

@WebSocketGateway({ cors: { origin: '*' } })
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
      this.server.to(room).emit('reaction_changed', payload);
    }
  }
}
