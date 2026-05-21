import { PrismaService } from "../prisma/prisma.service";
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { MessagesGateway } from "../messages/messages.gateway";
export declare class AnnouncementsService {
    private prisma;
    private messagesGateway;
    constructor(prisma: PrismaService, messagesGateway: MessagesGateway);
    create(companyId: string, userId: string, dto: CreateAnnouncementDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        updatedAt: Date;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    }>;
    findAll(companyId: string | null, userId: string): Promise<({
        group: {
            name: string;
            id: string;
        } | null;
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        reads: {
            userId: string;
            readAt: Date;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        updatedAt: Date;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    })[]>;
    markAsRead(announcementId: string, userId: string): Promise<{
        id: string;
        userId: string;
        announcementId: string;
        readAt: Date;
    }>;
    createDraft(companyId: string, userId: string, dto: CreateDraftDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    }>;
    findDrafts(companyId: string | null, isTemplate: boolean | undefined, userId: string): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    }[]>;
    publishDraft(draftId: string, companyId: string, userId: string): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        updatedAt: Date;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    }>;
    update(id: string, userId: string, dto: UpdateAnnouncementDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        content: string;
        title: string;
        updatedAt: Date;
        groupId: string | null;
        createdBy: string;
        target: import(".prisma/client").$Enums.AnnouncementTarget;
        isTemplate: boolean;
    }>;
    removeDraft(id: string): Promise<{
        message: string;
    }>;
}
