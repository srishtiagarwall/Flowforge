import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerRunDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { lead: 'ACME Corp wants pricing for 200 seats' },
  })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'demo-run-1' })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
