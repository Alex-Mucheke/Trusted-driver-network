jest.mock('@prisma/client', () => ({ Prisma: { DbNull: 'DB_NULL' }, PrismaClient: class {} }));

import { makePrisma, MockPrisma } from '../testing/prisma-mock';
import { DAY_MS, RETENTION_DEFAULTS, retentionDays, SCRUBBED_RIDE } from './policy';
import { RetentionService } from './retention.service';

const NOW = new Date('2026-11-24T00:00:00.000Z');
const TERMINAL = ['COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED'];

describe('RetentionService', () => {
  let prisma: MockPrisma;
  let service: RetentionService;
  const saved = { ...process.env };

  beforeEach(() => {
    prisma = makePrisma();
    for (const m of [
      prisma.notification.deleteMany,
      prisma.message.deleteMany,
      prisma.rideDetails.updateMany,
      prisma.booking.updateMany,
      prisma.payment.updateMany,
    ]) {
      m.mockResolvedValue({ count: 0 });
    }
    service = new RetentionService(prisma as any);
    for (const k of Object.keys(RETENTION_DEFAULTS)) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('deletes notifications older than the default 90 days', async () => {
    await service.run(NOW);
    const where = prisma.notification.deleteMany.mock.calls[0][0].where;
    expect(where.createdAt.lt).toEqual(new Date(NOW.getTime() - 90 * DAY_MS));
  });

  it('only deletes messages of finished bookings, after 180 days', async () => {
    await service.run(NOW);
    const where = prisma.message.deleteMany.mock.calls[0][0].where;
    expect(where.createdAt.lt).toEqual(new Date(NOW.getTime() - 180 * DAY_MS));
    expect(where.booking.state.in).toEqual(TERMINAL);
  });

  it('scrubs addresses of finished bookings after a year and skips rows already scrubbed', async () => {
    await service.run(NOW);
    const call = prisma.rideDetails.updateMany.mock.calls[0][0];
    expect(call.data).toEqual(SCRUBBED_RIDE);
    expect(call.where.pickupAddress).toEqual({ not: '[removed]' });
    expect(call.where.booking.state.in).toEqual(TERMINAL);
    expect(call.where.booking.updatedAt.lt).toEqual(new Date(NOW.getTime() - 365 * DAY_MS));
  });

  it('never touches open bookings', async () => {
    await service.run(NOW);
    for (const call of [
      ...prisma.message.deleteMany.mock.calls,
      ...prisma.rideDetails.updateMany.mock.calls,
      ...prisma.booking.updateMany.mock.calls,
    ]) {
      const states = JSON.stringify(call[0].where);
      expect(states).not.toMatch(/REQUESTED|ACCEPTED|EN_ROUTE|ARRIVED|IN_PROGRESS/);
    }
  });

  it('clears ride addresses before booking notes (notes update bumps updatedAt)', async () => {
    await service.run(NOW);
    expect(prisma.rideDetails.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.booking.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('clears raw payment callbacks (they carry phone numbers) but keeps the payment', async () => {
    await service.run(NOW);
    const call = prisma.payment.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ rawCallback: 'DB_NULL' });
    expect(call.where.rawCallback).toEqual({ not: 'DB_NULL' });
    expect(call.where.updatedAt.lt).toEqual(new Date(NOW.getTime() - 90 * DAY_MS));
  });

  it('honours env overrides and ignores invalid values', async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = '30';
    process.env.MESSAGE_RETENTION_DAYS = 'abc';
    expect(retentionDays('NOTIFICATION_RETENTION_DAYS')).toBe(30);
    expect(retentionDays('MESSAGE_RETENTION_DAYS')).toBe(180);
    await service.run(NOW);
    expect(prisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt).toEqual(
      new Date(NOW.getTime() - 30 * DAY_MS),
    );
  });

  it('reports what it removed', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 7 });
    prisma.message.deleteMany.mockResolvedValue({ count: 3 });
    prisma.rideDetails.updateMany.mockResolvedValue({ count: 2 });
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.updateMany.mockResolvedValue({ count: 4 });
    await expect(service.run(NOW)).resolves.toEqual({
      notificationsDeleted: 7,
      messagesDeleted: 3,
      rideDetailsScrubbed: 2,
      bookingNotesCleared: 1,
      paymentCallbacksCleared: 4,
    });
  });

  it('the scheduled job logs a failure instead of crashing the process', async () => {
    prisma.notification.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(service.scheduled()).resolves.toBeUndefined();
  });
});
