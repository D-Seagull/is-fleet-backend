import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { SmsService } from 'src/sms/sms.service';
import { normalizePhone } from 'src/common/utils/phone';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sms: SmsService,
  ) {}
  async adminLogin(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('Немає доступу');
    }

    const valid = await bcrypt.compare(dto.password, user.password!);
    if (!valid) throw new UnauthorizedException('Невірний email або пароль');

    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
    );
  }

  async register(dto: RegisterDto) {
    // Спочатку шукаємо по токену юзера (manager/driver)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        inviteToken: dto.inviteToken,
        inviteExpiry: { gt: new Date() }, // токен ще дійсний
      },
    });

    if (existingUser) {
      // Реєструємо manager або driver
      const hash = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          password: hash,
          inviteToken: null, // очищаємо токен
          inviteExpiry: null,
        },
      });

      return this.signToken(
        user.id,
        user.role,
        user.companyId,
        user.firstName,
        user.lastName,
      );
    }

    // Якщо не знайшли по юзеру — шукаємо по токену компанії (teamlead)
    const company = await this.prisma.company.findFirst({
      where: {
        inviteToken: dto.inviteToken,
      },
      include: {
        users: { where: { role: 'TEAMLEAD' } },
      },
    });

    if (!company)
      throw new BadRequestException('Невірний або прострочений токен');

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        email: dto.email,
        password: hash,
        role: 'TEAMLEAD',
        companyId: company.id,
      },
    });

    // якщо перший тімлід — оновлюємо дані компанії
    if (company.users.length === 0) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          accountingEmail: dto.accountingEmail,
          hrEmail: dto.hrEmail,
          directorEmail: dto.directorEmail,
        },
      });
    }

    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Login or password is wrong');

    const valid = await bcrypt.compare(dto.password, user.password!);
    if (!valid) throw new UnauthorizedException('Login or password is wrong');
    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
    );
  }
  private signToken(
    userId: string,
    role: string,
    companyId: string,
    firstName: string,
    lastName: string | null,
  ) {
    const payload = { sub: userId, role, companyId };
    return {
      access_token: this.jwt.sign(payload),
      user: {
        id: userId,
        role,
        companyId,
        firstName,
        lastName,
      },
    };
  }
  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        companyId: true,
        email: true,
        language: true,
        timezone: true,
        avatar: true, status: true, statusUntil: true,
        // For driver routing: which truck am I on, who is my manager.
        // Null for non-drivers — safe to expose either way.
        currentTruck: {
          select: {
            id: true,
            plate: true,
            status: true,
          },
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatar: true, status: true, statusUntil: true,
          },
        },
      },
    });
  }
  async checkInvite(token: string) {
    // Перевіряємо токен юзера
    const user = await this.prisma.user.findFirst({
      where: {
        inviteToken: token,
        inviteExpiry: { gt: new Date() },
      },
      include: { company: true },
    });

    if (user) {
      return {
        type: 'user',
        role: user.role,
        companyName: user.company.name,
        isFirstUser: false,
      };
    }

    // Перевіряємо токен компанії
    const company = await this.prisma.company.findFirst({
      where: { inviteToken: token },
      include: {
        users: { where: { role: 'TEAMLEAD' } },
      },
    });

    if (!company) throw new BadRequestException('Невірний токен');

    return {
      type: 'company',
      role: 'TEAMLEAD',
      companyName: company.name,
      isFirstUser: company.users.length === 0,
    };
  }

  // ─── Driver OTP login ───────────────────────────────────────────────────────

  /**
   * Step 1 of driver login. We never reveal whether the phone is registered:
   * the response is always 200 OK to prevent phone-number enumeration.
   * If the phone matches an active DRIVER, an SMS is sent with a 6-digit code.
   */
  async requestDriverOtp(phoneInput: string) {
    const phone = normalizePhone(phoneInput);
    this.logger.log(
      `requestDriverOtp called: input="${phoneInput}" → normalized="${phone ?? 'INVALID'}"`,
    );

    if (!phone) {
      // Bad shape — silently bail to avoid leaking which formats are valid.
      return { ok: true };
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user || user.role !== 'DRIVER' || !user.isActive) {
      this.logger.warn(
        `OTP request for ${phone}: no active DRIVER row found — returning ok:true silently`,
      );
      return { ok: true };
    }

    // Cooldown — one SMS per phone per minute.
    const lastSent = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (lastSent) {
      throw new HttpException(
        'Please wait before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.create({
      data: { phone, code, userId: user.id, expiresAt },
    });

    await this.sms.send(phone, `Your IS Fleet code: ${code}`);

    return { ok: true };
  }

  /**
   * Step 2 of driver login. Looks up the most recent unused, non-expired OTP
   * for the given phone and verifies the code. On success the OTP is marked
   * usedAt and we issue a JWT — companyId is read straight from the User row,
   * so the driver never has to pick a company.
   */
  async verifyDriverOtp(phoneInput: string, code: string) {
    const phone = normalizePhone(phoneInput);
    this.logger.log(
      `verifyDriverOtp called: input="${phoneInput}" → normalized="${phone ?? 'INVALID'}", code=${code}`,
    );

    if (!phone) {
      throw new UnauthorizedException('Code is invalid or expired.');
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    if (!otp) {
      throw new UnauthorizedException('Code is invalid or expired.');
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      // Lock this OTP — driver must request a fresh one.
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { usedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Too many attempts. Please request a new code.',
      );
    }

    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Code is invalid or expired.');
    }

    if (otp.user.role !== 'DRIVER' || !otp.user.isActive) {
      throw new ForbiddenException('Driver account is not active.');
    }

    // Mark as used + invalidate any other pending OTPs for this phone.
    await this.prisma.otpCode.updateMany({
      where: { phone, usedAt: null },
      data: { usedAt: new Date() },
    });

    return this.signToken(
      otp.user.id,
      otp.user.role,
      otp.user.companyId,
      otp.user.firstName,
      otp.user.lastName,
    );
  }
}
