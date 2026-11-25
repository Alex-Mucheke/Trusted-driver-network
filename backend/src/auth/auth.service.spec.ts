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
jest.mock('bcryptjs', () => ({
  hash: jest.fn(async () => 'hashed'),
  compare: jest.fn(async (pw: string) => pw === 'right-password'),
}));

import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { makePrisma, MockPrisma } from '../testing/prisma-mock';
import { PRIVACY_NOTICE_VERSION } from '../privacy/policy';
import { AuthService } from './auth.service';

const base = {
  name: 'Jane Doe',
  email: 'Jane@Example.org',
  phone: '+254712345678',
  password: 'a-long-password',
  acceptPrivacyNotice: true as const,
};

describe('AuthService', () => {
  let prisma: MockPrisma;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'u1', roles: ['CUSTOMER'] });
    service = new AuthService(prisma as any, { sign: jest.fn(() => 'token') } as any);
  });

  describe('register', () => {
    it('records the privacy-notice version a customer accepted', async () => {
      await service.register({ ...base, role: 'CUSTOMER' });
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('jane@example.org');
      expect(data.consents.create).toEqual([
        { type: 'PRIVACY_NOTICE', version: PRIVACY_NOTICE_VERSION },
      ]);
    });

    it('also records verification consent for a driver', async () => {
      await service.register({ ...base, role: 'DRIVER', consentDriverVerification: true });
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.consents.create.map((c: any) => c.type)).toEqual([
        'PRIVACY_NOTICE',
        'DRIVER_VERIFICATION',
      ]);
      expect(data.driverProfile.create.shareCode).toHaveLength(8);
    });

    it('refuses a driver who has not consented to document verification', async () => {
      await expect(service.register({ ...base, role: 'DRIVER' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.register({ ...base, role: 'DRIVER', consentDriverVerification: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('reports a duplicate email or phone without saying which', async () => {
      prisma.user.create.mockRejectedValue(new mockKnownError('dup', 'P2002'));
      await expect(service.register({ ...base, role: 'CUSTOMER' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const row = { id: 'u1', passwordHash: 'h', status: 'ACTIVE', deletedAt: null };

    it('accepts the right password', async () => {
      prisma.user.findUnique.mockResolvedValue(row);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1' });
      await expect(
        service.login({ email: 'a@b.org', password: 'right-password' }),
      ).resolves.toEqual({
        user: { id: 'u1' },
        token: 'token',
      });
    });

    it('gives the same error for an unknown email and a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service
        .login({ email: 'a@b.org', password: 'x' })
        .catch((e: UnauthorizedException) => e.message);
      prisma.user.findUnique.mockResolvedValue(row);
      const wrong = await service
        .login({ email: 'a@b.org', password: 'x' })
        .catch((e: UnauthorizedException) => e.message);
      expect(unknown).toBe(wrong);
    });

    it('does not let an erased account sign in', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...row, deletedAt: new Date() });
      await expect(
        service.login({ email: 'a@b.org', password: 'right-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not let a suspended account sign in', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...row, status: 'SUSPENDED' });
      await expect(
        service.login({ email: 'a@b.org', password: 'right-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
