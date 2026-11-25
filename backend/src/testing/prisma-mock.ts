/**
 * A loose in-memory stand-in for PrismaService used by unit tests. Every model method is a
 * jest.fn that resolves to undefined unless a test sets it up, and `$transaction` runs its
 * callback against the same mock. Calling a method that is not listed throws, which makes
 * accidental writes (for example deleting a payment) fail loudly.
 */
const MODELS: Record<string, string[]> = {
  user: ['findUnique', 'findUniqueOrThrow', 'update', 'create'],
  booking: ['findUnique', 'findUniqueOrThrow', 'findMany', 'count', 'updateMany', 'create'],
  bookingEvent: ['create'],
  referral: ['findUnique', 'findMany', 'findFirst', 'count', 'create', 'updateMany'],
  notification: ['create', 'findMany', 'deleteMany'],
  customerDriverConnection: ['findUnique', 'findMany', 'deleteMany'],
  driverConnection: ['findUnique', 'findMany', 'deleteMany'],
  message: ['findMany', 'updateMany', 'deleteMany'],
  review: ['findMany', 'updateMany'],
  report: ['findMany', 'count'],
  driverLocation: ['deleteMany'],
  driverProfile: ['findUnique', 'deleteMany'],
  rideDetails: ['updateMany'],
  payment: ['updateMany'],
  dataRequest: ['create', 'count', 'findMany'],
  consentRecord: ['findMany', 'create'],
};

export type MockPrisma = Record<string, any>;

export function makePrisma(): MockPrisma {
  const prisma: MockPrisma = {};
  for (const [model, methods] of Object.entries(MODELS)) {
    prisma[model] = Object.fromEntries(
      methods.map((m) => [m, jest.fn().mockResolvedValue(undefined)]),
    );
  }
  prisma.$queryRaw = jest.fn().mockResolvedValue([]);
  prisma.$transaction = jest.fn((cb: (tx: MockPrisma) => unknown) => cb(prisma));
  return prisma;
}
