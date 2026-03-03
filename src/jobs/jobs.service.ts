import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, JobType, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { JobMetricsQueryDto } from './dto/job-metrics-query.dto';
import { ListJobResultsQueryDto } from './dto/list-job-results-query.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobsProcessorService } from './jobs.processor.service';

const SUPPORTED_SPREADSHEET_EXTENSIONS = new Set<string>([
  '.csv',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.xltx',
  '.xltm',
]);

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly jobsProcessor: JobsProcessorService,
  ) {}

  async importCsv(file: Express.Multer.File, currentUser: AuthUser) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required.');
    }

    const extension = this.getFileExtension(file.originalname);
    if (!SUPPORTED_SPREADSHEET_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        'Only .csv, .xlsx, .xls, .xlsm, .xlsb, .xltx and .xltm files are accepted.',
      );
    }

    const upload = await this.uploadsService.createUpload({
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storagePath: file.path,
      uploadedById: currentUser.userId,
    });

    const job = await this.prisma.job.create({
      data: {
        type: JobType.CSV_IMPORT,
        status: JobStatus.PENDING,
        uploadedById: currentUser.userId,
        uploadId: upload.id,
      },
      include: {
        upload: true,
      },
    });

    this.jobsProcessor.schedule(job.id);

    return job;
  }

  async listJobs(query: ListJobsQueryDto, currentUser: AuthUser) {
    const skip = (query.page - 1) * query.limit;
    const baseWhere = {
      ...(query.status ? { status: query.status } : {}),
      ...(currentUser.role === Role.ADMIN ? {} : { uploadedById: currentUser.userId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          upload: true,
          attempts: {
            orderBy: { attemptNumber: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.job.count({ where: baseWhere }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getJobById(jobId: string, currentUser: AuthUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        upload: true,
        attempts: {
          orderBy: { attemptNumber: 'desc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    this.assertCanAccessJob(currentUser, job.uploadedById);
    return job;
  }

  async getJobResults(
    jobId: string,
    query: ListJobResultsQueryDto,
    currentUser: AuthUser,
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, uploadedById: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    this.assertCanAccessJob(currentUser, job.uploadedById);

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.jobResultItem.findMany({
        where: { jobId },
        orderBy: { rowNumber: 'asc' },
        skip,
        take: query.limit,
      }),
      this.prisma.jobResultItem.count({ where: { jobId } }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async retryJob(jobId: string, currentUser: AuthUser) {
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can retry jobs.');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    if (job.status === JobStatus.PROCESSING || job.status === JobStatus.PENDING) {
      throw new BadRequestException('Cannot retry a job while it is active.');
    }

    if (
      job.status !== JobStatus.FAILED &&
      job.status !== JobStatus.PARTIALLY_COMPLETED
    ) {
      throw new BadRequestException(
        'Only failed or partially completed jobs can be retried.',
      );
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PENDING,
        totalRows: 0,
        processedRows: 0,
        failedRows: 0,
        warningRows: 0,
        parserMode: null,
        headerRowIndex: null,
        detectedSheetName: null,
        detectedHeaders: Prisma.JsonNull,
        normalizedHeaders: Prisma.JsonNull,
        mappingSummary: Prisma.JsonNull,
        startedAt: null,
        finishedAt: null,
        lastError: null,
      },
    });

    this.jobsProcessor.schedule(jobId);

    return {
      jobId,
      status: JobStatus.PENDING,
      message: 'Retry has been scheduled.',
    };
  }

  async getJobSummary(jobId: string, currentUser: AuthUser) {
    const job = await this.getJobById(jobId, currentUser);

    const groupedResults = await this.prisma.jobResultItem.groupBy({
      by: ['status'],
      where: { jobId },
      _count: {
        status: true,
      },
    });

    const successCount =
      groupedResults.find((result) => result.status === 'SUCCESS')?._count.status ?? 0;
    const failedCount =
      groupedResults.find((result) => result.status === 'FAILED')?._count.status ?? 0;
    const warningCount =
      groupedResults.find((result) => result.status === 'WARNING')?._count.status ?? 0;

    return {
      jobId: job.id,
      status: job.status,
      type: job.type,
      parserMode: job.parserMode?.toLowerCase() ?? null,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      failedRows: job.failedRows,
      warningRows: job.warningRows,
      successRows: successCount,
      failedResultRows: failedCount,
      warningResultRows: warningCount,
      attempts: job.attempts.length,
      lastError: job.lastError,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      detectedSheetName: job.detectedSheetName,
      headerRowIndex: job.headerRowIndex,
      detectedHeaders: job.detectedHeaders,
      normalizedHeaders: job.normalizedHeaders,
      mappingSummary: job.mappingSummary,
      upload: {
        id: job.upload.id,
        originalFileName: job.upload.originalFileName,
        size: job.upload.size,
        createdAt: job.upload.createdAt,
      },
    };
  }

  async getMetricsOverview(query: JobMetricsQueryDto, currentUser: AuthUser) {
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can access metrics.');
    }

    const lookbackHours = query.lookbackHours;
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const [groupedByStatus, rowsAggregate, jobsWithTiming] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: since },
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.job.aggregate({
        where: {
          createdAt: { gte: since },
        },
        _sum: {
          totalRows: true,
          failedRows: true,
          warningRows: true,
        },
      }),
      this.prisma.job.findMany({
        where: {
          createdAt: { gte: since },
          startedAt: { not: null },
          finishedAt: { not: null },
        },
        select: {
          startedAt: true,
          finishedAt: true,
        },
      }),
    ]);

    const statusBreakdown: Record<JobStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      PARTIALLY_COMPLETED: 0,
    };

    groupedByStatus.forEach((item) => {
      statusBreakdown[item.status] = item._count._all;
    });

    const latencies = jobsWithTiming
      .map((job) => {
        if (!job.startedAt || !job.finishedAt) {
          return null;
        }

        return job.finishedAt.getTime() - job.startedAt.getTime();
      })
      .filter((latency): latency is number => latency !== null)
      .sort((a, b) => a - b);

    const averageLatencyMs =
      latencies.length === 0
        ? null
        : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
    const p95LatencyMs =
      latencies.length === 0
        ? null
        : latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];

    const totalRows = rowsAggregate._sum.totalRows ?? 0;
    const failedRows = rowsAggregate._sum.failedRows ?? 0;
    const warningRows = rowsAggregate._sum.warningRows ?? 0;

    return {
      lookbackHours,
      generatedAt: new Date().toISOString(),
      totalJobs: groupedByStatus.reduce((acc, item) => acc + item._count._all, 0),
      statusBreakdown,
      totalRows,
      failedRows,
      warningRows,
      rowFailureRatio: totalRows === 0 ? 0 : failedRows / totalRows,
      rowWarningRatio: totalRows === 0 ? 0 : warningRows / totalRows,
      averageLatencyMs,
      p95LatencyMs,
    };
  }

  private assertCanAccessJob(currentUser: AuthUser, jobOwnerId: string): void {
    if (currentUser.role !== Role.ADMIN && currentUser.userId !== jobOwnerId) {
      throw new ForbiddenException('You cannot access this job.');
    }
  }

  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot < 0) {
      return '';
    }

    return fileName.slice(lastDot).toLowerCase();
  }
}
