import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Test, TestingModule } from '@nestjs/testing';
import { SpreadsheetImportProcessorService } from './spreadsheet-import-processor.service';
import { CanonicalMappingService } from './canonical-mapping.service';
import { HeaderDetectionService } from './header-detection.service';
import { HeaderNormalizationService } from './header-normalization.service';
import { SpreadsheetReaderService } from './spreadsheet-reader.service';

describe('SpreadsheetImportProcessorService', () => {
  let service: SpreadsheetImportProcessorService;
  let tempDir: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpreadsheetImportProcessorService,
        SpreadsheetReaderService,
        HeaderDetectionService,
        HeaderNormalizationService,
        CanonicalMappingService,
      ],
    }).compile();

    service = module.get<SpreadsheetImportProcessorService>(SpreadsheetImportProcessorService);
    tempDir = await mkdtemp(join(tmpdir(), 'pulsejobs-ingestion-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('parses exact canonical headers in canonical mode', async () => {
    const filePath = join(tempDir, 'canonical.csv');
    const csv = [
      'name,email,department,salary',
      'Alice,alice@example.com,engineering,3200',
    ].join('\n');

    await writeFile(filePath, csv, 'utf8');

    const result = await service.processFile(filePath, 'canonical.csv');

    expect(result.parserMode).toBe('canonical');
    expect(result.mapping.canonicalToHeader.name).toBe('name');
    expect(result.mapping.canonicalToHeader.email).toBe('email');
    expect(result.rows).toHaveLength(1);
  });

  it('maps synonym headers from xlsx to canonical fields', async () => {
    const XLSX = require('xlsx/xlsx.js') as {
      utils: {
        aoa_to_sheet: (data: unknown[][]) => unknown;
        book_new: () => unknown;
        book_append_sheet: (book: unknown, sheet: unknown, name: string) => void;
      };
      writeFile: (book: unknown, path: string) => void;
    };

    const filePath = join(tempDir, 'synonyms.xlsx');
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Correo', 'Area', 'Sueldo'],
      ['Ana', 'ana@example.com', 'ventas', 4500],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    XLSX.writeFile(workbook, filePath);

    const result = await service.processFile(filePath, 'synonyms.xlsx');

    expect(result.sheetName).toBe('Datos');
    expect(result.parserMode).toBe('canonical');
    expect(result.mapping.canonicalToHeader.name).toBe('nombre');
    expect(result.mapping.canonicalToHeader.email).toBe('correo');
    expect(result.mapping.canonicalToHeader.department).toBe('area');
    expect(result.mapping.canonicalToHeader.salary).toBe('sueldo');
  });

  it('falls back to flexible mode when canonical headers are missing', async () => {
    const filePath = join(tempDir, 'flexible.csv');
    const csv = [
      'party,vote,session',
      'A,YES,12',
      'B,NO,12',
    ].join('\n');

    await writeFile(filePath, csv, 'utf8');

    const result = await service.processFile(filePath, 'flexible.csv');

    expect(result.parserMode).toBe('flexible');
    expect(result.mapping.missingCanonical.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(2);
  });

  it('generates generic headers when no clear header row exists', async () => {
    const filePath = join(tempDir, 'no-header.csv');
    const csv = [
      '100,200,300',
      '110,220,330',
      '120,240,360',
    ].join('\n');

    await writeFile(filePath, csv, 'utf8');

    const result = await service.processFile(filePath, 'no-header.csv');

    expect(result.headerRowIndex).toBeNull();
    expect(result.detectedHeaders).toEqual(['column_1', 'column_2', 'column_3']);
    expect(result.rows).toHaveLength(3);
  });

  it('throws for corrupted or unreadable spreadsheet files', async () => {
    const filePath = join(tempDir, 'missing.xlsx');

    await expect(service.processFile(filePath, 'missing.xlsx')).rejects.toThrow(
      'Unable to read spreadsheet file.',
    );
  });
});
