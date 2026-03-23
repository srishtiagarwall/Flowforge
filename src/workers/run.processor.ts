import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WORKFLOW_RUNS_QUEUE, RunJobData } from '../common/queue/constants';
import { RunsService } from '../runs/runs.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { ExecutionService } from '../execution/execution.service';
import { RunStatus } from '../runs/workflow-run.entity';

@Processor(WORKFLOW_RUNS_QUEUE)
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly compilerService: CompilerService,
    private readonly executionService: ExecutionService,
  ) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    const { runId, definition, input } = job.data;
    this.logger.log(`Processing run ${runId}`);

    await this.runsService.updateStatus(runId, RunStatus.RUNNING);

    try {
      const graph = this.compilerService.compile(definition);
      this.logger.log(
        `Compiled workflow: ${graph.entryNodes.length} entry nodes, ${graph.nodes.size} total nodes`,
      );

      const { finalState, totalTokens } = await this.executionService.execute(
        graph,
        input,
        runId,
      );

      await this.runsService.updateStatus(
        runId,
        RunStatus.DONE,
        finalState,
        totalTokens,
      );
      this.logger.log(`Run ${runId} completed (tokens: ${totalTokens})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId} failed: ${errorMsg}`);
      await this.runsService.updateStatus(runId, RunStatus.FAILED, {
        error: errorMsg,
      });
      throw err; // re-throw so BullMQ triggers retries
    }
  }
}
