import { ConfigService } from '@nestjs/config';
export declare class MailService {
    private config;
    private transporter;
    constructor(config: ConfigService);
    sendAdvanceRequest(from: string, to: string, cc: string | null, driverName: string, amount: number, reason: string): Promise<void>;
    sendCompanyInvite(to: string, companyName: string, inviteLink: string): Promise<void>;
    sendManagerInvite(to: string, inviteLink: string): Promise<void>;
}
