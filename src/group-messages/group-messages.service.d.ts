import { PrismaService } from "../prisma/prisma.service";
export declare class GroupMessagesService {
    private prisma;
    constructor(prisma: PrismaService);
    getMessages(groupId: string): Promise<({
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
        groupId: string;
    })[]>;
    createMessage(groupId: string, senderId: string, content: string): Promise<{
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
        groupId: string;
    }>;
}
