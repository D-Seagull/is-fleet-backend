import { NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';

describe('AnnouncementsService (broadcast templates only)', () => {
  let prisma: { announcementDraft: Record<string, jest.Mock> };
  let service: AnnouncementsService;

  beforeEach(() => {
    prisma = {
      announcementDraft: {
        create: jest.fn().mockImplementation(({ data }) => data),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AnnouncementsService(prisma as never);
  });

  it('never stores a body-supplied group (could point into another company)', async () => {
    const draft = await service.createDraft('cA', 'u1', {
      title: 't',
      content: 'c',
      isTemplate: true,
      groupId: 'groupOfCompanyB',
    });
    expect(draft).toEqual(
      expect.objectContaining({
        groupId: null,
        companyId: 'cA',
        createdBy: 'u1',
      }),
    );
  });

  it('deletes only the caller’s own template — a foreign id is 404', async () => {
    prisma.announcementDraft.findFirst.mockResolvedValue(null);
    await expect(service.removeDraft('d1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.announcementDraft.findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', createdBy: 'u1' },
    });
    expect(prisma.announcementDraft.delete).not.toHaveBeenCalled();
  });

  it('the publish / read / edit routes are gone (H7, N3)', () => {
    const proto = AnnouncementsController.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const gone of [
      'create',
      'findAll',
      'markAsRead',
      'publishDraft',
      'update',
    ]) {
      expect(proto[gone]).toBeUndefined();
    }
  });
});
