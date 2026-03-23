export interface LLMResponse {
  text: string;
  tokens: number;
}

export interface LLMAdapter {
  call(model: string, prompt: string): Promise<LLMResponse>;
}
