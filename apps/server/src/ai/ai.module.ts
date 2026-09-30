import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ReportsModule } from '../reports/reports.module';
import { DistributionsModule } from '../distributions/distributions.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ImportsModule } from '../imports/imports.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiToolsService } from './ai-tools';

@Module({
  imports: [ItemsModule, InventoryModule, SuppliersModule, ReportsModule, DistributionsModule, ImportsModule, WorkflowModule],
  controllers: [AiController],
  providers: [AiService, AiToolsService],
})
export class AiModule {}
