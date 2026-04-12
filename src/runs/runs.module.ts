import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowRun } from './workflow-run.entity';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ObservabilityModule } from '../observability/observability.module';
import {
  WORKFLOW_RUNS_DLQ,
  WORKFLOW_RUNS_QUEUE,
} from '../common/queue/constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowRun]),
    BullModule.registerQueue(
      { name: WORKFLOW_RUNS_QUEUE },
      { name: WORKFLOW_RUNS_DLQ },
    ),
    WorkflowsModule,
    ObservabilityModule,
  ],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
