import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const inviteToken = uuidv4();
    const inviteExpiry = new Date();
    inviteExpiry.setDate(inviteExpiry.getDate() + 7); //токен дійсний 7 днів

    const existing = await this.prisma.company.findFirst({
      where: {
        name: dto.name,
      },
    });

    if (existing)
      throw new BadRequestException('Company with this name already created');

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        inviteToken,
        inviteExpiry,
      },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;

    await this.mail.sendCompanyInvite(dto.email, dto.name, inviteLink);

    return {
      company,
      inviteLink,
    };
  }

  /**
   * Resolve the admin's own companyId from the DB. The global AdminInterceptor
   * scrubs `request.user.companyId` to `null` on admin requests (so admins
   * aren't scoped to a single tenant elsewhere), so we can't rely on
   * `@GetUser('companyId')` here — we look it up by admin's userId instead.
   */
  private async getAdminCompanyId(adminId: string): Promise<string | undefined> {
    if (!adminId) return undefined;
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { companyId: true },
    });
    return admin?.companyId ?? undefined;
  }

  async findAllCompanies(adminId?: string) {
    const excludeCompanyId = adminId
      ? await this.getAdminCompanyId(adminId)
      : undefined;
    return this.prisma.company.findMany({
      where: excludeCompanyId ? { NOT: { id: excludeCompanyId } } : undefined,
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  }

  async getStats(adminId?: string) {
    const excludeCompanyId = adminId
      ? await this.getAdminCompanyId(adminId)
      : undefined;
    const activeTripStatuses = [
      'ASSIGNED',
      'ACCEPTED',
      'ON_WAY',
      'ON_SITE',
      'LOADED',
    ] as const;

    const [
      companiesTotal,
      companiesActive,
      usersTotal,
      admins,
      teamleads,
      managers,
      drivers,
      driversOnline,
      managersOnline,
      activeTrips,
      recentCompanies,
    ] = await Promise.all([
      this.prisma.company.count({
        where: excludeCompanyId ? { NOT: { id: excludeCompanyId } } : undefined,
      }),
      this.prisma.company.count({
        where: {
          isActive: true,
          ...(excludeCompanyId ? { NOT: { id: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'ADMIN',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'TEAMLEAD',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'MANAGER',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'DRIVER',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'DRIVER',
          status: 'ONLINE',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.user.count({
        where: {
          role: { in: ['MANAGER', 'TEAMLEAD'] },
          status: 'ONLINE',
          isActive: true,
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.trip.count({
        where: {
          status: { in: [...activeTripStatuses] },
          ...(excludeCompanyId ? { NOT: { companyId: excludeCompanyId } } : {}),
        },
      }),
      this.prisma.company.findMany({
        where: excludeCompanyId ? { NOT: { id: excludeCompanyId } } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          createdAt: true,
          isActive: true,
          inviteExpiry: true,
          _count: { select: { users: true } },
        },
      }),
    ]);

    return {
      companies: {
        total: companiesTotal,
        active: companiesActive,
        deactivated: companiesTotal - companiesActive,
      },
      users: {
        total: usersTotal,
        byRole: {
          ADMIN: admins,
          TEAMLEAD: teamleads,
          MANAGER: managers,
          DRIVER: drivers,
        },
      },
      onlineNow: { drivers: driversOnline, managers: managersOnline },
      activeTrips,
      recentCompanies: recentCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        isActive: c.isActive,
        usersCount: c._count.users,
        awaitingInvite: c._count.users === 0,
      })),
    };
  }

  async findCompanyById(id: string, adminId?: string) {
    const excludeCompanyId = adminId
      ? await this.getAdminCompanyId(adminId)
      : undefined;
    if (excludeCompanyId && id === excludeCompanyId) {
      throw new NotFoundException('Компанія не знайдена');
    }
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        isActive: true,
        logo: true,
        accountingEmail: true,
        hrEmail: true,
        directorEmail: true,
        inviteToken: true,
        inviteExpiry: true,
      },
    });
    if (!company) throw new NotFoundException('Компанія не знайдена');

    const activeTripStatuses = [
      'ASSIGNED',
      'ACCEPTED',
      'ON_WAY',
      'ON_SITE',
      'LOADED',
    ] as const;

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      admins,
      teamleads,
      managers,
      drivers,
      driversOnline,
      managersOnline,
      trucksTotal,
      trucksActive,
      activeTrips,
      tripsThisMonth,
      pushCoverage,
      users,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { companyId: id, role: 'ADMIN', isActive: true },
      }),
      this.prisma.user.count({
        where: { companyId: id, role: 'TEAMLEAD', isActive: true },
      }),
      this.prisma.user.count({
        where: { companyId: id, role: 'MANAGER', isActive: true },
      }),
      this.prisma.user.count({
        where: { companyId: id, role: 'DRIVER', isActive: true },
      }),
      this.prisma.user.count({
        where: {
          companyId: id,
          role: 'DRIVER',
          status: 'ONLINE',
          isActive: true,
        },
      }),
      this.prisma.user.count({
        where: {
          companyId: id,
          role: { in: ['MANAGER', 'TEAMLEAD'] },
          status: 'ONLINE',
          isActive: true,
        },
      }),
      this.prisma.truck.count({ where: { companyId: id } }),
      this.prisma.truck.count({ where: { companyId: id, isActive: true } }),
      this.prisma.trip.count({
        where: { companyId: id, status: { in: [...activeTripStatuses] } },
      }),
      this.prisma.trip.count({
        where: { companyId: id, createdAt: { gte: monthAgo } },
      }),
      this.prisma.user.count({
        where: { companyId: id, isActive: true, pushTokens: { some: {} } },
      }),
      this.prisma.user.findMany({
        where: { companyId: id, isActive: true },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          statusUntil: true,
          avatar: true,
          createdAt: true,
        },
      }),
    ]);

    const usersTotal = admins + teamleads + managers + drivers;

    return {
      ...company,
      counts: {
        usersTotal,
        usersByRole: {
          ADMIN: admins,
          TEAMLEAD: teamleads,
          MANAGER: managers,
          DRIVER: drivers,
        },
        onlineNow: { drivers: driversOnline, managers: managersOnline },
        trucks: { total: trucksTotal, active: trucksActive },
        trips: { active: activeTrips, thisMonth: tripsThisMonth },
        pushCoverage: { withToken: pushCoverage, outOf: usersTotal },
      },
      users,
    };
  }

  async deactivateCompany(id: string) {
    return this.prisma.company.update({
      where: { id },
      data: { isActive: false },
    });
  }
  // admin.service.ts
  async resendInvite(id: string, email: string) {
    const company = await this.prisma.company.findFirst({ where: { id } });
    if (!company) throw new NotFoundException('Компанія не знайдена');

    const inviteLink = `${process.env.FRONTEND_URL}/auth/register?token=${company.inviteToken}`;
    await this.mail.sendCompanyInvite(email, company.name, inviteLink);

    return { message: 'Invite відправлено!' };
  }
}
