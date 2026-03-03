import { Injectable } from '@nestjs/common';
import {
  CanonicalField,
  CanonicalMappingResult,
  CanonicalMatch,
} from '../interfaces/canonical-mapping.interface';

const CANONICAL_SYNONYMS: Record<CanonicalField, string[]> = {
  name: ['name', 'full_name', 'employee_name', 'nombre'],
  email: ['email', 'mail', 'correo', 'email_address'],
  department: ['department', 'area', 'team', 'sector', 'division'],
  salary: ['salary', 'income', 'gross_salary', 'sueldo', 'compensation'],
};

@Injectable()
export class CanonicalMappingService {
  mapHeaders(normalizedHeaders: string[]): CanonicalMappingResult {
    const candidates: CanonicalMatch[] = [];

    (Object.keys(CANONICAL_SYNONYMS) as CanonicalField[]).forEach((field) => {
      const synonyms = CANONICAL_SYNONYMS[field];
      normalizedHeaders.forEach((header) => {
        const bestScore = Math.max(
          ...synonyms.map((synonym) => this.scoreHeaderAgainstSynonym(header, synonym)),
        );

        if (bestScore >= 0.7) {
          candidates.push({
            canonicalField: field,
            header,
            score: bestScore,
          });
        }
      });
    });

    candidates.sort((left, right) => right.score - left.score);

    const canonicalToHeader: Partial<Record<CanonicalField, string>> = {};
    const headerToCanonical: Partial<Record<string, CanonicalField>> = {};
    const pickedMatches: CanonicalMatch[] = [];

    for (const candidate of candidates) {
      if (canonicalToHeader[candidate.canonicalField]) {
        continue;
      }

      if (headerToCanonical[candidate.header]) {
        continue;
      }

      canonicalToHeader[candidate.canonicalField] = candidate.header;
      headerToCanonical[candidate.header] = candidate.canonicalField;
      pickedMatches.push(candidate);
    }

    const missingCanonical = (Object.keys(CANONICAL_SYNONYMS) as CanonicalField[]).filter(
      (field) => !canonicalToHeader[field],
    );

    const mappedCount = pickedMatches.length;
    const scoreSum = pickedMatches.reduce((sum, match) => sum + match.score, 0);
    const confidence = Number((scoreSum / 4).toFixed(3));
    const mode = mappedCount >= 2 && confidence >= 0.5 ? 'canonical' : 'flexible';

    const warnings: string[] = [];
    if (mode === 'flexible') {
      warnings.push('Canonical mapping confidence is low. Spreadsheet is processed in flexible mode.');
    }

    if (missingCanonical.length > 0) {
      warnings.push(`Missing canonical fields: ${missingCanonical.join(', ')}`);
    }

    return {
      mode,
      confidence,
      canonicalToHeader,
      headerToCanonical,
      missingCanonical,
      matches: pickedMatches,
      warnings,
    };
  }

  private scoreHeaderAgainstSynonym(header: string, synonym: string): number {
    if (header === synonym) {
      return 1;
    }

    const compactHeader = header.replace(/_/g, '');
    const compactSynonym = synonym.replace(/_/g, '');

    if (compactHeader === compactSynonym) {
      return 0.95;
    }

    if (header.startsWith(synonym) || synonym.startsWith(header)) {
      return 0.85;
    }

    if (header.includes(synonym) || synonym.includes(header)) {
      return 0.75;
    }

    return 0;
  }
}