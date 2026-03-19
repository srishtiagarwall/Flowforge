import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StepTrace } from './step-trace.entity';

@Injectable()
export class ObservabilityService {
  constructor(
    @InjectRepository(StepTrace)
    private readonly repo: Repository<StepTrace>,
  ) {}

  async writeTrace(data: {
    run_id: string;
    step_name: string;
    input_snapshot: Record<string, unknown> | null;
    output_snapshot: Record<string, unknown> | null;
    latency_ms: number;
    tokens_used: number;
    error: string | null;
  }): Promise<StepTrace> {
    const trace = this.repo.create(data);
    return this.repo.save(trace);
  }

  async getTraces(runId: string): Promise<StepTrace[]> {
    return this.repo.find({
      where: { run_id: runId },
      order: { created_at: 'ASC' },
    });
  }
}
