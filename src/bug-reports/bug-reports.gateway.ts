import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { corsOrigin } from 'src/common/cors-origin';

/**
 * Shares the default-namespace socket server with the chat gateways, so the
 * `user:${userId}` rooms they populate on connect are reachable here. We only
 * emit — connection/room-join is already handled by MessagesGateway et al.
 */
@WebSocketGateway({ cors: { origin: corsOrigin, credentials: true } })
export class BugReportsGateway {
  @WebSocketServer()
  server: Server;

  /** Push a freshly filed report to every admin's socket room in real time. */
  notifyAdmins(adminIds: string[], report: unknown): void {
    for (const id of adminIds) {
      this.server.to(`user:${id}`).emit('bug_report:new', report);
    }
  }
}
