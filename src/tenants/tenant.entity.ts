import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum TenantPlan {
  FREE = 'free',
  PRO = 'pro',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  api_key!: string;

  @Column({ type: 'enum', enum: TenantPlan, default: TenantPlan.FREE })
  plan!: TenantPlan;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
