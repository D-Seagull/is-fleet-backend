import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: { company: Record<string, jest.Mock> };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      company: {
        findFirst: jest.fn(),
        // update echoes the data back so tests can assert on the normalized shape.
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data })),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(CompaniesService);
  });

  describe('getCompany', () => {
    it('throws NotFound for an unknown company', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.getCompany('c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the company when found', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'c1', name: 'Acme' });
      await expect(service.getCompany('c1')).resolves.toEqual({
        id: 'c1',
        name: 'Acme',
      });
    });
  });

  // ─── updateCompany (email normalization + name trim) ────────────────────────
  describe('updateCompany', () => {
    it('normalizes empty-string emails to null (so String? columns clear cleanly)', async () => {
      const res = await service.updateCompany('c1', {
        accountingEmail: '',
        hrEmail: 'hr@acme.co',
      });
      expect(res.accountingEmail).toBeNull();
      expect(res.hrEmail).toBe('hr@acme.co');
    });

    it('leaves an undefined email untouched (undefined, not null)', async () => {
      const res = await service.updateCompany('c1', {
        accountingEmail: 'acc@acme.co',
        // hrEmail omitted → undefined → skipped
      });
      expect(res.accountingEmail).toBe('acc@acme.co');
      expect(res.hrEmail).toBeUndefined();
    });

    it('trims the company name', async () => {
      const res = await service.updateCompany('c1', { name: '  Acme  ' });
      expect(res.name).toBe('Acme');
    });

    it('does not set name when it is not provided', async () => {
      const res = await service.updateCompany('c1', { hrEmail: 'hr@acme.co' });
      expect(res.name).toBeUndefined();
    });
  });
});
