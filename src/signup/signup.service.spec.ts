import { Test } from '@nestjs/testing';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SignupService } from './signup.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

describe('SignupService', () => {
  let service: SignupService;
  let prisma: {
    user: Record<string, jest.Mock>;
    company: Record<string, jest.Mock>;
  };
  let mail: Record<string, jest.Mock>;

  const trial = {
    companyName: 'Acme Haulage',
    name: 'Anna',
    email: 'anna@acme.eu',
  };
  const demo = {
    name: 'Anna',
    company: 'Acme Haulage',
    email: 'anna@acme.eu',
    message: 'Hi',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.isfleet.eu';

    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      company: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'c1', ...data })),
        delete: jest.fn(),
      },
    };
    mail = {
      sendTrialInvite: jest.fn().mockResolvedValue(undefined),
      sendTrialExistingAccount: jest.fn().mockResolvedValue(undefined),
      sendSalesNotification: jest.fn().mockResolvedValue(undefined),
      sendDemoConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SignupService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(SignupService);
  });

  describe('startTrial', () => {
    it('creates the company with an invite token and mails the register link', async () => {
      await expect(service.startTrial(trial)).resolves.toEqual({ ok: true });

      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.name).toBe('Acme Haulage');
      expect(data.inviteToken).toEqual(expect.any(String));
      expect(data.inviteExpiry.getTime()).toBeGreaterThan(Date.now());
      expect(mail.sendTrialInvite).toHaveBeenCalledWith(
        'anna@acme.eu',
        'Anna',
        'Acme Haulage',
        `https://app.isfleet.eu/register?token=${data.inviteToken}`,
      );
      expect(mail.sendSalesNotification).toHaveBeenCalled();
    });

    it('ignores bots that fill the honeypot', async () => {
      await expect(
        service.startTrial({ ...trial, website: 'x' }),
      ).resolves.toEqual({ ok: true });
      expect(prisma.company.create).not.toHaveBeenCalled();
      expect(mail.sendTrialInvite).not.toHaveBeenCalled();
    });

    it('creates nothing for an existing account and only mails its owner', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(service.startTrial(trial)).resolves.toEqual({ ok: true });
      expect(prisma.company.create).not.toHaveBeenCalled();
      expect(mail.sendTrialExistingAccount).toHaveBeenCalledWith(
        'anna@acme.eu',
        'https://app.isfleet.eu/login',
      );
    });

    it('rejects a company name that is already taken', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'c0' });
      await expect(service.startTrial(trial)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('rolls the company back when the invite mail fails', async () => {
      mail.sendTrialInvite.mockRejectedValue(new Error('resend down'));
      await expect(service.startTrial(trial)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.company.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('still succeeds when only the sales notification fails', async () => {
      mail.sendSalesNotification.mockRejectedValue(new Error('resend down'));
      await expect(service.startTrial(trial)).resolves.toEqual({ ok: true });
      expect(prisma.company.delete).not.toHaveBeenCalled();
    });
  });

  describe('requestDemo', () => {
    it('forwards the request to sales with reply-to the visitor and confirms to them', async () => {
      await expect(service.requestDemo(demo)).resolves.toEqual({ ok: true });
      expect(mail.sendSalesNotification).toHaveBeenCalledWith(
        'Demo request — Acme Haulage',
        expect.objectContaining({ Email: 'anna@acme.eu', Message: 'Hi' }),
        'anna@acme.eu',
      );
      expect(mail.sendDemoConfirmation).toHaveBeenCalledWith(
        'anna@acme.eu',
        'Anna',
      );
    });

    it('fails when the request cannot reach sales', async () => {
      mail.sendSalesNotification.mockRejectedValue(new Error('resend down'));
      await expect(service.requestDemo(demo)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('succeeds when only the confirmation fails', async () => {
      mail.sendDemoConfirmation.mockRejectedValue(new Error('resend down'));
      await expect(service.requestDemo(demo)).resolves.toEqual({ ok: true });
    });

    it('ignores bots that fill the honeypot', async () => {
      await expect(
        service.requestDemo({ ...demo, website: 'x' }),
      ).resolves.toEqual({ ok: true });
      expect(mail.sendSalesNotification).not.toHaveBeenCalled();
    });
  });
});
