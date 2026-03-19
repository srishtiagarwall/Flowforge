import { IsString, IsObject, IsOptional, IsEnum } from 'class-validator';
import { WorkflowStatus } from '../workflow.entity';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;
}
