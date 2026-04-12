import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  RunDeadLetterJobData,
  RunJobData,
  WORKFLOW_RUNS_QUEUE,
} from '../common/queue/constants';
import { ExecutionService } from '../execution/execution.service';
import { ObservabilityService } from '../observability/observability.service';
import { RunsService } from '../runs/runs.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { WorkflowDefinition } from '../workflows/compiler/workflow-definition.types';

@Processor(WORKFLOW_RUNS_QUEUE)
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly compilerService: CompilerService,
    private readonly executionService: ExecutionService,
    private readonly observabilityService: ObservabilityService,
  ) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    const { runId, workflowId, tenantId, definition, input } = job.data;
    const attemptCount = job.attemptsMade + 1;
    this.logger.log(`Processing run ${runId} (attempt ${attemptCount})`);

    await this.runsService.markRunning(runId, attemptCount);

    try {
      const graph = this.compilerService.compile(definition);
      const result = await this.executionService.execute(graph, input, runId);
      const artifacts = this.runsService.extractArtifacts(
        graph.definition,
        result.output,
      );

      await this.runsService.completeRun(
        runId,
        result.output,
        result.totalTokens,
        artifacts,
      );
      await this.dispatchWebhook(graph.definition, runId, {
        status: 'done',
        run_id: runId,
        workflow_id: workflowId,
        tenant_id: tenantId,
        output: result.output,
        total_tokens: result.totalTokens,
        artifacts,
        traces: graph.definition.webhook?.include_traces ? result.traces : undefined,
      });

      this.logger.log(`Run ${runId} completed (tokens: ${result.totalTokens})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = attemptCount >= (job.opts.attempts ?? 1);

      this.logger.error(`Run ${runId} failed: ${errorMessage}`);

      if (isFinalAttempt) {
        await this.observabilityService.writeTrace({
          run_id: runId,
          step_name: '__run__',
          input_snapshot: { attempt: attemptCount },
          output_snapshot: null,
          latency_ms: 0,
          tokens_used: 0,
          error: errorMessage,
        });
        await this.runsService.finalizeFailure(runId, errorMessage, attemptCount);
        await this.runsService.enqueueDeadLetter({
          runId,
          workflowId,
          tenantId,
          error: errorMessage,
          attemptsMade: attemptCount,
          definition,
        } satisfies RunDeadLetterJobData);
        await this.dispatchWebhook(definition as unknown as WorkflowDefinition, runId, {
          status: 'failed',
          run_id: runId,
          workflow_id: workflowId,
          tenant_id: tenantId,
          error: errorMessage,
          traces: (definition as unknown as WorkflowDefinition).webhook?.include_traces
            ? await this.observabilityService.getTraces(runId)
            : undefined,
        });
      } else {
        await this.runsService.recordAttemptFailure(
          runId,
          errorMessage,
          attemptCount,
        );
      }

      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<RunJobData>): void {
    this.logger.log(`Worker completed job ${job.id} for run ${job.data.runId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RunJobData>, error: Error): void {
    this.logger.warn(
      `Worker reported failure for run ${job?.data?.runId ?? 'unknown'}: ${error.message}`,
    );
  }

  private async dispatchWebhook(
    definition: WorkflowDefinition,
    runId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!definition.webhook?.url) {
      return;
    }

    try {
      const response = await fetch(definition.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(definition.webhook.headers ?? {}),
        },
        body: JSON.stringify(payload),
      });
      await this.runsService.recordWebhookResult(runId, response.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Webhook delivery failed for run ${runId}: ${message}`);
      await this.runsService.recordWebhookResult(runId, null);
    }
  }
}
