import type { Prisma } from '@prisma/client';
import type { CanonicalField, CanonicalMappingResult } from './canonical-mapping.interface';

export interface SpreadsheetReadResult {
  sheetName: string;
  rows: string[][];
}

export interface HeaderDetectionResult {
  headerRowIndex: number | null;
  headers: string[];
}

export interface PreparedSpreadsheetRow {
  rowNumber: number;
  rawData: Prisma.InputJsonObject;
  normalizedData: Prisma.InputJsonObject;
  canonicalValues: Partial<Record<CanonicalField, unknown>>;
  warnings: string[];
}

export interface SpreadsheetIngestionResult {
  sheetName: string;
  parserMode: 'canonical' | 'flexible';
  headerRowIndex: number | null;
  detectedHeaders: string[];
  normalizedHeaders: string[];
  mapping: CanonicalMappingResult;
  rows: PreparedSpreadsheetRow[];
  warnings: string[];
}