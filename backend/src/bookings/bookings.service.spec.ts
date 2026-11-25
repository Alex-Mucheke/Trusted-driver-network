jest.mock('@prisma/client', () => ({ Prisma: {}, PrismaClient: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: class {} }));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { makePrisma, MockPrisma } from '../testing/prisma-mock';
import { BookingsService } from './bookings.service';

const BOOKING = 'b1';
const DRIVER = 'driver-a';
const CUSTOMER = 'cust-1';

describe('BookingsService assignment', () => {
  let prisma: MockPrisma;
  let eligibility: { assertEligible: jest.Mock };
  let notifications: { notify: jest.Mock; bookingChanged: jest.Mock };
  let service: BookingsService;

  beforeEach(() => {
    prisma = makePrisma();
    eligibility = { assertEligible: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined), bookingChanged: jest.fn() };
    service = new BookingsService(prisma as any, eligibility as any, notifications as any);
    prisma.booking.findUniqueOrThrow.mockResolvedValue({
      id: BOOKING,
      type: 'RIDE',
      scheduledAt: null,
      customerId: CUSTOMER,
    });
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('assignInTx', () => {
    it('flips the booking with a guarded update so only an unassigned, unexpired request can win', async () => {
      await service.assignInTx(prisma as any, BOOKING, DRIVER, DRIVER, 'DIRECT');
      const call = prisma.booking.updateMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ id: BOOKING, state: 'REQUESTED', assignedDriverId: null });
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(call.data).toMatchObject({ state: 'ACCEPTED', assignedDriverId: DRIVER });
    });

    it('locks the driver row and re-checks eligibility before assigning', async () => {
      await service.assignInTx(prisma as any, BOOKING, DRIVER, DRIVER, 'DIRECT');
      const lock = prisma.$queryRaw.mock.invocationCallOrder[0];
      const check = eligibility.assertEligible.mock.invocationCallOrder[0];
      const update = prisma.booking.updateMany.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(check);
      expect(check).toBeLessThan(update);
    });

    it('loses cleanly when another assignment already won (no event, no double assignment)', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.assignInTx(prisma as any, BOOKING, DRIVER, DRIVER, 'DIRECT'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bookingEvent.create).not.toHaveBeenCalled();
    });

    it('of two competing assignments exactly one succeeds', async () => {
      // The database lets the first guarded update through and rejects the second.
      prisma.booking.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      const results = await Promise.allSettled([
        service.assignInTx(prisma as any, BOOKING, 'driver-a', 'driver-a', 'DIRECT'),
        service.assignInTx(prisma as any, BOOKING, 'driver-b', 'driver-b', 'REFERRAL'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(prisma.bookingEvent.create).toHaveBeenCalledTimes(1);
    });

    it('does not touch the booking when the driver is ineligible', async () => {
      eligibility.assertEligible.mockRejectedValue(
        new ForbiddenException('Driver is not verified'),
      );
      await expect(
        service.assignInTx(prisma as any, BOOKING, DRIVER, DRIVER, 'DIRECT'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it("applies a referral's revised quote and labels the event", async () => {
      await service.assignInTx(prisma as any, BOOKING, 'driver-b', CUSTOMER, 'REFERRAL', {
        revisedQuote: 450,
      });
      expect(prisma.booking.updateMany.mock.calls[0][0].data.quote).toBe(450);
      expect(prisma.bookingEvent.create.mock.calls[0][0].data).toMatchObject({
        type: 'ASSIGNED_VIA_REFERRAL',
        actorId: CUSTOMER,
      });
    });
  });

  describe('accept', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue({
        id: BOOKING,
        requestedDriverId: DRIVER,
        customerId: CUSTOMER,
        assignedDriverId: null,
      });
      prisma.referral.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'get').mockResolvedValue({ id: BOOKING } as any);
    });

    it('only the requested driver may accept', async () => {
      await expect(service.accept('someone-else', BOOKING)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('cannot be used to jump an open referral', async () => {
      prisma.referral.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(service.accept(DRIVER, BOOKING)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('notifies the customer once the driver is assigned', async () => {
      await service.accept(DRIVER, BOOKING);
      expect(notifications.notify).toHaveBeenCalledWith(
        CUSTOMER,
        'BOOKING_ACCEPTED',
        expect.any(String),
        expect.any(String),
        { bookingId: BOOKING },
      );
    });

    it('sends no notification when the assignment fails', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.accept(DRIVER, BOOKING)).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
