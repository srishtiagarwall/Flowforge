import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { WorkflowRun, RunStatus } from './workflow-run.entity';
import { WorkflowsService } from '../workflows/workflows.service';
import { WORKFLOW_RUNS_QUEUE, RunJobData } from '../common/queue/constants';
import { ConfigService } from '@nestjs/config';

const IDEMPOTENCY_TTL = 86400; // 24 hours

@Injectable()
export class RunsService {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(WorkflowRun)
    private readonly repo: Repository<WorkflowRun>,
    @InjectQueue(WORKFLOW_RUNS_QUEUE)
    private readonly runQueue: Queue<RunJobData>,
    private readonly workflowsService: WorkflowsService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
    });
  }

  async trigger(
    tenantId: string,
    workflowId: string,
    input: Record<string, unknown> | undefined,
    idempotencyKey: string | undefined,
  ): Promise<WorkflowRun> {
    // Validate workflow exists and belongs to tenant
    const workflow = await this.workflowsService.findOne(tenantId, workflowId);

    // Idempotency check
    if (idempotencyKey) {
      const idemKey = `idem:${tenantId}:${idempotencyKey}`;
      const set = await this.redis.set(idemKey, '1', 'EX', IDEMPOTENCY_TTL, 'NX');
      if (!set) {
        throw new ConflictException(
          `Duplicate request: idempotency key "${idempotencyKey}" already used`,
        );
      }
    }

    // Create run record
    const run = this.repo.create({
      workflow_id: workflowId,
      tenant_id: tenantId,
      status: RunStatus.QUEUED,
      input: input || null,
    });
    const saved = await this.repo.save(run);

    // Enqueue job
    await this.runQueue.add(
      'execute',
      {
        runId: saved.id,
        workflowId,
        tenantId,
        input: input || {},
        definition: workflow.definition,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
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

  async updateStatus(
    runId: string,
    status: RunStatus,
    output?: Record<string, unknown>,
    totalTokens?: number,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (status === RunStatus.RUNNING) {
      update.started_at = new Date();
    }
    if (status === RunStatus.DONE || status === RunStatus.FAILED) {
      update.ended_at = new Date();
    }
    if (output !== undefined) {
      update.output = output;
    }
    if (totalTokens !== undefined) {
      update.total_tokens = totalTokens;
    }

    await this.repo.update(runId, update);
  }
}
