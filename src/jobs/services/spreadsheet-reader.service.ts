import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { SpreadsheetReadResult } from '../interfaces/spreadsheet-ingestion.interface';

const EXCEL_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.xltx',
  '.xltm',
]);

@Injectable()
export class SpreadsheetReaderService {
  async read(filePath: string, originalFileName: string): Promise<SpreadsheetReadResult> {
    const extension = extname(originalFileName || filePath).toLowerCase();

    if (EXCEL_EXTENSIONS.has(extension)) {
      return this.readExcel(filePath);
    }

    return this.readCsv(filePath);
  }

  private async readCsv(filePath: string): Promise<SpreadsheetReadResult> {
    let content: string;

    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      throw new Error('Unable to read spreadsheet file.');
    }

    const rows = content
      .split(/\r?\n/)
      .map((line) => this.parseCsvLine(line))
      .filter((row) => row.some((value) => value.trim().length > 0));

    return {
      sheetName: 'csv',
      rows,
    };
  }

  private readExcel(filePath: string): SpreadsheetReadResult {
    const XLSX = require('xlsx/xlsx.js') as {
      readFile: (path: string, options?: { cellDates?: boolean }) => {
        SheetNames: string[];
        Sheets: Record<string, unknown>;
      };
      utils: {
        sheet_to_json: <T>(
          worksheet: unknown,
          options?: {
            header?: number;
            raw?: boolean;
            blankrows?: boolean;
            defval?: string;
          },
        ) => T[];
      };
    };

    let workbook: { SheetNames: string[]; Sheets: Record<string, unknown> };

    try {
      workbook = XLSX.readFile(filePath, { cellDates: false });
    } catch {
      throw new Error('Unable to read spreadsheet file.');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Spreadsheet does not contain any worksheet.');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const rows = XLSX.utils
      .sheet_to_json<Array<unknown>>(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: '',
      })
      .map((row) => row.map((cell) => String(cell ?? '')))
      .filter((row) => row.some((value) => value.trim().length > 0));

    return {
      sheetName: firstSheetName,
      rows,
    };
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }

        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current);
    return values;
  }
}