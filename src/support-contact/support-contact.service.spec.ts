import { NotFoundException } from '@nestjs/common';
import { SupportContactService } from './support-contact.service';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

describe('SupportContactService', () => {
  let prisma: {
    user: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let dms: {
    createMessage: jest.Mock;
    getConversations: jest.Mock;
    getMessages: jest.Mock;
    markAsRead: jest.Mock;
  };
  let emit: jest.Mock;
  let to: jest.Mock;
  let push: { sendLocalizedToUsers: jest.Mock };
  let svc: SupportContactService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ uiLocale: 'PL' }),
        create: jest.fn().mockResolvedValue({ id: 'sys' }),
      },
    };
    dms = {
      createMessage: jest.fn().mockResolvedValue({ id: 'msg1' }),
      getConversations: jest.fn().mockResolvedValue([]),
      getMessages: jest.fn().mockResolvedValue([]),
      markAsRead: jest.fn().mockResolvedValue({ count: 1 }),
    };
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    push = { sendLocalizedToUsers: jest.fn().mockResolvedValue(undefined) };
    svc = new SupportContactService(
      prisma as never,
      dms as never,
      { server: { to } } as never,
      push as never,
    );
  });

  it('reuses the existing system contact', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'sys' });
    await expect(svc.id()).resolves.toBe('sys');
    await svc.id();
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1); // cached
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates it once, in the platform admin's company, with no way to sign in", async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(null) // no contact yet
      .mockResolvedValueOnce({ companyId: 'platform' }); // first admin
    await expect(svc.id()).resolves.toBe('sys');
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        role: 'ADMIN',
        isSystem: true,
        companyId: 'platform',
      }),
    );
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('password');
  });

  it('stays silent when there is no admin yet', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await svc.notify('d1', () => 'hi');
    expect(dms.createMessage).not.toHaveBeenCalled();
  });

  it("notify: a chat message in the user's language, to both rooms, plus a push", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'sys' });
    await svc.notify('d1', (locale) => `hello ${locale}`);

    expect(dms.createMessage).toHaveBeenCalledWith('sys', 'd1', 'hello PL');
    expect(to).toHaveBeenCalledWith('user:d1');
    expect(to).toHaveBeenCalledWith('user:sys');
    expect(emit).toHaveBeenCalledWith('new_direct_message', { id: 'msg1' });
    const [ids, , extra] = push.sendLocalizedToUsers.mock.calls[0];
    expect(ids).toEqual(['d1']);
    expect(extra.data).toEqual(
      expect.objectContaining({ type: 'DM_MESSAGE', userId: 'sys' }),
    );
  });

  it('notify never throws', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'sys' });
    dms.createMessage.mockRejectedValue(new Error('db'));
    await expect(svc.notify('d1', () => 'x')).resolves.toBeUndefined();
  });

  it("admin inbox reads the contact's own conversations", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'sys' });
    await svc.conversations();
    expect(dms.getConversations).toHaveBeenCalledWith('sys');
    await svc.messages('d1', {});
    expect(dms.getMessages).toHaveBeenCalledWith('sys', 'd1', {});
    await svc.markRead('d1');
    expect(dms.markAsRead).toHaveBeenCalledWith('sys', 'd1');
  });

  it('admin reply goes out as the contact', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 'd1' }) // recipient exists
      .mockResolvedValueOnce({ id: 'sys' }); // contact
    await svc.reply('d1', 'we are on it');
    expect(dms.createMessage).toHaveBeenCalledWith('sys', 'd1', 'we are on it');
  });

  it('refuses a reply to an unknown / deleted user', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(null); // no such recipient
    await expect(svc.reply('ghost', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
