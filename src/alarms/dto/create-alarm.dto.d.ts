import { AlarmRecurrence } from '@prisma/client';
export declare class CreateAlarmDto {
    targetUserId: string;
    title: string;
    note?: string;
    time: string;
    tripId?: string;
    recurrence?: AlarmRecurrence;
}
