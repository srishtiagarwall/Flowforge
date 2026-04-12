import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from './workflow.entity';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { CompilerService } from './compiler/compiler.service';
import { ConditionEvaluatorService } from '../execution/conditions/condition-evaluator.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workflow])],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, CompilerService, ConditionEvaluatorService],
  exports: [WorkflowsService, CompilerService, ConditionEvaluatorService],
})
export class WorkflowsModule {}
