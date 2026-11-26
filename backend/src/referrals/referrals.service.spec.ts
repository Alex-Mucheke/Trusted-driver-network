const mockKnownError = class extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
};
jest.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: mockKnownError },
  PrismaClient: class {},
}));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: class {} }));
jest.mock('../bookings/bookings.service', () => ({ BookingsService: class {} }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { makePrisma, MockPrisma } from '../testing/prisma-mock';
import { ADDRESS_WITHHELD, ReferralsService, withholdExactLocation } from './referrals.service';

const BOOKING = 'b1';
const PROPOSER = 'driver-a';
const CANDIDATE = 'driver-b';
const CUSTOMER = 'cust-1';

describe('ReferralsService', () => {
  let prisma: MockPrisma;
  let bookings: { assignInTx: jest.Mock; afterAssigned: jest.Mock };
  let eligibility: { assertEligible: jest.Mock; isEligible: jest.Mock };
  let notifications: { notify: jest.Mock; bookingChanged: jest.Mock };
  let service: ReferralsService;

  const booking = (over: Record<string, unknown> = {}) => ({
    id: BOOKING,
    state: 'REQUESTED',
    type: 'RIDE',
    scheduledAt: null,
    quote: 400,
    customerId: CUSTOMER,
    requestedDriverId: PROPOSER,
    assignedDriverId: null,
    ...over,
  });

  beforeEach(() => {
    prisma = makePrisma();
    bookings = {
      assignInTx: jest.fn().mockResolvedValue(undefined),
      afterAssigned: jest.fn().mockResolvedValue(undefined),
    };
    eligibility = {
      assertEligible: jest.fn().mockResolvedValue(undefined),
      isEligible: jest.fn().mockResolvedValue(true),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined), bookingChanged: jest.fn() };
    service = new ReferralsService(
      prisma as any,
      bookings as any,
      eligibility as any,
      notifications as any,
    );
    prisma.referral.findMany.mockResolvedValue([]); // nothing due for expiry
    prisma.booking.findUnique.mockResolvedValue(booking());
    prisma.referral.count.mockResolvedValue(0);
    prisma.referral.findFirst.mockResolvedValue(null);
    prisma.driverConnection.findUnique.mockResolvedValue({ trustStatus: 'TRUSTED' });
    prisma.customerDriverConnection.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.referral.create.mockImplementation(async (a: any) => ({ id: 'ref1', ...a.data }));
    prisma.bookingEvent.create.mockResolvedValue({});
  });

  describe('propose', () => {
    it('creates a referral that expires, logs an event and notifies the candidate', async () => {
      const before = Date.now();
      const ref: any = await service.propose(PROPOSER, BOOKING, CANDIDATE);
      expect(ref.candidateId).toBe(CANDIDATE);
      expect(ref.expiresAt.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
      expect(prisma.bookingEvent.create.mock.calls[0][0].data.type).toBe('REFERRAL_PROPOSED');
      expect(notifications.notify.mock.calls[0][0]).toBe(CANDIDATE);
    });

    it('only the requested driver can refer the job', async () => {
      await expect(service.propose('intruder', BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('only a pending, unassigned request can be referred', async () => {
      prisma.booking.findUnique.mockResolvedValue(booking({ state: 'ACCEPTED' }));
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      prisma.booking.findUnique.mockResolvedValue(booking({ assignedDriverId: 'x' }));
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('cannot refer to yourself or to the customer', async () => {
      await expect(service.propose(PROPOSER, BOOKING, PROPOSER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.propose(PROPOSER, BOOKING, CUSTOMER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('stops after the maximum number of attempts', async () => {
      prisma.referral.count.mockResolvedValue(3);
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows only one open referral at a time', async () => {
      prisma.referral.findFirst.mockResolvedValue({ id: 'open' });
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it.each([
      ['no link at all', null],
      ['a pending link', { trustStatus: 'PENDING' }],
      ['a revoked link', { trustStatus: 'REVOKED' }],
    ])('refuses a candidate with %s in the trusted network', async (_l, link) => {
      prisma.driverConnection.findUnique.mockResolvedValue(link);
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.referral.create).not.toHaveBeenCalled();
    });

    it('never offers a driver the customer has blocked', async () => {
      prisma.customerDriverConnection.findUnique.mockResolvedValue({ status: 'BLOCKED' });
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('checks the candidate is eligible (verified, online, free)', async () => {
      eligibility.assertEligible.mockRejectedValue(
        new ForbiddenException('Driver is not verified'),
      );
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('a duplicate offer for the same candidate becomes a conflict (loop protection)', async () => {
      prisma.referral.create.mockRejectedValue(new mockKnownError('dup', 'P2002'));
      await expect(service.propose(PROPOSER, BOOKING, CANDIDATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('incoming offers (data minimisation)', () => {
    const exact = {
      pickupAddress: '12 Market Road, Chuka',
      dropoffAddress: '4 Hospital Lane, Chuka',
      pickupLat: -0.333456,
      pickupLng: 37.651234,
      dropoffLat: -0.311111,
      dropoffLng: 37.622222,
      distanceKm: 3.2,
    };

    it('withholds exact addresses and coordinates but keeps the distance', () => {
      const out = withholdExactLocation(exact);
      expect(out.pickupAddress).toBe(ADDRESS_WITHHELD);
      expect(out.dropoffAddress).toBe(ADDRESS_WITHHELD);
      expect(out.pickupLat).toBe(-0.33);
      expect(out.pickupLng).toBe(37.65);
      expect(out.dropoffLat).toBe(-0.31);
      expect(out.distanceKm).toBe(3.2);
      expect(JSON.stringify(out)).not.toMatch(/Market Road|Hospital Lane|0\.333456|37\.651234/);
    });

    it('a candidate with a pending offer never receives the exact trip location', async () => {
      prisma.referral.findMany.mockResolvedValue([
        {
          id: 'ref1',
          proposer: { id: PROPOSER, name: 'Alice' },
          booking: { id: BOOKING, quote: 400, rideDetails: exact },
        },
      ]);
      const out: any[] = await service.incoming(CANDIDATE);
      expect(out[0].booking.rideDetails.pickupAddress).toBe(ADDRESS_WITHHELD);
      expect(JSON.stringify(out)).not.toMatch(/Market Road|Hospital Lane/);
    });

    it('copes with a booking that has no ride details', async () => {
      prisma.referral.findMany.mockResolvedValue([
        {
          id: 'ref1',
          proposer: { id: PROPOSER, name: 'Alice' },
          booking: { id: BOOKING, rideDetails: null },
        },
      ]);
      const out: any[] = await service.incoming(CANDIDATE);
      expect(out[0].booking.rideDetails).toBeNull();
    });
  });

  describe('candidateRespond', () => {
    const referral = () => ({
      id: 'ref1',
      candidateId: CANDIDATE,
      proposerId: PROPOSER,
      booking: booking(),
    });
    beforeEach(() => {
      prisma.referral.findUnique.mockResolvedValue(referral());
      prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    });

    it('only the referred driver can respond', async () => {
      await expect(
        service.candidateRespond('someone-else', 'ref1', { accept: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('accepting moves the referral on and asks the customer to approve (no assignment yet)', async () => {
      await service.candidateRespond(CANDIDATE, 'ref1', { accept: true, etaMinutes: 7 });
      expect(prisma.referral.updateMany.mock.calls[0][0].data.state).toBe('CANDIDATE_ACCEPTED');
      expect(bookings.assignInTx).not.toHaveBeenCalled();
      expect(notifications.notify.mock.calls[0][0]).toBe(CUSTOMER);
      expect(notifications.notify.mock.calls[0][1]).toBe('REFERRAL_APPROVAL_NEEDED');
    });

    it('declining ends the referral and tells the proposer', async () => {
      await service.candidateRespond(CANDIDATE, 'ref1', { accept: false });
      expect(prisma.referral.updateMany.mock.calls[0][0].data.state).toBe('CANDIDATE_DECLINED');
      expect(notifications.notify.mock.calls[0][0]).toBe(PROPOSER);
    });

    it('bounds a re-quote to 0.5x - 1.5x of the estimate', async () => {
      await expect(
        service.candidateRespond(CANDIDATE, 'ref1', { accept: true, revisedQuote: 601 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.candidateRespond(CANDIDATE, 'ref1', { accept: true, revisedQuote: 199 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await service.candidateRespond(CANDIDATE, 'ref1', { accept: true, revisedQuote: 600 });
      expect(prisma.referral.updateMany.mock.calls[0][0].data.revisedQuote).toBe(600);
    });

    it('loses cleanly if the referral expired or was cancelled meanwhile', async () => {
      prisma.referral.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.candidateRespond(CANDIDATE, 'ref1', { accept: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('cannot accept a booking that has been taken in the meantime', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        ...referral(),
        booking: booking({ state: 'ACCEPTED', assignedDriverId: 'x' }),
      });
      await expect(
        service.candidateRespond(CANDIDATE, 'ref1', { accept: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('customerDecision', () => {
    const referral = () => ({
      id: 'ref1',
      candidateId: CANDIDATE,
      proposerId: PROPOSER,
      revisedQuote: 450,
      booking: booking(),
    });
    beforeEach(() => {
      prisma.referral.findUnique.mockResolvedValue(referral());
      prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    });

    it("only the booking's customer can decide", async () => {
      await expect(service.customerDecision('stranger', 'ref1', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('approval assigns the candidate in the same transaction as the approval', async () => {
      await service.customerDecision(CUSTOMER, 'ref1', true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.referral.updateMany.mock.calls[0][0].data.state).toBe('CUSTOMER_APPROVED');
      expect(bookings.assignInTx).toHaveBeenCalledWith(
        prisma,
        BOOKING,
        CANDIDATE,
        CUSTOMER,
        'REFERRAL',
        { revisedQuote: 450 },
      );
      expect(bookings.afterAssigned).toHaveBeenCalledWith(BOOKING, CUSTOMER, CANDIDATE);
    });

    it('if the booking was taken first, approval fails and nobody is told they got the job', async () => {
      bookings.assignInTx.mockRejectedValue(
        new ConflictException('This booking is no longer available'),
      );
      await expect(service.customerDecision(CUSTOMER, 'ref1', true)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(bookings.afterAssigned).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('cannot approve a referral that is no longer awaiting approval', async () => {
      prisma.referral.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.customerDecision(CUSTOMER, 'ref1', true)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(bookings.assignInTx).not.toHaveBeenCalled();
    });

    it('rejection leaves the booking untouched and tells both drivers', async () => {
      await service.customerDecision(CUSTOMER, 'ref1', false);
      expect(prisma.referral.updateMany.mock.calls[0][0].data.state).toBe('CUSTOMER_REJECTED');
      expect(bookings.assignInTx).not.toHaveBeenCalled();
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(
        [CANDIDATE, PROPOSER].sort(),
      );
    });
  });
});
