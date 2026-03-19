import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Workflow } from '../workflows/workflow.entity';

export enum RunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
}

@Entity('workflow_runs')
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  workflow_id!: string;

  @ManyToOne(() => Workflow)
  @JoinColumn({ name: 'workflow_id' })
  workflow!: Workflow;

  @Column()
  tenant_id!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'enum', enum: RunStatus, default: RunStatus.QUEUED })
  status!: RunStatus;

  @Column({ type: 'jsonb', nullable: true })
  input!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at!: Date | null;

  @Column({ default: 0 })
  total_tokens!: number;
}
