import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const jwtServiceMock = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('registers a user and returns token payload', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(
      async ({ data }: { data: { email: string; passwordHash: string } }) => ({
        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await service.register({
      email: 'new@pulsejobs.dev',
      password: 'Password123!',
    });

    expect(result.accessToken).toBe('mock-token');
    expect(result.user.email).toBe('new@pulsejobs.dev');
    expect(prismaMock.user.create).toHaveBeenCalled();
    expect(jwtServiceMock.signAsync).toHaveBeenCalled();
  });

  it('logs in a valid user', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@pulsejobs.dev',
      passwordHash,
      role: Role.USER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.login({
      email: 'user@pulsejobs.dev',
      password: 'Password123!',
    });

    expect(result.accessToken).toBe('mock-token');
    expect(result.user.id).toBe('user-1');
    expect(jwtServiceMock.signAsync).toHaveBeenCalled();
  });
});