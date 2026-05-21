import { AlarmRecurrence } from '@prisma/client';
export declare class UpdateAlarmDto {
    title?: string;
    note?: string;
    time?: string;
    recurrence?: AlarmRecurrence;
}
