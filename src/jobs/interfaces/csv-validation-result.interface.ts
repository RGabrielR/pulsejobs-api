import type { Prisma } from '@prisma/client';

export interface CsvValidationResult {
  status: 'SUCCESS' | 'FAILED';
  message: string;
  normalizedData: Prisma.InputJsonObject | null;
}
