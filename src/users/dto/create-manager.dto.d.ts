import { Language } from '@prisma/client';
export declare class CreateManagerDto {
    email: string;
    phone: string;
    name?: string;
    language?: Language;
}
