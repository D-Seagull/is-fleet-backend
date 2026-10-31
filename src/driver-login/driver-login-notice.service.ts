import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { SmsService } from 'src/sms/sms.service';
import { t } from 'src/i18n/i18n';
import { fullName } from 'src/common/utils/full-name';

// Drivers without a timezone on file are almost all on EU routes.
const FALLBACK_TZ = 'Europe/Warsaw';

/**
 * Tells the driver whenever a sign-in code went through their manager —
 * when it is issued and when it is used — by push AND SMS, so a manager
 * signing in as the driver behind their back can't go unnoticed.
 * Best effort: a failed push / SMS is logged, never thrown.
 */
@Injectable()
export class DriverLoginNoticeService {
  private readonly logger = new Logger(DriverLoginNoticeService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private sms: SmsService,
  ) {}

  async managerCode(
    kind: 'issued' | 'used',
    driverId: string,
    managerId: string | null,
    at: Date = new Date(),
  ): Promise<void> {
    try {
      const [driver, manager] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: driverId },
          select: { phone: true, uiLocale: true, timezone: true },
        }),
        managerId
          ? this.prisma.user.findUnique({
              where: { id: managerId },
              select: { firstName: true, lastName: true },
            })
          : null,
      ]);
      if (!driver) return;
      const name = manager ? fullName(manager) : '—';
      const time = (lang: string) => formatAt(at, lang, driver.timezone);

      await this.push.sendLocalizedToUsers(
        [driverId],
        (lang) => ({
          title: t(lang, 'push.loginCode.title'),
          body: t(lang, `push.loginCode.${kind}`, {
            manager: name,
            time: time(lang),
          }),
        }),
        // A security notice — show it even with the app open.
        { data: { type: 'LOGIN_CODE', kind }, whenActive: 'push' },
      );
      if (driver.phone) {
        await this.sms.send(
          driver.phone,
          t(driver.uiLocale, `sms.loginCode.${kind}`, {
            manager: name,
            time: time(driver.uiLocale),
          }),
        );
      }
    } catch (err) {
      this.logger.error(
        `Login-code notice (${kind}) to driver ${driverId} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/** "31.10, 14:05" in the driver's own time zone. */
export function formatAt(at: Date, lang: string, tz: string | null): string {
  const locale = lang.toLowerCase() === 'uk' ? 'uk-UA' : lang.toLowerCase();
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // 24-hour everywhere — EU drivers, and "02:05 PM" reads oddly in an SMS.
    hourCycle: 'h23',
    timeZone: tz || FALLBACK_TZ,
  };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(at);
  } catch {
    // Unknown tz / locale string — fall back rather than drop the notice.
    return new Intl.DateTimeFormat('en-GB', {
      ...opts,
      timeZone: FALLBACK_TZ,
    }).format(at);
  }
}
