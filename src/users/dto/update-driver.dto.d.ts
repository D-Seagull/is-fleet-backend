import { Language } from '@prisma/client';
export declare class UpdateDriverDto {
    name?: string;
    phone?: string;
    language?: Language;
    managerId?: string | null;
    teamleadId?: string | null;
    truckId?: string | null;
}
