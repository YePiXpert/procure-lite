import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { ItemsModule } from './items/items.module';
import { ImportsModule } from './imports/imports.module';
import { DistributionsModule } from './distributions/distributions.module';
import { InventoryModule } from './inventory/inventory.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ReportsModule } from './reports/reports.module';
import { SystemModule } from './system/system.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AiCoreModule } from './ai/ai-core.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health.controller';
import { WorkflowModule } from './workflow/workflow.module';
import { WorkflowImportModule } from './workflow-import/workflow-import.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AiCoreModule,
    AuthModule,
    ItemsModule,
    ImportsModule,
    DistributionsModule,
    InventoryModule,
    SuppliersModule,
    ReportsModule,
    SystemModule,
    AttachmentsModule,
    WorkflowModule,
    WorkflowImportModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
