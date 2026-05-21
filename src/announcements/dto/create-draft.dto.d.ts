import { AnnouncementTarget } from '@prisma/client';
export declare class CreateDraftDto {
    title: string;
    content: string;
    target?: AnnouncementTarget;
    isTemplate?: boolean;
    groupId?: string;
}
