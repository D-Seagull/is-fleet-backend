import { AnnouncementTarget } from '@prisma/client';
export declare class CreateAnnouncementDto {
    title: string;
    content: string;
    target?: AnnouncementTarget;
    groupId?: string;
}
