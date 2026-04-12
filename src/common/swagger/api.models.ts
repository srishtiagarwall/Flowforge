import { ApiProperty } from '@nestjs/swagger';
import { RunStatus } from '../../runs/workflow-run.entity';
import { TenantPlan } from '../../tenants/tenant.entity';
import { WorkflowStatus } from '../../workflows/workflow.entity';

export class TenantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  api_key!: string;

  @ApiProperty({ enum: TenantPlan })
  plan!: TenantPlan;

  @ApiProperty()
  created_at!: string;
}

export class WorkflowResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenant_id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  definition!: Record<string, unknown>;

  @ApiProperty()
  version!: number;

  @ApiProperty({ enum: WorkflowStatus })
  status!: WorkflowStatus;

  @ApiProperty()
  created_at!: string;

  @ApiProperty()
  updated_at!: string;
}

export class TriggerRunResponseDto {
  @ApiProperty()
  run_id!: string;

  @ApiProperty({ enum: RunStatus })
  status!: RunStatus;
}

export class RunStatusResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: RunStatus })
  status!: RunStatus;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  output!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    nullable: true,
  })
  artifacts!: Array<Record<string, unknown>> | null;

  @ApiProperty()
  total_tokens!: number;

  @ApiProperty()
  attempt_count!: number;

  @ApiProperty({ nullable: true })
  last_error!: string | null;

  @ApiProperty({ nullable: true })
  webhook_status!: number | null;

  @ApiProperty({ nullable: true })
  started_at!: Date | null;

  @ApiProperty({ nullable: true })
  ended_at!: Date | null;
}

export class StepTraceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  run_id!: string;

  @ApiProperty()
  step_name!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  input_snapshot!: Record<string, unknown> | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  output_snapshot!: Record<string, unknown> | null;

  @ApiProperty()
  latency_ms!: number;

  @ApiProperty()
  tokens_used!: number;

  @ApiProperty({ nullable: true })
  error!: string | null;

  @ApiProperty()
  created_at!: string;
}

export class RunHistoryResponseDto {
  @ApiProperty({ type: [RunStatusResponseDto] })
  data!: RunStatusResponseDto[];

  @ApiProperty()
  total!: number;
}
