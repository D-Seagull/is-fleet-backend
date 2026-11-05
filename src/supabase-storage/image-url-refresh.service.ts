import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  signedUrlExpiry,
  STORED_IMAGE_TTL,
  SupabaseStorageService,
} from './supabase-storage.service';

const DAY_MS = 24 * 3600 * 1000;
// Re-sign when less than this is left, so clients never hold a dead link.
const RESIGN_BEFORE_MS = 3 * DAY_MS;
// Anything valid for longer than a week (+ slack) is an old ~10-year link.
const MAX_LEFT_MS = STORED_IMAGE_TTL * 1000 + DAY_MS;

type Row = { id: string; url: string | null; path: string | null };

/**
 * Keeps the signed URLs stored in the database short-lived (audit P1-11):
 * user avatars, company logos and group pictures get a 7-day link, and every
 * night the ones with less than 3 days left are re-signed. Old ~10-year links
 * are re-signed on the first run after deploy (shortly after boot) — that is
 * the data migration; SQL can't sign a URL.
 *
 * Clients just see a new URL about once a week and download the image again.
 */
@Injectable()
export class ImageUrlRefreshService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImageUrlRefreshService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    // Off the boot path: a minute later, so it never slows a deploy.
    setTimeout(() => void this.refreshAll(), 60_000).unref();
  }

  @Cron('30 3 * * *')
  nightly() {
    return this.refreshAll();
  }

  /** True when `url` should be re-signed now (expiring, ancient or unreadable). */
  static needsResign(url: string | null, now = Date.now()): boolean {
    if (!url) return true;
    const exp = signedUrlExpiry(url);
    if (!exp) return true;
    const left = exp.getTime() - now;
    return left < RESIGN_BEFORE_MS || left > MAX_LEFT_MS;
  }

  async refreshAll(): Promise<{
    users: number;
    companies: number;
    groups: number;
  }> {
    if (this.running) return { users: 0, companies: 0, groups: 0 };
    this.running = true;
    try {
      const users = await this.refresh(
        (
          await this.prisma.user.findMany({
            where: { avatarPublicId: { not: null }, deletedAt: null },
            select: { id: true, avatar: true, avatarPublicId: true },
          })
        ).map((u) => ({ id: u.id, url: u.avatar, path: u.avatarPublicId })),
        (id, url) =>
          this.prisma.user.update({ where: { id }, data: { avatar: url } }),
      );
      const companies = await this.refresh(
        (
          await this.prisma.company.findMany({
            where: { logoPublicId: { not: null } },
            select: { id: true, logo: true, logoPublicId: true },
          })
        ).map((c) => ({ id: c.id, url: c.logo, path: c.logoPublicId })),
        (id, url) =>
          this.prisma.company.update({ where: { id }, data: { logo: url } }),
      );
      const groups = await this.refresh(
        (
          await this.prisma.group.findMany({
            where: { avatarPublicId: { not: null } },
            select: { id: true, avatar: true, avatarPublicId: true },
          })
        ).map((g) => ({ id: g.id, url: g.avatar, path: g.avatarPublicId })),
        (id, url) =>
          this.prisma.group.update({ where: { id }, data: { avatar: url } }),
      );
      if (users + companies + groups > 0) {
        this.logger.log(
          `re-signed ${users} avatars, ${companies} logos, ${groups} group pictures`,
        );
      }
      return { users, companies, groups };
    } catch (e) {
      this.logger.error('image URL refresh failed', e as Error);
      return { users: 0, companies: 0, groups: 0 };
    } finally {
      this.running = false;
    }
  }

  private async refresh(
    rows: Row[],
    save: (id: string, url: string) => Promise<unknown>,
  ): Promise<number> {
    let done = 0;
    for (const row of rows) {
      if (!row.path || !ImageUrlRefreshService.needsResign(row.url)) continue;
      // A file deleted by hand from the bucket: leave the row; the client
      // already falls back to initials when the image doesn't load.
      const url = await this.storage.getSignedUrlOrNull(
        row.path,
        STORED_IMAGE_TTL,
      );
      if (!url) continue;
      await save(row.id, url);
      done++;
    }
    return done;
  }
}
