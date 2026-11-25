import { ConflictException, ForbiddenException } from '@nestjs/common';
import { App, connect, makeApp, makeBooking, makeCustomer, makeDriver, trust } from './helpers';

describe('assignment and referrals (real PostgreSQL)', () => {
  let app: App;
  beforeAll(async () => {
    app = makeApp();
    await app.prisma.$connect();
  });
  afterAll(async () => {
    await app.prisma.$disconnect();
  });

  it('a driver cannot be double-booked by simultaneous accepts (row lock + guarded update)', async () => {
    // Repeated so that a missing lock would show up as at least one double booking.
    for (let round = 0; round < 8; round++) {
      const driver = await makeDriver(app.prisma);
      const c1 = await makeCustomer(app.prisma);
      const c2 = await makeCustomer(app.prisma);
      await connect(app.prisma, c1.id, driver.id);
      await connect(app.prisma, c2.id, driver.id);
      const b1 = await makeBooking(app.prisma, c1.id, driver.id);
      const b2 = await makeBooking(app.prisma, c2.id, driver.id);

      const results = await Promise.allSettled([
        app.bookings.accept(driver.id, b1.id),
        app.bookings.accept(driver.id, b2.id),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      const active = await app.prisma.booking.count({
        where: { assignedDriverId: driver.id, state: 'ACCEPTED' },
      });
      expect(active).toBe(1);
    }
  });

  it('referral approval and the original driver accepting cannot both win', async () => {
    const original = await makeDriver(app.prisma);
    const replacement = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma);
    await connect(app.prisma, customer.id, original.id);
    await trust(app.prisma, original.id, replacement.id);
    const booking = await makeBooking(app.prisma, customer.id, original.id);

    const ref = await app.referrals.propose(original.id, booking.id, replacement.id);
    await app.referrals.candidateRespond(replacement.id, ref.id, { accept: true });

    const [accepted, approved] = await Promise.allSettled([
      app.bookings.accept(original.id, booking.id),
      app.referrals.customerDecision(customer.id, ref.id, true),
    ]);
    expect(accepted.status).toBe('rejected');
    expect(approved.status).toBe('fulfilled');

    const final = await app.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(final.state).toBe('ACCEPTED');
    expect(final.assignedDriverId).toBe(replacement.id);
  });

  it('golden path: propose, candidate accepts, customer approves, replacement is assigned', async () => {
    const original = await makeDriver(app.prisma);
    const replacement = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma);
    await connect(app.prisma, customer.id, original.id);
    await trust(app.prisma, original.id, replacement.id);
    const booking = await makeBooking(app.prisma, customer.id, original.id);

    const ref = await app.referrals.propose(original.id, booking.id, replacement.id);
    // Not assigned until the customer approves.
    await app.referrals.candidateRespond(replacement.id, ref.id, { accept: true, etaMinutes: 6 });
    expect(
      (await app.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).assignedDriverId,
    ).toBeNull();

    await app.referrals.customerDecision(customer.id, ref.id, true);

    const after = await app.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { events: true },
    });
    expect(after.assignedDriverId).toBe(replacement.id);
    expect(after.events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'REFERRAL_PROPOSED',
        'REFERRAL_CANDIDATE_ACCEPTED',
        'ASSIGNED_VIA_REFERRAL',
        'REFERRAL_CUSTOMER_APPROVED',
      ]),
    );
    const finalRef = await app.prisma.referral.findUniqueOrThrow({ where: { id: ref.id } });
    expect(finalRef.state).toBe('CUSTOMER_APPROVED');
  });

  it('refuses to refer to a driver outside the trusted network', async () => {
    const original = await makeDriver(app.prisma);
    const stranger = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma);
    await connect(app.prisma, customer.id, original.id);
    const booking = await makeBooking(app.prisma, customer.id, original.id);

    await expect(
      app.referrals.propose(original.id, booking.id, stranger.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await app.prisma.referral.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('the same candidate cannot be offered the same booking twice', async () => {
    const original = await makeDriver(app.prisma);
    const replacement = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma);
    await connect(app.prisma, customer.id, original.id);
    await trust(app.prisma, original.id, replacement.id);
    const booking = await makeBooking(app.prisma, customer.id, original.id);

    const first = await app.referrals.propose(original.id, booking.id, replacement.id);
    await app.referrals.cancel(original.id, first.id);
    await expect(
      app.referrals.propose(original.id, booking.id, replacement.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
