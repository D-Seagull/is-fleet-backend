import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
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

    return this.signToken(user.id, user.role, user.companyId);
  }

  async register(dto: RegisterDto) {
    // знаходимо компанію по токену
    const company = await this.prisma.company.findFirst({
      where: {
        inviteToken: dto.inviteToken,
        inviteExpiry: { gte: new Date() }, // токен ще дійсний
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
        name: dto.name,
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

    return this.signToken(user.id, user.role, user.companyId);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Login or password is wrong');

    const valid = await bcrypt.compare(dto.password, user.password!);
    if (!valid) throw new UnauthorizedException('Login or password is wrong');
    return this.signToken(user.id, user.role, user.companyId);
  }
  private signToken(userId: string, role: string, companyId: string) {
    const payload = { sub: userId, role, companyId };
    console.log(payload);
    return {
      access_token: this.jwt.sign(payload),
    };
  }
}
