import { ConfigService } from '@nestjs/config';
export declare class SmsService {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly fromNumber;
    constructor(config: ConfigService);
    send(to: string, body: string): Promise<void>;
}
