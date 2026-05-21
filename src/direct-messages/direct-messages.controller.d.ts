import { DirectMessagesService } from './direct-messages.service';
export declare class DirectMessagesController {
    private service;
    constructor(service: DirectMessagesService);
    getConversations(userId: string): Promise<any[]>;
    getMessages(currentUserId: string, otherUserId: string): import(".prisma/client").Prisma.PrismaPromise<({
        sender: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        senderId: string;
        isRead: boolean;
        receiverId: string;
    })[]>;
    markAsRead(currentUserId: string, senderId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
