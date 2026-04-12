import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantResponseDto } from '../common/swagger/api.models';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant and generate its API key' })
  @ApiCreatedResponse({ type: TenantResponseDto })
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }
}
