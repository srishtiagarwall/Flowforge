import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMAdapter, LLMResponse } from './llm-adapter.interface';

@Injectable()
export class GeminiAdapter implements LLMAdapter {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly client: GoogleGenerativeAI | null = null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — Gemini adapter unavailable');
    }
  }

  async call(model: string, prompt: string): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const genModel = this.client.getGenerativeModel({ model });
    const result = await genModel.generateContent(prompt);
    const response = result.response;

    return {
      text: response.text(),
      tokens: response.usageMetadata?.totalTokenCount ?? 0,
    };
  }
}
