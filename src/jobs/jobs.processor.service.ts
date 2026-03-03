import { Injectable, Logger } from '@nestjs/common';
import {
  JobAttemptStatus,
  JobResultStatus,
  JobStatus,
  ParserMode,
  Prisma,
} from '@prisma/client';
import type { CanonicalField } from './interfaces/canonical-mapping.interface';
import { SpreadsheetImportProcessorService } from './services/spreadsheet-import-processor.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobsProcessorService {
  private readonly logger = new Logger(JobsProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spreadsheetImportProcessorService: SpreadsheetImportProcessorService,
  ) {}

  schedule(jobId: string): void {
    setImmediate(() => {
      void this.processJob(jobId);
    });
  }

  async processJob(jobId: string): Promise<void> {
    const processingStartedAt = Date.now();
    let attemptId: string | null = null;
    let attemptNumber = 0;

    try {
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        include: { upload: true },
      });

      if (!job) {
        this.logger.warn(`Job ${jobId} not found for processing.`);
        return;
      }

      const latestAttempt = await this.prisma.jobAttempt.findFirst({
        where: { jobId },
        orderBy: { attemptNumber: 'desc' },
      });

      attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;

      const attempt = await this.prisma.jobAttempt.create({
        data: {
          jobId,
          attemptNumber,
          status: JobAttemptStatus.PROCESSING,
          startedAt: new Date(),
        },
      });
      attemptId = attempt.id;

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PROCESSING,
          startedAt: new Date(),
          finishedAt: null,
          lastError: null,
        },
      });

      if (attemptNumber > 1) {
        await this.prisma.jobResultItem.deleteMany({ where: { jobId } });
      }

      const ingestion = await this.spreadsheetImportProcessorService.processFile(
        job.upload.storagePath,
        job.upload.originalFileName,
      );

      const mappingSummary = {
        mode: ingestion.mapping.mode,
        confidence: ingestion.mapping.confidence,
        canonicalToHeader:
          ingestion.mapping.canonicalToHeader as unknown as Prisma.InputJsonObject,
        missingCanonical:
          ingestion.mapping.missingCanonical as unknown as Prisma.InputJsonArray,
        matches: ingestion.mapping.matches.map((match) => ({
          canonicalField: match.canonicalField,
          header: match.header,
          score: match.score,
        })) as unknown as Prisma.InputJsonArray,
        warnings: ingestion.mapping.warnings as unknown as Prisma.InputJsonArray,
      } as Prisma.InputJsonObject;

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          parserMode:
            ingestion.parserMode === 'canonical'
              ? ParserMode.CANONICAL
              : ParserMode.FLEXIBLE,
          headerRowIndex: ingestion.headerRowIndex,
          detectedSheetName: ingestion.sheetName,
          detectedHeaders: ingestion.detectedHeaders,
          normalizedHeaders: ingestion.normalizedHeaders,
          mappingSummary,
        },
      });

      const resultItems: Prisma.JobResultItemCreateManyInput[] = [];

      ingestion.rows.forEach((row) => {
        const canonicalFieldAvailability = {
          name: Boolean(ingestion.mapping.canonicalToHeader.name),
          email: Boolean(ingestion.mapping.canonicalToHeader.email),
          department: Boolean(ingestion.mapping.canonicalToHeader.department),
          salary: Boolean(ingestion.mapping.canonicalToHeader.salary),
        };

        const validation = this.validateCanonicalValues(
          row.canonicalValues,
          canonicalFieldAvailability,
        );

        const warnings = [...row.warnings, ...validation.warnings];
        const status =
          validation.errors.length > 0
            ? JobResultStatus.FAILED
            : warnings.length > 0
              ? JobResultStatus.WARNING
              : JobResultStatus.SUCCESS;

        const message =
          validation.errors.length > 0
            ? validation.errors.join('; ')
            : warnings.length > 0
              ? warnings.join('; ')
              : 'Row imported successfully.';

        const normalizedPayload = {
          ...(row.normalizedData as Record<string, unknown>),
          ...validation.normalizedCanonical,
        } as Prisma.InputJsonObject;

        resultItems.push({
          jobId,
          rowNumber: row.rowNumber,
          status,
          message,
          rawData: row.rawData,
          normalizedData: normalizedPayload,
          warnings: warnings.length > 0 ? (warnings as Prisma.InputJsonArray) : Prisma.JsonNull,
        });
      });

      if (resultItems.length === 0) {
        throw new Error('No usable rows found in spreadsheet.');
      }

      await this.prisma.jobResultItem.createMany({
        data: resultItems,
      });

      const failedRows = resultItems.filter(
        (item) => item.status === JobResultStatus.FAILED,
      ).length;
      const warningRows = resultItems.filter(
        (item) => item.status === JobResultStatus.WARNING,
      ).length;
      const totalRows = resultItems.length;

      const finalStatus =
        failedRows === 0 && warningRows === 0
          ? JobStatus.COMPLETED
          : JobStatus.PARTIALLY_COMPLETED;
      const finalAttemptStatus =
        finalStatus === JobStatus.COMPLETED
          ? JobAttemptStatus.COMPLETED
          : JobAttemptStatus.PARTIALLY_COMPLETED;

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          totalRows,
          processedRows: totalRows,
          failedRows,
          warningRows,
          finishedAt: new Date(),
          lastError: null,
        },
      });

      await this.prisma.jobAttempt.update({
        where: { id: attemptId },
        data: {
          status: finalAttemptStatus,
          finishedAt: new Date(),
          errorMessage: null,
        },
      });

      const durationMs = Date.now() - processingStartedAt;
      const rowFailureRatio = totalRows === 0 ? 0 : failedRows / totalRows;
      const rowWarningRatio = totalRows === 0 ? 0 : warningRows / totalRows;

      this.logger.log(
        `Job ${jobId} attempt ${attemptNumber} finished with ${finalStatus} in ${durationMs}ms (rows=${totalRows}, failedRows=${failedRows}, warningRows=${warningRows}, rowFailureRatio=${rowFailureRatio.toFixed(4)}, rowWarningRatio=${rowWarningRatio.toFixed(4)}).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected processing error.';
      this.logger.error(`Job processing failed for ${jobId}: ${message}`);

      if (attemptId) {
        await this.prisma.jobAttempt.update({
          where: { id: attemptId },
          data: {
            status: JobAttemptStatus.FAILED,
            finishedAt: new Date(),
            errorMessage: message,
          },
        });
      }

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          lastError: message,
        },
      });

      const durationMs = Date.now() - processingStartedAt;
      this.logger.error(`Job ${jobId} attempt ${attemptNumber} failed in ${durationMs}ms.`);
    }
  }

  private validateCanonicalValues(
    canonicalValues: Partial<Record<CanonicalField, unknown>>,
    fieldAvailability: Record<CanonicalField, boolean>,
  ): {
    errors: string[];
    warnings: string[];
    normalizedCanonical: Record<string, unknown>;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedCanonical: Record<string, unknown> = {};

    if (fieldAvailability.name) {
      const rawName = canonicalValues.name;
      const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();

      if (!name) {
        errors.push('name cannot be empty');
      } else {
        normalizedCanonical.name = name;
      }
    }

    if (fieldAvailability.email) {
      const rawEmail = canonicalValues.email;
      const email =
        typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : String(rawEmail ?? '').trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('email is invalid');
      } else {
        normalizedCanonical.email = email;
      }
    }

    if (fieldAvailability.department) {
      const rawDepartment = canonicalValues.department;
      const department =
        typeof rawDepartment === 'string'
          ? rawDepartment.trim().toUpperCase()
          : String(rawDepartment ?? '').trim().toUpperCase();

      if (!department) {
        warnings.push('department is empty');
      } else {
        normalizedCanonical.department = department;
      }
    }

    if (fieldAvailability.salary) {
      const rawSalary = canonicalValues.salary;
      const salary = this.parseNumeric(rawSalary);

      if (salary === null || salary <= 0) {
        errors.push('salary must be a numeric value greater than 0');
      } else {
        normalizedCanonical.salary = salary;
      }
    }

    return {
      errors,
      warnings,
      normalizedCanonical,
    };
  }

  private parseNumeric(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().replace(/,/g, '.');
      if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) {
        return null;
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}
