import { ConfigService } from '@nestjs/config';
export declare class SupabaseStorageService {
    private config;
    private client;
    constructor(config: ConfigService);
    uploadFile(file: Express.Multer.File, folder?: string): Promise<{
        storagePath: string;
    }>;
    uploadWithUrl(file: Express.Multer.File, folder: string): Promise<{
        url: string;
        storagePath: string;
    }>;
    deleteFile(storagePath: string): Promise<void>;
    getSignedUrl(storagePath: string, expiresIn?: number, download?: string): Promise<string>;
}
