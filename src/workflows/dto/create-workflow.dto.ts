import { IsString, IsObject, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus } from '../workflow.entity';

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Lead Qualification' })
  @IsString()
  name!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      id: 'wf_lead_qualify_v1',
      name: 'Lead qualification workflow',
      trigger: 'api',
      nodes: [
        {
          id: 'score_lead',
          type: 'llm',
          model: 'gemini-2.5-flash',
          prompt: 'Score this lead: {{input.lead}}',
          output_key: 'score',
        },
      ],
    },
  })
  @IsObject()
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: WorkflowStatus, example: WorkflowStatus.ACTIVE })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;
}
