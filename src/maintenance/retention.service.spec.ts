import { RetentionService } from './retention.service';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-07T03:15:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('RetentionService (P1-12)', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let service: RetentionService;

  beforeEach(() => {
    const del = () => ({
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    });
    prisma = {
      otpCode: del(),
      refreshToken: del(),
      passwordResetToken: del(),
      driverTransfer: del(),
      authAuditLog: { updateMany: jest.fn().mockResolvedValue({ count: 5 }) },
    };
    service = new RetentionService(prisma as never);
  });

  it('purges every kind and reports what it removed', async () => {
    await expect(service.purgeAll(NOW)).resolves.toEqual({
      otpCodes: 3,
      refreshTokens: 3,
      passwordResetTokens: 3,
      driverTransfers: 3,
      auditIps: 5,
    });
  });

  it('OTP rows: expired or used more than a day ago', async () => {
    await service.purgeAll(NOW);
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: ago(DAY) } }, { usedAt: { lt: ago(DAY) } }],
      },
    });
  });

  it('refresh tokens: expired or revoked more than a day ago (the 60 s grace window is long past)', async () => {
    await service.purgeAll(NOW);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: ago(DAY) } }, { revokedAt: { lt: ago(DAY) } }],
      },
    });
  });

  it('reset tokens: expired or used more than a day ago', async () => {
    await service.purgeAll(NOW);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: ago(DAY) } }, { usedAt: { lt: ago(DAY) } }],
      },
    });
  });

  it('transfer requests: a month after they ended', async () => {
    await service.purgeAll(NOW);
    const where = prisma.driverTransfer.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { expiresAt: { lt: ago(30 * DAY) } },
      { acceptedAt: { lt: ago(30 * DAY) } },
      { declinedAt: { lt: ago(30 * DAY) } },
    ]);
  });

  it('audit log: only the IP is cleared after 90 days — the row stays', async () => {
    await service.purgeAll(NOW);
    expect(prisma.authAuditLog.updateMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: ago(90 * DAY) }, ip: { not: null } },
      data: { ip: null },
    });
    expect(prisma.authAuditLog).not.toHaveProperty('deleteMany');
  });

  it('one failing step does not skip the others', async () => {
    prisma.otpCode.deleteMany.mockRejectedValue(new Error('db hiccup'));
    const res = await service.purgeAll(NOW);
    expect(res.otpCodes).toBe(0);
    expect(res.refreshTokens).toBe(3);
    expect(res.auditIps).toBe(5);
  });

  it('a second run while one is in progress does nothing', async () => {
    let release: () => void = () => undefined;
    prisma.otpCode.deleteMany.mockReturnValue(
      new Promise((r) => {
        release = () => r({ count: 1 });
      }),
    );
    const first = service.purgeAll(NOW);
    const second = await service.purgeAll(NOW);
    expect(second.otpCodes).toBe(0);
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
