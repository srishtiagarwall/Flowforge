import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RunsService } from './runs.service';
import { TriggerRunDto } from './dto/trigger-run.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { ObservabilityService } from '../observability/observability.service';

@Controller()
@UseGuards(TenantAuthGuard)
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Post('workflows/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(
    @CurrentTenant() tenant: Tenant,
    @Param('id') workflowId: string,
    @Body() dto: TriggerRunDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const run = await this.runsService.trigger(
      tenant.id,
      workflowId,
      dto.input,
      dto.idempotency_key || idempotencyKey,
    );
    return { run_id: run.id, status: run.status };
  }

  @Get('runs/:runId')
  async getStatus(
    @CurrentTenant() tenant: Tenant,
    @Param('runId') runId: string,
  ) {
    const run = await this.runsService.findOne(tenant.id, runId);
    return {
      id: run.id,
      status: run.status,
      output: run.output,
      total_tokens: run.total_tokens,
      started_at: run.started_at,
      ended_at: run.ended_at,
    };
  }

  @Get('runs/:runId/traces')
  async getTraces(
    @CurrentTenant() tenant: Tenant,
    @Param('runId') runId: string,
  ) {
    // Verify the run belongs to this tenant
    await this.runsService.findOne(tenant.id, runId);
    return this.observabilityService.getTraces(runId);
  }

  @Get('workflows/:id/runs')
  async getRunHistory(
    @CurrentTenant() tenant: Tenant,
    @Param('id') workflowId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.runsService.findByWorkflow(
      tenant.id,
      workflowId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
