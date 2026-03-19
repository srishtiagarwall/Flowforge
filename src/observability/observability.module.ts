import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StepTrace } from './step-trace.entity';
import { ObservabilityService } from './observability.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StepTrace])],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
