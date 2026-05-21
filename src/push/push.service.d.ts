import { PrismaService } from "../prisma/prisma.service";
export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    categoryId?: string;
    sound?: 'default' | null;
}
export declare class PushService {
    private prisma;
    private readonly logger;
    private readonly expo;
    constructor(prisma: PrismaService);
    sendToUsers(userIds: string[], payload: PushPayload): Promise<void>;
}
