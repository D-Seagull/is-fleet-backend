import { GroupMessagesService } from './group-messages.service';
export declare class GroupMessagesController {
    private service;
    constructor(service: GroupMessagesService);
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
}
