import { PrismaService } from '../prisma/prisma.service';
export declare class DirectMessagesService {
    private prisma;
    constructor(prisma: PrismaService);
    getMessages(userId1: string, userId2: string): import(".prisma/client").Prisma.PrismaPromise<({
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
    createMessage(senderId: string, receiverId: string, content: string): import(".prisma/client").Prisma.Prisma__DirectMessageClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    getConversations(userId: string): Promise<any[]>;
    markAsRead(userId: string, senderId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    getUnreadCount(userId: string, senderId: string): Promise<number>;
}
