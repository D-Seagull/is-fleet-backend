import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

// expo-server-sdk is ESM-only, pulled in transitively via the gateway import
// chain; every dependency here is a plain mock.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

// P1-5: a driver's truck-wide document view follows their CURRENT truck —
// all of its files, the previous driver's trips included — and nothing of
// another truck except their own past trips.
describe('DocumentsService — driver scope', () => {
  const driver = { id: 'drvA', role: 'DRIVER', companyId: 'c1' };
  let prisma: {
    trip: Record<string, jest.Mock>;
    truck: Record<string, jest.Mock>;
    tripDocument: Record<string, jest.Mock>;
    tripChatSession: Record<string, jest.Mock>;
  };
  let storage: Record<string, jest.Mock>;
  let service: DocumentsService;

  // Trip of the previous driver (drvOld) on truck tr1.
  const oldTrip = {
    id: 'tOld',
    companyId: 'c1',
    driverId: 'drvOld',
    managerId: 'm1',
    truckId: 'tr1',
  };

  beforeEach(() => {
    prisma = {
      trip: { findFirst: jest.fn() },
      truck: { findFirst: jest.fn() },
      tripDocument: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // drvA never had a chat session on tOld.
      tripChatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    storage = {
      getSignedUrl: jest.fn().mockResolvedValue('https://signed'),
      getSignedUrlOrNull: jest.fn().mockResolvedValue('https://signed'),
      getThumbUrl: jest.fn().mockResolvedValue(null),
    };
    service = new DocumentsService(
      prisma as never,
      storage as never,
      {} as never,
      {} as never,
    );
  });

  /** truck.findFirst answers both assertCompanyTruck and the current-truck check. */
  function truckLookup(currentDriverId: string | null) {
    prisma.truck.findFirst.mockImplementation(
      ({ where }: { where: { id: string; currentDriverId?: string } }) => {
        if ('currentDriverId' in where) {
          return Promise.resolve(
            where.currentDriverId === currentDriverId ? { id: where.id } : null,
          );
        }
        return Promise.resolve({ id: where.id, companyId: 'c1' });
      },
    );
  }

  it('the current driver lists every document of their truck (previous driver’s included)', async () => {
    truckLookup('drvA');
    await service.findByTruck('tr1', driver);
    // No driverId narrowing — the whole truck.
    expect(prisma.tripDocument.findMany.mock.calls[0][0].where).toEqual({
      trip: { truckId: 'tr1', deletedAt: null, companyId: 'c1' },
    });
  });

  it("a driver can't list another truck's documents", async () => {
    truckLookup('drvB');
    await expect(service.findByTruck('tr2', driver)).rejects.toThrow(
      'errors.truckNotFound',
    );
    expect(prisma.tripDocument.findMany).not.toHaveBeenCalled();
  });

  it('the current driver opens a file from the previous driver’s trip on their truck', async () => {
    prisma.tripDocument.findUnique.mockResolvedValue({
      id: 'd1',
      tripId: 'tOld',
      fileUrl: 'f',
    });
    prisma.trip.findFirst.mockResolvedValue(oldTrip);
    truckLookup('drvA');
    await expect(service.view('d1', driver)).resolves.toEqual({
      url: 'https://signed',
    });
  });

  it("a file of another truck's trip (not their own) is 404", async () => {
    prisma.tripDocument.findUnique.mockResolvedValue({
      id: 'd1',
      tripId: 'tOld',
      fileUrl: 'f',
    });
    prisma.trip.findFirst.mockResolvedValue({ ...oldTrip, truckId: 'tr2' });
    truckLookup('drvB'); // tr2 is driven by someone else
    await expect(service.view('d1', driver)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('their own past trip stays readable after they left the truck', async () => {
    prisma.tripDocument.findUnique.mockResolvedValue({
      id: 'd1',
      tripId: 'tOld',
      fileUrl: 'f',
    });
    prisma.trip.findFirst.mockResolvedValue({ ...oldTrip, driverId: 'drvA' });
    await expect(service.view('d1', driver)).resolves.toEqual({
      url: 'https://signed',
    });
  });

  it('managers are unaffected: any truck of the company', async () => {
    prisma.truck.findFirst.mockResolvedValue({ id: 'tr2', companyId: 'c1' });
    await service.findByTruck('tr2', {
      id: 'm1',
      role: 'MANAGER',
      companyId: 'c1',
    });
    expect(prisma.tripDocument.findMany).toHaveBeenCalled();
  });

  it('a replaced driver can no longer upload into the trip (N1)', async () => {
    // drvOld drove the trip (a past chat session), drvNew drives it now.
    // Plain trip access would pass on the past session — a live upload
    // needs the CURRENT driver.
    prisma.trip.findFirst.mockResolvedValue({ ...oldTrip, driverId: 'drvNew' });
    prisma.tripChatSession.findFirst.mockResolvedValue({ id: 's0' });
    const oldDriver = { id: 'drvOld', role: 'DRIVER', companyId: 'c1' };
    await expect(
      service.uploadMany('tOld', oldDriver, [
        { mimetype: 'image/png' } as Express.Multer.File,
      ]),
    ).rejects.toThrow('errors.tripNotFound');
  });
});
