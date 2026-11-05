import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BugStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase-storage/supabase-storage.service';
import { PushService } from '../push/push.service';
import { BugReportsGateway } from './bug-reports.gateway';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { fullName } from '../common/utils/full-name';

// Shape returned to the reporter and broadcast to admins. Enough to render a
// chat-style card without a second round-trip.
const reportInclude = {
  reporter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
    },
  },
  company: { select: { id: true, name: true } },
} as const;

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private push: PushService,
    private gateway: BugReportsGateway,
  ) {}

  async create(
    reporterId: string,
    role: Role,
    dto: CreateBugReportDto,
    files: Express.Multer.File[],
  ) {
    // Resolve the reporter's company straight from their row — not from the
    // token. The global AdminInterceptor nulls req.user.companyId for admins,
    // so reading it here guarantees the report is always tagged with the
    // company the reporter actually belongs to.
    // A report needs *something* — either words or a screenshot.
    const description = dto.description?.trim() ?? '';
    if (!description && files.length === 0) {
      throw new BadRequestException('Provide a description or a screenshot');
    }

    const reporter = await this.prisma.user.findUnique({
      where: { id: reporterId },
      select: { companyId: true },
    });

    // Upload screenshots first; a failed upload should fail the whole report
    // rather than silently drop the attachment.
    // Only storage paths are kept; links are signed when an admin reads the
    // report (withSignedScreenshots) — no long-lived URL in the database.
    const screenshots: string[] = [];
    for (const file of files) {
      const { storagePath } = await this.storage.uploadFile(
        file,
        'bug-reports',
      );
      screenshots.push(storagePath);
    }

    const report = await this.prisma.bugReport.create({
      data: {
        reporterId,
        role,
        companyId: reporter?.companyId ?? null,
        description,
        screenshots,
        appName: dto.appName ?? null,
        appVersion: dto.appVersion ?? null,
        platform: dto.platform ?? null,
        route: dto.route ?? null,
        socketState: dto.socketState ?? null,
        logs: dto.logs?.trim() || null,
      },
      include: reportInclude,
    });

    const signed = await this.withSignedScreenshots(report);
    // Best-effort fan-out: never let a notification failure fail the report.
    void this.notifyAdmins(signed);

    return signed;
  }

  /**
   * Screenshots are stored as storage paths and signed per read (24 h,
   * shared sign cache). A full URL is a row from before paths were stored and
   * not yet migrated — passed through as is.
   */
  private async withSignedScreenshots<T extends { screenshots: string[] }>(
    report: T,
  ): Promise<T> {
    const screenshots = await Promise.all(
      report.screenshots.map((s) =>
        /^https?:\/\//i.test(s)
          ? Promise.resolve(s)
          : this.storage.getSignedUrlOrNull(s),
      ),
    );
    return {
      ...report,
      screenshots: screenshots.filter((s): s is string => !!s),
    };
  }

  private async notifyAdmins(
    report: Awaited<ReturnType<BugReportsService['create']>>,
  ): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
      const adminIds = admins.map((a) => a.id);
      if (adminIds.length === 0) return;

      this.gateway.notifyAdmins(adminIds, report);

      const who = fullName(report.reporter) || report.reporter.role;
      const preview =
        report.description.length > 80
          ? `${report.description.slice(0, 80)}…`
          : report.description;
      await this.push.sendToUsers(adminIds, {
        title: '🐞 Bug report',
        body: `${who}: ${preview}`,
        data: { type: 'bug_report', id: report.id },
      });
    } catch (e) {
      this.logger.error(
        'Failed to notify admins of new bug report',
        e as Error,
      );
    }
  }

  async findAll(status?: BugStatus) {
    const reports = await this.prisma.bugReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: reportInclude,
    });
    return Promise.all(reports.map((r) => this.withSignedScreenshots(r)));
  }

  async updateStatus(id: string, status: BugStatus) {
    const existing = await this.prisma.bugReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bug report not found');

    const updated = await this.prisma.bugReport.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
      },
      include: reportInclude,
    });
    return this.withSignedScreenshots(updated);
  }
}
