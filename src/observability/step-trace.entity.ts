import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { WorkflowRun } from '../runs/workflow-run.entity';

@Entity('step_traces')
export class StepTrace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  run_id!: string;

  @ManyToOne(() => WorkflowRun)
  @JoinColumn({ name: 'run_id' })
  run!: WorkflowRun;

  @Column()
  step_name!: string;

  @Column({ type: 'jsonb', nullable: true })
  input_snapshot!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  output_snapshot!: Record<string, unknown> | null;

  @Column({ default: 0 })
  latency_ms!: number;

  @Column({ default: 0 })
  tokens_used!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
