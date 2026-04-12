import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '../tenant.entity';

export class CreateTenantDto {
  @ApiProperty({ example: 'Demo Tenant' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: TenantPlan, example: TenantPlan.PRO })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}
