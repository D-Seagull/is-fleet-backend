import { TruckStatus } from '@prisma/client';
export declare class UpdateTruckDto {
    plate?: string;
    status?: TruckStatus;
    currentDriverId?: string | null;
    managerId?: string | null;
}
