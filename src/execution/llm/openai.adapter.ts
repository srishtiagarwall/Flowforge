import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LLMAdapter, LLMResponse } from './llm-adapter.interface';

@Injectable()
export class OpenAIAdapter implements LLMAdapter {
  private readonly logger = new Logger(OpenAIAdapter.name);
  private readonly client: OpenAI | null = null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    } else {
      this.logger.warn('OPENAI_API_KEY not set — OpenAI adapter unavailable');
    }
  }

  async call(model: string, prompt: string): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const completion = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    const choice = completion.choices[0];
    return {
      text: choice.message.content ?? '',
      tokens: completion.usage?.total_tokens ?? 0,
    };
  }
}
