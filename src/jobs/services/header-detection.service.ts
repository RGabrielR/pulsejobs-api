import { Injectable } from '@nestjs/common';
import { HeaderDetectionResult } from '../interfaces/spreadsheet-ingestion.interface';
import { HeaderNormalizationService } from './header-normalization.service';

@Injectable()
export class HeaderDetectionService {
  constructor(
    private readonly headerNormalizationService: HeaderNormalizationService,
  ) {}

  detect(rows: string[][]): HeaderDetectionResult {
    if (rows.length === 0) {
      throw new Error('File does not contain usable rows.');
    }

    const maxColumns = Math.max(...rows.map((row) => row.length), 0);
    const scanLimit = Math.min(rows.length, 10);

    let bestRowIndex: number | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
      const score = this.scoreRow(rows[rowIndex], maxColumns);
      if (score > bestScore) {
        bestScore = score;
        bestRowIndex = rowIndex;
      }
    }

    const isHeaderConfident = bestRowIndex !== null && bestScore >= 6;
    if (!isHeaderConfident) {
      const fallbackColumns = Math.max(maxColumns, 1);
      return {
        headerRowIndex: null,
        headers: Array.from(
          { length: fallbackColumns },
          (_value, index) => `column_${index + 1}`,
        ),
      };
    }

    const headerRow = this.padRow(rows[bestRowIndex!], maxColumns).map((cell, index) => {
      const value = cell.trim();
      return value.length > 0 ? value : `column_${index + 1}`;
    });

    return {
      headerRowIndex: bestRowIndex,
      headers: headerRow,
    };
  }

  private scoreRow(row: string[], totalColumns: number): number {
    const cells = this.padRow(row, totalColumns);
    const nonEmptyCells = cells.filter((cell) => cell.trim().length > 0);

    if (nonEmptyCells.length < 2) {
      return Number.NEGATIVE_INFINITY;
    }

    const normalizedCells = nonEmptyCells
      .map((cell) => this.headerNormalizationService.normalizeHeader(cell))
      .filter((cell) => cell.length > 0);

    const uniqueCount = new Set(normalizedCells).size;
    const alphaLikeCount = nonEmptyCells.filter((cell) => /[a-zA-Z\u00C0-\u024F]/.test(cell)).length;
    const numericLikeCount = nonEmptyCells.filter((cell) => /^[-+]?\d+(?:[\.,]\d+)?$/.test(cell.trim())).length;

    return nonEmptyCells.length * 2 + uniqueCount + alphaLikeCount * 1.5 - numericLikeCount * 1.25;
  }

  private padRow(row: string[], width: number): string[] {
    const padded: string[] = [];
    for (let index = 0; index < width; index += 1) {
      padded.push((row[index] ?? '').toString());
    }

    return padded;
  }
}
