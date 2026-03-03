import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus, JobType, Role } from '@prisma/client';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { JobsProcessorService } from './jobs.processor.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;

  const prismaMock = {
    job: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    jobResultItem: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const uploadsServiceMock = {
    createUpload: jest.fn(),
  };

  const processorMock = {
    schedule: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UploadsService, useValue: uploadsServiceMock },
        { provide: JobsProcessorService, useValue: processorMock },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('lists only own jobs for normal users', async () => {
    prismaMock.job.findMany.mockResolvedValue([]);
    prismaMock.job.count.mockResolvedValue(0);

    const user: AuthUser = {
      userId: 'user-1',
      email: 'user@pulsejobs.dev',
      role: Role.USER,
    };

    await service.listJobs({ page: 1, limit: 10 }, user);

    expect(prismaMock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ uploadedById: 'user-1' }),
      }),
    );
  });

  it('schedules retry for admin users', async () => {
    prismaMock.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.FAILED,
      type: JobType.CSV_IMPORT,
    });
    prismaMock.job.update.mockResolvedValue({ id: 'job-1' });

    const admin: AuthUser = {
      userId: 'admin-1',
      email: 'admin@pulsejobs.dev',
      role: Role.ADMIN,
    };

    const result = await service.retryJob('job-1', admin);

    expect(result.status).toBe(JobStatus.PENDING);
    expect(processorMock.schedule).toHaveBeenCalledWith('job-1');
  });

  it('accepts xlsx uploads and schedules processing', async () => {
    uploadsServiceMock.createUpload.mockResolvedValue({ id: 'upload-1' });
    prismaMock.job.create.mockResolvedValue({ id: 'job-1', upload: { id: 'upload-1' } });

    const user: AuthUser = {
      userId: 'user-1',
      email: 'user@pulsejobs.dev',
      role: Role.USER,
    };

    await service.importCsv(
      {
        originalname: 'employees.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 123,
        path: 'storage/uploads/file.xlsx',
      } as Express.Multer.File,
      user,
    );

    expect(uploadsServiceMock.createUpload).toHaveBeenCalled();
    expect(prismaMock.job.create).toHaveBeenCalled();
    expect(processorMock.schedule).toHaveBeenCalledWith('job-1');
  });

  it('returns observability metrics overview for admins', async () => {
    prismaMock.job.groupBy.mockResolvedValue([
      { status: JobStatus.COMPLETED, _count: { _all: 2 } },
      { status: JobStatus.PARTIALLY_COMPLETED, _count: { _all: 1 } },
    ]);
    prismaMock.job.aggregate.mockResolvedValue({
      _sum: {
        totalRows: 30,
        failedRows: 3,
        warningRows: 6,
      },
    });
    prismaMock.job.findMany.mockResolvedValue([
      { startedAt: new Date('2026-03-02T10:00:00.000Z'), finishedAt: new Date('2026-03-02T10:00:02.000Z') },
      { startedAt: new Date('2026-03-02T10:05:00.000Z'), finishedAt: new Date('2026-03-02T10:05:04.000Z') },
    ]);

    const admin: AuthUser = {
      userId: 'admin-1',
      email: 'admin@pulsejobs.dev',
      role: Role.ADMIN,
    };

    const metrics = await service.getMetricsOverview({ lookbackHours: 24 }, admin);

    expect(metrics.totalJobs).toBe(3);
    expect(metrics.rowFailureRatio).toBe(0.1);
    expect(metrics.rowWarningRatio).toBe(0.2);
    expect(metrics.averageLatencyMs).toBe(3000);
    expect(metrics.statusBreakdown.COMPLETED).toBe(2);
  });
});
