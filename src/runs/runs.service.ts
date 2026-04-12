import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import {
  RunDeadLetterJobData,
  RunJobData,
  WORKFLOW_RUNS_DLQ,
  WORKFLOW_RUNS_QUEUE,
} from '../common/queue/constants';
import { WorkflowDefinition } from '../workflows/compiler/workflow-definition.types';
import { WorkflowsService } from '../workflows/workflows.service';
import { RunStatus, WorkflowRun } from './workflow-run.entity';

const IDEMPOTENCY_TTL = 86400;

@Injectable()
export class RunsService {
  private readonly redis: Redis;
  private readonly runAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    @InjectRepository(WorkflowRun)
    private readonly repo: Repository<WorkflowRun>,
    @InjectQueue(WORKFLOW_RUNS_QUEUE)
    private readonly runQueue: Queue<RunJobData>,
    @InjectQueue(WORKFLOW_RUNS_DLQ)
    private readonly deadLetterQueue: Queue<RunDeadLetterJobData>,
    private readonly workflowsService: WorkflowsService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.runAttempts = config.get<number>('RUN_ATTEMPTS', 3);
    this.retryDelayMs = config.get<number>('RUN_RETRY_DELAY_MS', 3000);
  }

  async trigger(
    tenantId: string,
    workflowId: string,
    input: Record<string, unknown> | undefined,
    idempotencyKey: string | undefined,
  ): Promise<WorkflowRun> {
    const workflow = await this.workflowsService.findOne(tenantId, workflowId);

    if (idempotencyKey) {
      const idemKey = `idem:${tenantId}:${idempotencyKey}`;
      const set = await this.redis.set(idemKey, '1', 'EX', IDEMPOTENCY_TTL, 'NX');
      if (!set) {
        throw new ConflictException(
          `Duplicate request: idempotency key "${idempotencyKey}" already used`,
        );
      }
    }

    const run = this.repo.create({
      workflow_id: workflowId,
      tenant_id: tenantId,
      status: RunStatus.QUEUED,
      input: input ?? null,
      artifacts: null,
    });
    const saved = await this.repo.save(run);

    await this.runQueue.add(
      'execute',
      {
        runId: saved.id,
        workflowId,
        tenantId,
        input: input ?? {},
        definition: workflow.definition,
      },
      {
        attempts: this.runAttempts,
        backoff: { type: 'exponential', delay: this.retryDelayMs },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    return saved;
  }

  async findOne(tenantId: string, runId: string): Promise<WorkflowRun> {
    const run = await this.repo.findOne({
      where: { id: runId, tenant_id: tenantId },
    });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    return run;
  }

  async findByWorkflow(
    tenantId: string,
    workflowId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: WorkflowRun[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { workflow_id: workflowId, tenant_id: tenantId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async markRunning(runId: string, attemptCount: number): Promise<void> {
    await this.repo.update(runId, {
      status: RunStatus.RUNNING,
      started_at: new Date(),
      attempt_count: attemptCount,
      last_error: null,
    });
  }

  async completeRun(
    runId: string,
    output: Record<string, unknown>,
    totalTokens: number,
    artifacts: Array<Record<string, unknown>>,
  ): Promise<void> {
    await this.repo.update(runId, {
      status: RunStatus.DONE,
      output: output as any,
      total_tokens: totalTokens,
      artifacts: artifacts as any,
      ended_at: new Date(),
    });
  }

  async recordAttemptFailure(
    runId: string,
    errorMessage: string,
    attemptCount: number,
  ): Promise<void> {
    await this.repo.update(runId, {
      status: RunStatus.RUNNING,
      attempt_count: attemptCount,
      last_error: errorMessage,
    });
  }

  async finalizeFailure(
    runId: string,
    errorMessage: string,
    attemptCount: number,
  ): Promise<void> {
    await this.repo.update(runId, {
      status: RunStatus.FAILED,
      ended_at: new Date(),
      attempt_count: attemptCount,
      last_error: errorMessage,
      output: { error: errorMessage } as any,
    });
  }

  async enqueueDeadLetter(data: RunDeadLetterJobData): Promise<void> {
    await this.deadLetterQueue.add('dead-letter', data, {
      removeOnComplete: 500,
      removeOnFail: 500,
    });
  }

  async recordWebhookResult(
    runId: string,
    statusCode: number | null,
  ): Promise<void> {
    await this.repo.update(runId, {
      webhook_status: statusCode,
      webhook_last_attempt_at: new Date(),
    });
  }

  extractArtifacts(
    definition: WorkflowDefinition,
    output: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const artifactKeys = definition.artifact_keys ?? [];
    return artifactKeys
      .filter((key) => output[key] !== undefined)
      .map((key) => ({
        key,
        value: output[key],
      }));
  }
}
