import { BugReportsService } from './bug-reports.service';

jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

// P1-11: screenshots are stored as storage paths and signed when read —
// no long-lived link in the database.
describe('BugReportsService — screenshots', () => {
  let prisma: {
    user: Record<string, jest.Mock>;
    bugReport: Record<string, jest.Mock>;
  };
  let storage: Record<string, jest.Mock>;
  let service: BugReportsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ companyId: 'c1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      bugReport: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'b1',
          ...data,
          reporter: { firstName: 'A', lastName: null, role: 'DRIVER' },
        })),
        findMany: jest.fn(),
      },
    };
    storage = {
      uploadFile: jest
        .fn()
        .mockResolvedValue({ storagePath: 'bug-reports/s1.jpg' }),
      getSignedUrlOrNull: jest.fn((p: string) =>
        Promise.resolve(`https://signed/${p}`),
      ),
    };
    service = new BugReportsService(
      prisma as never,
      storage as never,
      { sendToUsers: jest.fn() } as never,
      { notifyAdmins: jest.fn() } as never,
    );
  });

  it('stores the path, returns a signed link', async () => {
    const report = await service.create(
      'u1',
      'DRIVER' as never,
      { description: 'bug' } as never,
      [{ originalname: 's.jpg' } as Express.Multer.File],
    );
    expect(prisma.bugReport.create.mock.calls[0][0].data.screenshots).toEqual([
      'bug-reports/s1.jpg',
    ]);
    expect(report.screenshots).toEqual(['https://signed/bug-reports/s1.jpg']);
  });

  it('signs on every read; an old not-yet-migrated URL passes through', async () => {
    prisma.bugReport.findMany.mockResolvedValue([
      { id: 'b1', screenshots: ['bug-reports/a.jpg', 'https://old/url.jpg'] },
    ]);
    const [r] = await service.findAll();
    expect(r.screenshots).toEqual([
      'https://signed/bug-reports/a.jpg',
      'https://old/url.jpg',
    ]);
  });
});
