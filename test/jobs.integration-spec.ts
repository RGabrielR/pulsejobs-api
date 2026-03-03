import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const shouldRunIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' && Boolean(process.env.DATABASE_URL);
const describeIfIntegration = shouldRunIntegration ? describe : describe.skip;

describeIfIntegration('Jobs Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uploadDir = join(process.cwd(), 'storage');

  async function cleanupDatabase() {
    await prisma.jobResultItem.deleteMany();
    await prisma.jobAttempt.deleteMany();
    await prisma.job.deleteMany();
    await prisma.upload.deleteMany();
    await prisma.user.deleteMany();
  }

  async function waitForTerminalStatus(jobId: string, token: string) {
    const terminalStatuses = ['COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED'];

    for (let i = 0; i < 30; i += 1) {
      const response = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (terminalStatuses.includes(response.body.status)) {
        return response.body;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
    }

    throw new Error(`Job ${jobId} did not reach terminal status in expected time.`);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '86400';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase();

    const passwordHash = await bcrypt.hash('Admin123!', 10);

    await prisma.user.create({
      data: {
        email: 'admin@pulsejobs.dev',
        passwordHash,
        role: Role.ADMIN,
      },
    });
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('runs full import + retry workflow and stores attempts/results', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@pulsejobs.dev',
        password: 'Admin123!',
      })
      .expect(200);

    const token = loginResponse.body.accessToken as string;

    const csv = [
      'name,email,department,salary',
      'Alice,ALICE@EXAMPLE.COM,engineering,3000',
      ',bad-email,ops,0',
    ].join('\n');

    const importResponse = await request(app.getHttpServer())
      .post('/jobs/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'employees.csv')
      .expect(201);

    const jobId = importResponse.body.id as string;

    const firstTerminalState = await waitForTerminalStatus(jobId, token);
    expect(firstTerminalState.status).toBe('PARTIALLY_COMPLETED');
    expect(firstTerminalState.failedRows).toBe(1);
    expect(firstTerminalState.totalRows).toBe(2);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/jobs/${jobId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resultsResponse.body.total).toBe(2);
    expect(
      resultsResponse.body.items.some((item: { status: string }) => item.status === 'FAILED'),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const secondTerminalState = await waitForTerminalStatus(jobId, token);
    expect(['PARTIALLY_COMPLETED', 'COMPLETED']).toContain(secondTerminalState.status);

    const summaryResponse = await request(app.getHttpServer())
      .get(`/jobs/${jobId}/download-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(summaryResponse.body.attempts).toBeGreaterThanOrEqual(2);
    expect(summaryResponse.body.failedRows).toBeGreaterThanOrEqual(0);
  });
});
