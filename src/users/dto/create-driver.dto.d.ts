import { Language } from '@prisma/client';
export declare class CreateDriverDto {
    name: string;
    phone: string;
    password?: string;
    language?: Language;
}
