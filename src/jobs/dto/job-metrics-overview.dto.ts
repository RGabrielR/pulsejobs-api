import { ApiProperty } from '@nestjs/swagger';

class JobStatusBreakdownDto {
  @ApiProperty()
  PENDING!: number;

  @ApiProperty()
  PROCESSING!: number;

  @ApiProperty()
  COMPLETED!: number;

  @ApiProperty()
  FAILED!: number;

  @ApiProperty()
  PARTIALLY_COMPLETED!: number;
}

export class JobMetricsOverviewDto {
  @ApiProperty()
  lookbackHours!: number;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  totalJobs!: number;

  @ApiProperty({ type: JobStatusBreakdownDto })
  statusBreakdown!: JobStatusBreakdownDto;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  failedRows!: number;

  @ApiProperty()
  warningRows!: number;

  @ApiProperty({ description: 'failedRows / totalRows in range [0, 1].' })
  rowFailureRatio!: number;

  @ApiProperty({ description: 'warningRows / totalRows in range [0, 1].' })
  rowWarningRatio!: number;

  @ApiProperty({ nullable: true, description: 'Average finished job latency in milliseconds.' })
  averageLatencyMs!: number | null;

  @ApiProperty({ nullable: true, description: 'P95 finished job latency in milliseconds.' })
  p95LatencyMs!: number | null;
}
