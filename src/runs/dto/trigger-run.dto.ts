import { IsObject, IsOptional, IsString } from 'class-validator';

export class TriggerRunDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
