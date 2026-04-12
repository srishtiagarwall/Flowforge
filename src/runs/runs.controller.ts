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
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RunsService } from './runs.service';
import { TriggerRunDto } from './dto/trigger-run.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { ObservabilityService } from '../observability/observability.service';
import {
  RunHistoryResponseDto,
  RunStatusResponseDto,
  StepTraceResponseDto,
  TriggerRunResponseDto,
} from '../common/swagger/api.models';

@ApiTags('Runs')
@ApiHeader({
  name: 'x-api-key',
  description: 'Tenant API key',
  required: true,
})
@Controller()
@UseGuards(TenantAuthGuard)
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Post('workflows/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger asynchronous workflow execution' })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Optional deduplication key',
    required: false,
  })
  @ApiAcceptedResponse({ type: TriggerRunResponseDto })
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
  @ApiOperation({ summary: 'Get run status and output' })
  @ApiOkResponse({ type: RunStatusResponseDto })
  async getStatus(
    @CurrentTenant() tenant: Tenant,
    @Param('runId') runId: string,
  ) {
    const run = await this.runsService.findOne(tenant.id, runId);
    return {
      id: run.id,
      status: run.status,
      output: run.output,
      artifacts: run.artifacts,
      total_tokens: run.total_tokens,
      attempt_count: run.attempt_count,
      last_error: run.last_error,
      webhook_status: run.webhook_status,
      started_at: run.started_at,
      ended_at: run.ended_at,
    };
  }

  @Get('runs/:runId/traces')
  @ApiOperation({ summary: 'Get ordered step traces for a run' })
  @ApiOkResponse({ type: StepTraceResponseDto, isArray: true })
  async getTraces(
    @CurrentTenant() tenant: Tenant,
    @Param('runId') runId: string,
  ) {
    // Verify the run belongs to this tenant
    await this.runsService.findOne(tenant.id, runId);
    return this.observabilityService.getTraces(runId);
  }

  @Get('workflows/:id/runs')
  @ApiOperation({ summary: 'Get paginated run history for a workflow' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ type: RunHistoryResponseDto })
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
