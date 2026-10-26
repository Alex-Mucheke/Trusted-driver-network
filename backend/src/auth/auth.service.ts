import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newShareCode(len = 8): string {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => SHARE_ALPHABET[b % SHARE_ALPHABET.length]).join('');
}

const userSelect = { id: true, name: true, email: true, phone: true, roles: true, status: true } as const;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role: Role = dto.role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          passwordHash,
          roles: [role],
          ...(role === 'DRIVER'
            ? {
                driverProfile: {
                  create: {
                    shareCode: newShareCode(),
                    // Rides are the MVP service; other services are enabled in later phases.
                    services: { create: [{ serviceType: 'RIDE', active: true }] },
                  },
                },
              }
            : {}),
        },
        select: userSelect,
      });
      return { user, token: this.sign(user.id) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email or phone number is already registered');
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const row = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Same error for unknown user / wrong password to avoid account enumeration.
    const ok = row ? await bcrypt.compare(dto.password, row.passwordHash) : false;
    if (!row || !ok) throw new UnauthorizedException('Invalid email or password');
    if (row.status !== 'ACTIVE') throw new UnauthorizedException('Account suspended');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.id }, select: userSelect });
    return { user, token: this.sign(row.id) };
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  }

  private sign(userId: string) {
    return this.jwt.sign({ sub: userId });
  }
}
