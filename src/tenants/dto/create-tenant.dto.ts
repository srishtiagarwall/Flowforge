import { IsString, IsOptional, IsEnum } from 'class-validator';
import { TenantPlan } from '../tenant.entity';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}
