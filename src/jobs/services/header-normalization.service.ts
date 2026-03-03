import { Injectable } from '@nestjs/common';

@Injectable()
export class HeaderNormalizationService {
  normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  normalizeHeaders(headers: string[]): string[] {
    const base = headers.map((header, index) => {
      const normalized = this.normalizeHeader(header);
      return normalized || `column_${index + 1}`;
    });

    return this.ensureUnique(base);
  }

  private ensureUnique(headers: string[]): string[] {
    const seen = new Map<string, number>();

    return headers.map((header) => {
      const currentCount = seen.get(header) ?? 0;
      seen.set(header, currentCount + 1);

      if (currentCount === 0) {
        return header;
      }

      return `${header}_${currentCount + 1}`;
    });
  }
}