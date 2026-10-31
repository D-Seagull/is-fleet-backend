import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupportContactService } from 'src/support-contact/support-contact.service';
import { t } from 'src/i18n/i18n';
import { fullName } from 'src/common/utils/full-name';

// Drivers without a timezone on file are almost all on EU routes.
const FALLBACK_TZ = 'Europe/Warsaw';

/**
 * Tells a driver, through the "IS Fleet contact" chat, whenever their sign-in
 * is touched by someone else: a manager code issued or used, their phone
 * number changed by a manager. A manager signing in as the driver, or moving
 * the account to another number, can't go unnoticed. Best effort.
 */
@Injectable()
export class DriverLoginNoticeService {
  constructor(
    private prisma: PrismaService,
    private contact: SupportContactService,
  ) {}

  private async context(driverId: string, managerId: string | null) {
    const [driver, manager] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: driverId },
        select: { timezone: true },
      }),
      managerId
        ? this.prisma.user.findUnique({
            where: { id: managerId },
            select: { firstName: true, lastName: true },
          })
        : null,
    ]);
    return {
      tz: driver?.timezone ?? null,
      name: manager ? fullName(manager) : '—',
    };
  }

  async managerCode(
    kind: 'issued' | 'used',
    driverId: string,
    managerId: string | null,
    at: Date = new Date(),
  ): Promise<void> {
    const { tz, name } = await this.context(driverId, managerId);
    await this.contact.notify(driverId, (locale) =>
      t(locale, `contact.loginCode.${kind}`, {
        manager: name,
        time: formatAt(at, locale, tz),
      }),
    );
  }

  async phoneChanged(
    driverId: string,
    managerId: string | null,
    phone: string,
    at: Date = new Date(),
  ): Promise<void> {
    const { tz, name } = await this.context(driverId, managerId);
    await this.contact.notify(driverId, (locale) =>
      t(locale, 'contact.phoneChanged', {
        manager: name,
        phone,
        time: formatAt(at, locale, tz),
      }),
    );
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
    // 24-hour everywhere — EU drivers, and "02:05 PM" reads oddly in a chat.
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
