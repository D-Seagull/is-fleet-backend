import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { JwtUser } from './interfaces/jwt-user.interface';
export declare class AuthController {
    private AuthService;
    constructor(AuthService: AuthService);
    register(dto: RegisterDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
    login(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
    checkInvite(token: string): Promise<{
        type: string;
        role: string;
        companyName: string;
        isFirstUser: boolean;
    }>;
    me(user: JwtUser): Promise<{
        name: string | null;
        email: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        companyId: string;
        manager: {
            name: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
        } | null;
        currentTruck: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
        } | null;
    } | null>;
    requestDriverOtp(dto: RequestOtpDto): Promise<{
        ok: boolean;
    }>;
    verifyDriverOtp(dto: VerifyOtpDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
}
