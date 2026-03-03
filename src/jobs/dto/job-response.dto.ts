import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, JobType, ParserMode } from '@prisma/client';

export class JobResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: JobType })
  type!: JobType;

  @ApiProperty({ enum: JobStatus })
  status!: JobStatus;

  @ApiProperty()
  uploadedById!: string;

  @ApiProperty()
  uploadId!: string;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  processedRows!: number;

  @ApiProperty()
  failedRows!: number;

  @ApiProperty()
  warningRows!: number;

  @ApiProperty({ enum: ParserMode, nullable: true })
  parserMode!: ParserMode | null;

  @ApiProperty({ nullable: true })
  headerRowIndex!: number | null;

  @ApiProperty({ nullable: true })
  detectedSheetName!: string | null;

  @ApiProperty({ type: 'array', items: { type: 'string' }, nullable: true })
  detectedHeaders!: string[] | null;

  @ApiProperty({ type: 'array', items: { type: 'string' }, nullable: true })
  normalizedHeaders!: string[] | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  mappingSummary!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastError!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
