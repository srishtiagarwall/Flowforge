import { IsString, IsObject, IsOptional, IsEnum } from 'class-validator';
import { WorkflowStatus } from '../workflow.entity';

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsObject()
  definition!: Record<string, unknown>;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;
}
