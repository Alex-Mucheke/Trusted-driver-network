import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { App, makeApp, makeBooking, makeCustomer, makeDriver, connect } from './helpers';

const PASSWORD = 'test-password-123';
const DAY = 24 * 60 * 60 * 1000;

describe('privacy rights and retention (real PostgreSQL)', () => {
  let app: App;
  beforeAll(async () => {
    app = makeApp();
    await app.prisma.$connect();
  });
  afterAll(async () => {
    await app.prisma.$disconnect();
  });

  async function completedTrip() {
    const driver = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma, PASSWORD);
    await connect(app.prisma, customer.id, driver.id);
    const booking = await makeBooking(app.prisma, customer.id, driver.id);
    await app.prisma.booking.update({
      where: { id: booking.id },
      data: { state: 'COMPLETED', assignedDriverId: driver.id, completedAt: new Date() },
    });
    await app.prisma.payment.create({
      data: {
        bookingId: booking.id,
        method: 'MPESA',
        state: 'PAID',
        serviceCharge: 300,
        total: 300,
        receiptNumber: `R-${booking.id.slice(0, 8)}`,
        rawCallback: { msisdn: '254700000000', amount: 300 },
      },
    });
    await app.prisma.notification.create({
      data: { userId: customer.id, type: 'T', title: 't', body: 'b' },
    });
    await app.prisma.message.create({
      data: { bookingId: booking.id, senderId: customer.id, content: 'my private message' },
    });
    return { driver, customer, booking };
  }

  it('erasing an account anonymises it but keeps payment and booking records', async () => {
    const { customer, booking } = await completedTrip();
    await expect(app.privacy.erase(customer.id, 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await app.privacy.erase(customer.id, PASSWORD);

    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user.name).toBe('Deleted user');
    expect(user.email).toBe(`deleted-${customer.id}@deleted.invalid`);
    expect(user.deletedAt).not.toBeNull();
    expect(user.status).toBe('SUSPENDED');

    const kept = await app.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { rideDetails: true, payment: true },
    });
    expect(kept.notes).toBeNull();
    expect(kept.rideDetails?.pickupAddress).toBe('[removed]');
    expect(kept.payment?.total).toBe(300); // the financial record survives
    expect(kept.payment?.rawCallback).toBeNull(); // but not the phone number inside it

    expect(await app.prisma.notification.count({ where: { userId: customer.id } })).toBe(0);
    const msg = await app.prisma.message.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(msg.content).toBe('[message deleted]');
    const log = await app.prisma.dataRequest.findFirstOrThrow({
      where: { userId: customer.id, type: 'ERASURE' },
    });
    expect(log.status).toBe('COMPLETED');
  });

  it('refuses to erase while a booking is still open', async () => {
    const driver = await makeDriver(app.prisma);
    const customer = await makeCustomer(app.prisma, PASSWORD);
    await connect(app.prisma, customer.id, driver.id);
    await makeBooking(app.prisma, customer.id, driver.id); // REQUESTED
    await expect(app.privacy.erase(customer.id, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user.deletedAt).toBeNull();
  });

  it('erasing a driver removes the profile, vehicles and documents', async () => {
    const driver = await makeDriver(app.prisma);
    await app.prisma.user.update({
      where: { id: driver.id },
      data: { passwordHash: await (await import('bcryptjs')).hash(PASSWORD, 4) },
    });
    await app.prisma.verificationDocument.create({
      data: { driverId: driver.id, kind: 'NATIONAL_ID', storageKey: 'private/id-123.jpg' },
    });
    await app.privacy.erase(driver.id, PASSWORD);
    expect(await app.prisma.driverProfile.count({ where: { userId: driver.id } })).toBe(0);
    expect(await app.prisma.vehicle.count({ where: { driverId: driver.id } })).toBe(0);
    expect(await app.prisma.verificationDocument.count({ where: { driverId: driver.id } })).toBe(0);
  });

  it("export contains the user's data and no password hash", async () => {
    const { customer } = await completedTrip();
    const out: any = await app.privacy.export(customer.id);
    expect(out.account.email).toBe(customer.email);
    expect(out.bookings).toHaveLength(1);
    expect(out.messagesSent[0].content).toBe('my private message');
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|not-used/);
  });

  it('retention deletes old data and leaves recent data alone', async () => {
    const { customer, booking } = await completedTrip();
    const old = new Date(Date.now() - 400 * DAY);
    await app.prisma.notification.create({
      data: { userId: customer.id, type: 'OLD', title: 'old', body: 'old', createdAt: old },
    });
    await app.prisma
      .$executeRaw`UPDATE "Booking" SET "updatedAt" = ${old} WHERE id = ${booking.id}`;
    await app.prisma
      .$executeRaw`UPDATE "Payment" SET "updatedAt" = ${old} WHERE "bookingId" = ${booking.id}`;

    await app.retention.run();

    expect(
      await app.prisma.notification.count({ where: { userId: customer.id, type: 'OLD' } }),
    ).toBe(0);
    expect(await app.prisma.notification.count({ where: { userId: customer.id, type: 'T' } })).toBe(
      1,
    );
    const trip = await app.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { rideDetails: true, payment: true },
    });
    expect(trip.notes).toBeNull();
    expect(trip.rideDetails?.pickupAddress).toBe('[removed]');
    expect(trip.payment?.rawCallback).toBeNull();
    expect(trip.payment?.total).toBe(300);
  });
});
