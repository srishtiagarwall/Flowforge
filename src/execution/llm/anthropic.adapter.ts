import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LLMAdapter, LLMResponse } from './llm-adapter.interface';

@Injectable()
export class AnthropicAdapter implements LLMAdapter {
  private readonly logger = new Logger(AnthropicAdapter.name);
  private readonly client: Anthropic | null = null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — Anthropic adapter unavailable');
    }
  }

  async call(model: string, prompt: string): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const message = await this.client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      tokens: message.usage.input_tokens + message.usage.output_tokens,
    };
  }
}
