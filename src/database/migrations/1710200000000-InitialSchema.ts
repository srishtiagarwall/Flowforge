import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710200000000 implements MigrationInterface {
  name = 'InitialSchema1710200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_plan_enum" AS ENUM('free', 'pro')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workflows_status_enum" AS ENUM('active', 'draft')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workflow_runs_status_enum" AS ENUM('queued', 'running', 'done', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "api_key" character varying NOT NULL,
        "plan" "public"."tenants_plan_enum" NOT NULL DEFAULT 'free',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tenants_api_key" UNIQUE ("api_key"),
        CONSTRAINT "PK_tenants_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workflows" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "definition" jsonb NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "status" "public"."workflows_status_enum" NOT NULL DEFAULT 'draft',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_workflows_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workflow_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workflow_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "status" "public"."workflow_runs_status_enum" NOT NULL DEFAULT 'queued',
        "input" jsonb,
        "output" jsonb,
        "artifacts" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "started_at" TIMESTAMPTZ,
        "ended_at" TIMESTAMPTZ,
        "total_tokens" integer NOT NULL DEFAULT 0,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "webhook_status" integer,
        "webhook_last_attempt_at" TIMESTAMPTZ,
        CONSTRAINT "PK_workflow_runs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "step_traces" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL,
        "step_name" character varying NOT NULL,
        "input_snapshot" jsonb,
        "output_snapshot" jsonb,
        "latency_ms" integer NOT NULL DEFAULT 0,
        "tokens_used" integer NOT NULL DEFAULT 0,
        "error" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_step_traces_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" ADD CONSTRAINT "FK_workflow_runs_workflow" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" ADD CONSTRAINT "FK_workflow_runs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "step_traces" ADD CONSTRAINT "FK_step_traces_run" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_workflows_tenant_id" ON "workflows" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_runs_workflow_id" ON "workflow_runs" ("workflow_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_runs_tenant_id" ON "workflow_runs" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_step_traces_run_id" ON "step_traces" ("run_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_step_traces_run_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_workflow_runs_tenant_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_workflow_runs_workflow_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_workflows_tenant_id"`);
    await queryRunner.query(
      `ALTER TABLE "step_traces" DROP CONSTRAINT "FK_step_traces_run"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" DROP CONSTRAINT "FK_workflow_runs_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" DROP CONSTRAINT "FK_workflow_runs_workflow"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_workflows_tenant"`,
    );
    await queryRunner.query(`DROP TABLE "step_traces"`);
    await queryRunner.query(`DROP TABLE "workflow_runs"`);
    await queryRunner.query(`DROP TABLE "workflows"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TYPE "public"."workflow_runs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."workflows_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_plan_enum"`);
  }
}
