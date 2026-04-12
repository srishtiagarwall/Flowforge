import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { StepTrace } from '../observability/step-trace.entity';
import { WorkflowRun } from '../runs/workflow-run.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Workflow } from '../workflows/workflow.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'flowforge',
  entities: [Tenant, Workflow, WorkflowRun, StepTrace],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});

export default dataSource;
