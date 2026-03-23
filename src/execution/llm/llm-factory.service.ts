import { Injectable } from '@nestjs/common';
import { LLMAdapter } from './llm-adapter.interface';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';

@Injectable()
export class LLMFactoryService {
  constructor(
    private readonly openai: OpenAIAdapter,
    private readonly anthropic: AnthropicAdapter,
    private readonly gemini: GeminiAdapter,
  ) {}

  getAdapter(model: string): LLMAdapter {
    if (
      model.startsWith('gpt-') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    ) {
      return this.openai;
    }
    if (model.startsWith('claude-')) {
      return this.anthropic;
    }
    if (model.startsWith('gemini-')) {
      return this.gemini;
    }
    throw new Error(
      `Unsupported model "${model}". Prefix must be gpt-, o1/o3/o4, claude-, or gemini-`,
    );
  }
}
