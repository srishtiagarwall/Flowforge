import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/tenant.entity';

@Controller('workflows')
@UseGuards(TenantAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(tenant.id, dto);
  }

  @Get()
  async findAll(@CurrentTenant() tenant: Tenant) {
    return this.workflowsService.findAll(tenant.id);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.workflowsService.findOne(tenant.id, id);
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    await this.workflowsService.softDelete(tenant.id, id);
  }
}
