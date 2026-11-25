jest.mock('@prisma/client', () => ({ Prisma: { DbNull: 'DB_NULL' }, PrismaClient: class {} }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn(async () => '$2a$10$unusable-hash-for-erased-account'),
  compare: jest.fn(async (pw: string) => pw === 'correct-password'),
}));

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { makePrisma, MockPrisma } from '../testing/prisma-mock';
import { DAY_MS, DSR_RESPONSE_DAYS, PRIVACY_NOTICE_VERSION, SCRUBBED_RIDE } from './policy';
import { PrivacyService } from './privacy.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('PrivacyService', () => {
  let prisma: MockPrisma;
  let service: PrivacyService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PrivacyService(prisma as any);
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      roles: ['CUSTOMER'],
      passwordHash: 'stored-hash',
      deletedAt: null,
    });
    prisma.booking.count.mockResolvedValue(0);
  });

  describe('erase', () => {
    it('rejects a wrong password without changing anything', async () => {
      await expect(service.erase(USER_ID, 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses while bookings are still open', async () => {
      prisma.booking.count.mockResolvedValue(2);
      await expect(service.erase(USER_ID, 'correct-password')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const where = prisma.booking.count.mock.calls[0][0].where;
      expect(where.state.in).toEqual([
        'REQUESTED',
        'ACCEPTED',
        'EN_ROUTE',
        'ARRIVED',
        'IN_PROGRESS',
      ]);
    });

    it('never erases an administrator through the self-service path', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        roles: ['ADMIN'],
        passwordHash: 'x',
        deletedAt: null,
      });
      await expect(service.erase(USER_ID, 'correct-password')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('treats an already-erased account as not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, roles: [], deletedAt: new Date() });
      await expect(service.erase(USER_ID, 'correct-password')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('anonymises the account and scrubs personal data in one transaction', async () => {
      await expect(service.erase(USER_ID, 'correct-password')).resolves.toEqual({ ok: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const update = prisma.user.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: USER_ID });
      expect(update.data).toMatchObject({
        name: 'Deleted user',
        email: `deleted-${USER_ID}@deleted.invalid`,
        phone: `deleted-${USER_ID}`,
        status: 'SUSPENDED',
        notificationPrefs: 'DB_NULL',
      });
      expect(update.data.deletedAt).toBeInstanceOf(Date);
      expect(update.data.passwordHash).not.toBe('stored-hash');

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.driverProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.driverLocation.deleteMany).toHaveBeenCalledWith({
        where: { driverId: USER_ID },
      });
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { senderId: USER_ID },
        data: { content: '[message deleted]' },
      });
      expect(prisma.rideDetails.updateMany).toHaveBeenCalledWith({
        where: { booking: { customerId: USER_ID } },
        data: SCRUBBED_RIDE,
      });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { booking: { customerId: USER_ID } },
        data: { rawCallback: 'DB_NULL' },
      });
    });

    it('keeps an auditable record of the erasure', async () => {
      await service.erase(USER_ID, 'correct-password');
      const created = prisma.dataRequest.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ userId: USER_ID, type: 'ERASURE', status: 'COMPLETED' });
      expect(created.resolution).toMatch(/Self-service erasure/);
      expect(created.resolution).toMatch(/retained/);
    });

    it("lets an administrator erase on a user's behalf without the password", async () => {
      await service.anonymise(USER_ID, 'ADMIN');
      const created = prisma.dataRequest.create.mock.calls[0][0].data;
      expect(created.resolution).toMatch(/administrator/);
    });
  });

  describe('other rights', () => {
    it('logs a request with a due date 30 days out', async () => {
      prisma.dataRequest.count.mockResolvedValue(0);
      prisma.dataRequest.create.mockImplementation(async (args: any) => args.data);
      const before = Date.now();
      const r: any = await service.createRequest(USER_ID, 'OBJECTION', '  stop using my data  ');
      expect(r.note).toBe('stop using my data');
      const due = r.dueAt.getTime() - before;
      expect(due).toBeGreaterThanOrEqual(DSR_RESPONSE_DAYS * DAY_MS - 1000);
      expect(due).toBeLessThan(DSR_RESPONSE_DAYS * DAY_MS + 5000);
    });

    it('stops one user from flooding the queue', async () => {
      prisma.dataRequest.count.mockResolvedValue(5);
      await expect(service.createRequest(USER_ID, 'CORRECTION')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.dataRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('consent', () => {
    it('is accepted only for the current notice version', async () => {
      prisma.consentRecord.findMany.mockResolvedValue([
        { type: 'PRIVACY_NOTICE', version: PRIVACY_NOTICE_VERSION, withdrawnAt: null },
      ]);
      expect((await service.consentStatus(USER_ID)).privacyNoticeAccepted).toBe(true);

      prisma.consentRecord.findMany.mockResolvedValue([
        { type: 'PRIVACY_NOTICE', version: 'older-version', withdrawnAt: null },
      ]);
      expect((await service.consentStatus(USER_ID)).privacyNoticeAccepted).toBe(false);

      prisma.consentRecord.findMany.mockResolvedValue([
        { type: 'PRIVACY_NOTICE', version: PRIVACY_NOTICE_VERSION, withdrawnAt: new Date() },
      ]);
      expect((await service.consentStatus(USER_ID)).privacyNoticeAccepted).toBe(false);
    });

    it('records acknowledgement of the current version', async () => {
      prisma.consentRecord.findMany.mockResolvedValue([]);
      await service.acceptPrivacyNotice(USER_ID);
      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, type: 'PRIVACY_NOTICE', version: PRIVACY_NOTICE_VERSION },
      });
    });
  });

  describe('export', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: 'Test User',
        email: 'test@example.org',
        phone: '+254700000001',
        roles: ['CUSTOMER'],
        status: 'ACTIVE',
        notificationPrefs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      for (const m of [
        prisma.booking.findMany,
        prisma.message.findMany,
        prisma.notification.findMany,
        prisma.review.findMany,
        prisma.report.findMany,
        prisma.consentRecord.findMany,
        prisma.dataRequest.findMany,
        prisma.customerDriverConnection.findMany,
        prisma.driverConnection.findMany,
      ]) {
        m.mockResolvedValue([]);
      }
      prisma.report.count.mockResolvedValue(3);
      prisma.driverProfile.findUnique.mockResolvedValue(null);
    });

    it("never selects the password hash, storage keys or other people's contact details", async () => {
      const out: any = await service.export(USER_ID);
      expect(JSON.stringify(out)).not.toMatch(/passwordHash/);

      const userSelect = prisma.user.findUnique.mock.calls[0][0].select;
      expect(userSelect.passwordHash).toBeUndefined();

      const bookingSelect = prisma.booking.findMany.mock.calls[0][0].select;
      expect(bookingSelect.customer).toEqual({ select: { name: true } });
      expect(bookingSelect.assignedDriver).toEqual({ select: { name: true } });
      expect(bookingSelect.payment.select.rawCallback).toBeUndefined();

      const docSelect = prisma.driverProfile.findUnique.mock.calls[0][0].select.documents.select;
      expect(docSelect.storageKey).toBeUndefined();
    });

    it('reports complaints against the user as a count only', async () => {
      const out: any = await service.export(USER_ID);
      expect(out.reportsAgainstYouCount).toBe(3);
      expect(out.reportsAgainst).toBeUndefined();
    });

    it('records the export as a completed access request', async () => {
      await service.export(USER_ID);
      expect(prisma.dataRequest.create.mock.calls[0][0].data).toMatchObject({
        userId: USER_ID,
        type: 'ACCESS',
        status: 'COMPLETED',
      });
    });

    it('is not available for an erased account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, deletedAt: new Date() });
      await expect(service.export(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
