import { Injectable, Logger } from '@nestjs/common';

export type ToolHandler = (
  params: Record<string, unknown>,
  state: Record<string, unknown>,
) => Promise<unknown>;

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly handlers = new Map<string, ToolHandler>();

  constructor() {
    this.registerDefaults();
  }

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    state: Record<string, unknown>,
  ): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(
        `Unknown tool: "${name}". Registered tools: ${[...this.handlers.keys()].join(', ')}`,
      );
    }
    return handler(params, state);
  }

  private registerDefaults(): void {
    // http_request: makes a GET or POST HTTP call
    this.handlers.set('http_request', async (params) => {
      const url = params.url as string;
      const method = ((params.method as string) || 'GET').toUpperCase();
      const body = params.body as Record<string, unknown> | undefined;

      if (!url) throw new Error('http_request requires a "url" param');

      const init: RequestInit = { method };
      if (body && method !== 'GET') {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url, init);
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      return { status: response.status, data };
    });

    // log: writes a message and returns it (useful for debugging workflows)
    this.handlers.set('log', async (params) => {
      const message = params.message ?? JSON.stringify(params);
      this.logger.log(`[tool:log] ${message}`);
      return { logged: true, message };
    });

    // format: interpolates a template string with state values
    this.handlers.set('format', async (params, state) => {
      const template = params.template as string;
      if (!template) throw new Error('format requires a "template" param');
      const result = template.replace(/\{\{([^}]+)\}\}/g, (_m, key: string) => {
        const val = (state as Record<string, unknown>)[key.trim()];
        return val !== undefined ? String(val) : `{{${key.trim()}}}`;
      });
      return { result };
    });
  }
}
