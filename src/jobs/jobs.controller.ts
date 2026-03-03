import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { JobResultItemResponseDto } from './dto/job-result-item-response.dto';
import { JobMetricsOverviewDto } from './dto/job-metrics-overview.dto';
import { JobMetricsQueryDto } from './dto/job-metrics-query.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { ListJobResultsQueryDto } from './dto/list-job-results-query.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobsService } from './jobs.service';

const uploadDestination = join(process.cwd(), 'storage', 'uploads');

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('import')
  @ApiOperation({
    summary:
      'Upload a spreadsheet (.csv/.xlsx/.xls/.xlsm/.xlsb/.xltx/.xltm) and create an async import job',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: JobResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          mkdirSync(uploadDestination, { recursive: true });
          callback(null, uploadDestination);
        },
        filename: (_req, file, callback) => {
          const extension = extname(file.originalname) || '.csv';
          callback(null, `${Date.now()}-${randomUUID()}${extension}`);
        },
      }),
    }),
  )
  importCsv(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.jobsService.importCsv(file, user);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs for current user (or all jobs for admin)' })
  listJobs(@Query() query: ListJobsQueryDto, @CurrentUser() user: AuthUser) {
    return this.jobsService.listJobs(query, user);
  }

  @Get('metrics/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Get observability metrics for jobs (status counts, row failure ratio and latency percentiles)',
  })
  @ApiOkResponse({ type: JobMetricsOverviewDto })
  getMetricsOverview(
    @Query() query: JobMetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobsService.getMetricsOverview(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details for a single job' })
  @ApiOkResponse({ type: JobResponseDto })
  getJob(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobsService.getJobById(id, user);
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get paginated row-level result items for a job' })
  @ApiOkResponse({ type: JobResultItemResponseDto, isArray: true })
  getResults(
    @Param('id') id: string,
    @Query() query: ListJobResultsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobsService.getJobResults(id, query, user);
  }

  @Post(':id/retry')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retry a failed or partially completed job (admin only)' })
  retry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobsService.retryJob(id, user);
  }

  @Get(':id/download-summary')
  @ApiOperation({ summary: 'Download a JSON summary for a job' })
  downloadSummary(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobsService.getJobSummary(id, user);
  }
}
