import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { WORKFLOW_RUNS_DLQ, WORKFLOW_RUNS_QUEUE } from '../common/queue/constants';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { ConditionEvaluatorService } from '../execution/conditions/condition-evaluator.service';
import { ObservabilityService } from '../observability/observability.service';
import { StepTrace } from '../observability/step-trace.entity';
import { RunsController } from '../runs/runs.controller';
import { RunsService } from '../runs/runs.service';
import { WorkflowRun } from '../runs/workflow-run.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { Workflow } from '../workflows/workflow.entity';
import { WorkflowsController } from '../workflows/workflows.controller';
import { WorkflowsService } from '../workflows/workflows.service';

describe('App integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const runQueue = { add: jest.fn() };
  const deadLetterQueue = { add: jest.fn() };

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.registerExtension('pgcrypto', () => undefined);
    db.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'flowforge_test',
    });
    db.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });

    dataSource = await db.adapters
      .createTypeormDataSource({
        type: 'postgres',
        entities: [Tenant, Workflow, WorkflowRun, StepTrace],
        synchronize: true,
      })
      .initialize();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController, WorkflowsController, RunsController],
      providers: [
        TenantsService,
        WorkflowsService,
        RunsService,
        ObservabilityService,
        CompilerService,
        ConditionEvaluatorService,
        TenantAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              if (key === 'OPENAI_API_KEY') {
                return 'test-openai-key';
              }
              return defaultValue;
            },
          },
        },
        {
          provide: getRepositoryToken(Tenant),
          useFactory: () => dataSource.getRepository(Tenant),
        },
        {
          provide: getRepositoryToken(Workflow),
          useFactory: () => dataSource.getRepository(Workflow),
        },
        {
          provide: getRepositoryToken(WorkflowRun),
          useFactory: () => dataSource.getRepository(WorkflowRun),
        },
        {
          provide: getRepositoryToken(StepTrace),
          useFactory: () => dataSource.getRepository(StepTrace),
        },
        {
          provide: getQueueToken(WORKFLOW_RUNS_QUEUE),
          useValue: runQueue,
        },
        {
          provide: getQueueToken(WORKFLOW_RUNS_DLQ),
          useValue: deadLetterQueue,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    runQueue.add.mockClear();
    deadLetterQueue.add.mockClear();
  });

  it('creates a tenant, creates a workflow, and queues a run', async () => {
    const tenantResponse = await request(app.getHttpServer())
      .post('/tenants')
      .send({ name: 'Demo Tenant', plan: 'pro' })
      .expect(201);

    const apiKey = tenantResponse.body.api_key as string;
    expect(apiKey).toMatch(/^ff_/);

    const workflowResponse = await request(app.getHttpServer())
      .post('/workflows')
      .set('x-api-key', apiKey)
      .send({
        name: 'Lead Qualification',
        status: 'active',
        definition: {
          id: 'wf_lead_qualify_v1',
          name: 'Lead qualification workflow',
          trigger: 'api',
          nodes: [
            {
              id: 'score_lead',
              type: 'llm',
              model: 'gpt-4o-mini',
              prompt: 'Score {{input.lead}}',
              output_key: 'score',
            },
          ],
        },
      })
      .expect(201);

    const workflowId = workflowResponse.body.id as string;

    const runResponse = await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/run`)
      .set('x-api-key', apiKey)
      .send({
        input: {
          lead: 'ACME Corp wants a quote',
        },
      })
      .expect(202);

    expect(runResponse.body.status).toBe('queued');
    expect(runQueue.add).toHaveBeenCalledTimes(1);
    expect(runQueue.add.mock.calls[0][1]).toMatchObject({
      workflowId,
      input: {
        lead: 'ACME Corp wants a quote',
      },
    });

    const statusResponse = await request(app.getHttpServer())
      .get(`/runs/${runResponse.body.run_id}`)
      .set('x-api-key', apiKey)
      .expect(200);

    expect(statusResponse.body.status).toBe('queued');
    expect(statusResponse.body.attempt_count).toBe(0);
  });
});
