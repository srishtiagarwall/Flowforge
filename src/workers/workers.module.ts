import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RunProcessor } from './run.processor';
import { RunsModule } from '../runs/runs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ObservabilityModule } from '../observability/observability.module';
import { WORKFLOW_RUNS_QUEUE } from '../common/queue/constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: WORKFLOW_RUNS_QUEUE }),
    RunsModule,
    WorkflowsModule,
    ObservabilityModule,
  ],
  providers: [RunProcessor],
})
export class WorkersModule {}
