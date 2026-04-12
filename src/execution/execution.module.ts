import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { LLMFactoryService } from './llm/llm-factory.service';
import { OpenAIAdapter } from './llm/openai.adapter';
import { AnthropicAdapter } from './llm/anthropic.adapter';
import { GeminiAdapter } from './llm/gemini.adapter';
import { ToolRegistryService } from './tools/tool-registry.service';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ConditionEvaluatorService } from './conditions/condition-evaluator.service';

@Module({
  imports: [WorkflowsModule],
  providers: [
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    LLMFactoryService,
    ToolRegistryService,
    ConditionEvaluatorService,
    ExecutionService,
  ],
  exports: [ExecutionService, ToolRegistryService],
})
export class ExecutionModule {}
