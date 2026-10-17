import { Injectable } from '@nestjs/common';
import type { RemoteSocket, Server } from 'socket.io';
import {
  isSocketActive,
  type PhoneSocketData,
} from 'src/common/utils/phone-on-screen';

// RemoteSocket's event-map generics are irrelevant here — we only read `data`
// and emit one event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySocket = RemoteSocket<any, PhoneSocketData & { userId?: string }>;

/**
 * Who is using IS Fleet right now — the phone app on screen or the web /
 * desktop app in use (see `isSocketActive`). PushService asks it before every
 * push: a person who is looking at the app gets the news in-app instead of a
 * banner on top of it.
 *
 * It lives in PushModule (imported by every module that sends pushes) and gets
 * the Socket.io server from MessagesGateway on init — all gateways share one
 * server, and each socket sits in a room named after its user id.
 */
@Injectable()
export class PresenceService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  /** The sockets of each given user that are actively in use right now. */
  async activeSockets(userIds: string[]): Promise<Map<string, AnySocket[]>> {
    const active = new Map<string, AnySocket[]>();
    if (!this.server || userIds.length === 0) return active;
    const wanted = new Set(userIds);
    const now = Date.now();
    const sockets = (await this.server
      .in(userIds)
      .fetchSockets()) as unknown as AnySocket[];
    for (const s of sockets) {
      const userId = s.data?.userId;
      if (!userId || !wanted.has(userId) || !isSocketActive(s.data, now)) continue;
      const list = active.get(userId);
      if (list) list.push(s);
      else active.set(userId, [s]);
    }
    return active;
  }
}
