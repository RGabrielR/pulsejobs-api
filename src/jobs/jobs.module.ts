import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { JobsController } from './jobs.controller';
import { JobsProcessorService } from './jobs.processor.service';
import { JobsService } from './jobs.service';
import { CanonicalMappingService } from './services/canonical-mapping.service';
import { HeaderDetectionService } from './services/header-detection.service';
import { HeaderNormalizationService } from './services/header-normalization.service';
import { SpreadsheetImportProcessorService } from './services/spreadsheet-import-processor.service';
import { SpreadsheetReaderService } from './services/spreadsheet-reader.service';

@Module({
  imports: [UploadsModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsProcessorService,
    SpreadsheetReaderService,
    HeaderDetectionService,
    HeaderNormalizationService,
    CanonicalMappingService,
    SpreadsheetImportProcessorService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
