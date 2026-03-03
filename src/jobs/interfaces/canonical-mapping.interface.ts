export type CanonicalField = 'name' | 'email' | 'department' | 'salary';

export interface CanonicalMatch {
  canonicalField: CanonicalField;
  header: string;
  score: number;
}

export interface CanonicalMappingResult {
  mode: 'canonical' | 'flexible';
  confidence: number;
  canonicalToHeader: Partial<Record<CanonicalField, string>>;
  headerToCanonical: Partial<Record<string, CanonicalField>>;
  missingCanonical: CanonicalField[];
  matches: CanonicalMatch[];
  warnings: string[];
}