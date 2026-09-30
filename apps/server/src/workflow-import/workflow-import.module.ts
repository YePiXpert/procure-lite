import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowImportController } from './workflow-import.controller';
import { WorkflowImportService } from './workflow-import.service';

@Module({
  imports: [ImportsModule, WorkflowModule],
  controllers: [WorkflowImportController],
  providers: [WorkflowImportService],
})
export class WorkflowImportModule {}
