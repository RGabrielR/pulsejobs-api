import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CanonicalField } from '../interfaces/canonical-mapping.interface';
import {
  PreparedSpreadsheetRow,
  SpreadsheetIngestionResult,
} from '../interfaces/spreadsheet-ingestion.interface';
import { CanonicalMappingService } from './canonical-mapping.service';
import { HeaderDetectionService } from './header-detection.service';
import { HeaderNormalizationService } from './header-normalization.service';
import { SpreadsheetReaderService } from './spreadsheet-reader.service';

@Injectable()
export class SpreadsheetImportProcessorService {
  constructor(
    private readonly spreadsheetReaderService: SpreadsheetReaderService,
    private readonly headerDetectionService: HeaderDetectionService,
    private readonly headerNormalizationService: HeaderNormalizationService,
    private readonly canonicalMappingService: CanonicalMappingService,
  ) {}

  async processFile(
    filePath: string,
    originalFileName: string,
  ): Promise<SpreadsheetIngestionResult> {
    const readResult = await this.spreadsheetReaderService.read(filePath, originalFileName);

    if (readResult.rows.length === 0) {
      throw new Error('No usable rows found in spreadsheet.');
    }

    const headerDetection = this.headerDetectionService.detect(readResult.rows);
    const normalizedHeaders = this.headerNormalizationService.normalizeHeaders(
      headerDetection.headers,
    );
    const mapping = this.canonicalMappingService.mapHeaders(normalizedHeaders);

    const dataStartIndex =
      headerDetection.headerRowIndex === null ? 0 : headerDetection.headerRowIndex + 1;

    const preparedRows = this.prepareRows(
      readResult.rows,
      dataStartIndex,
      headerDetection.headers,
      normalizedHeaders,
      mapping.mode,
      mapping.canonicalToHeader,
      mapping.missingCanonical,
    );

    if (preparedRows.length === 0) {
      throw new Error('No usable rows found in spreadsheet.');
    }

    return {
      sheetName: readResult.sheetName,
      parserMode: mapping.mode,
      headerRowIndex:
        headerDetection.headerRowIndex === null ? null : headerDetection.headerRowIndex + 1,
      detectedHeaders: headerDetection.headers,
      normalizedHeaders,
      mapping,
      rows: preparedRows,
      warnings: [...mapping.warnings],
    };
  }

  private prepareRows(
    allRows: string[][],
    dataStartIndex: number,
    detectedHeaders: string[],
    normalizedHeaders: string[],
    mode: 'canonical' | 'flexible',
    canonicalToHeader: Partial<Record<CanonicalField, string>>,
    missingCanonical: CanonicalField[],
  ): PreparedSpreadsheetRow[] {
    const preparedRows: PreparedSpreadsheetRow[] = [];

    for (let rowIndex = dataStartIndex; rowIndex < allRows.length; rowIndex += 1) {
      const sourceRow = allRows[rowIndex] ?? [];
      const rowValues = this.padRow(sourceRow, detectedHeaders.length);
      const normalizedValues = this.padRow(sourceRow, normalizedHeaders.length);

      if (rowValues.every((value) => value.trim().length === 0)) {
        continue;
      }

      const rawData: Record<string, unknown> = {};
      const normalizedData: Record<string, unknown> = {};
      const inferredTypes: Record<string, string> = {};

      detectedHeaders.forEach((header, headerIndex) => {
        rawData[header] = rowValues[headerIndex] ?? '';
      });

      normalizedHeaders.forEach((header, headerIndex) => {
        const rawValue = normalizedValues[headerIndex] ?? '';
        const inferred = this.inferValue(rawValue);
        normalizedData[header] = inferred.value;
        inferredTypes[header] = inferred.type;
      });

      const canonicalValues: Partial<Record<CanonicalField, unknown>> = {};
      (Object.keys(canonicalToHeader) as CanonicalField[]).forEach((field) => {
        const mappedHeader = canonicalToHeader[field];
        if (!mappedHeader) {
          return;
        }

        canonicalValues[field] = normalizedData[mappedHeader];
        normalizedData[field] = normalizedData[mappedHeader];
      });

      normalizedData._inferredTypes = inferredTypes;

      const rowWarnings: string[] = [];
      if (mode === 'flexible') {
        rowWarnings.push('Processed in flexible mode due to low canonical mapping confidence.');
      }

      if (missingCanonical.length > 0) {
        rowWarnings.push(`Missing canonical fields: ${missingCanonical.join(', ')}`);
      }

      preparedRows.push({
        rowNumber: rowIndex + 1,
        rawData: rawData as Prisma.InputJsonObject,
        normalizedData: normalizedData as Prisma.InputJsonObject,
        canonicalValues,
        warnings: rowWarnings,
      });
    }

    return preparedRows;
  }

  private inferValue(value: string): { value: string | number | boolean | null; type: string } {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { value: null, type: 'null' };
    }

    if (/^(true|false)$/i.test(trimmed)) {
      return { value: trimmed.toLowerCase() === 'true', type: 'boolean' };
    }

    const normalizedNumeric = trimmed.replace(/,/g, '.');
    if (/^[-+]?\d+(?:\.\d+)?$/.test(normalizedNumeric)) {
      return { value: Number(normalizedNumeric), type: 'number' };
    }

    return { value: trimmed, type: 'string' };
  }

  private padRow(row: string[], width: number): string[] {
    const padded: string[] = [];
    for (let index = 0; index < width; index += 1) {
      padded.push(String(row[index] ?? ''));
    }

    return padded;
  }
}