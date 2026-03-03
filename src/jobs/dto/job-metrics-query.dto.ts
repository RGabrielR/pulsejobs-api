import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class JobMetricsQueryDto {
  @ApiPropertyOptional({
    default: 24,
    minimum: 1,
    maximum: 720,
    description: 'Window size in hours used to aggregate metrics.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  lookbackHours = 24;
}
