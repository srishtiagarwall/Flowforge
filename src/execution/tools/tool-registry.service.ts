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
    this.handlers.set('http_request', async (params) => {
      const url = params.url as string;
      const method = ((params.method as string) || 'GET').toUpperCase();
      const body = params.body as Record<string, unknown> | undefined;
      const headers = (params.headers ?? {}) as Record<string, string>;

      if (!url) {
        throw new Error('http_request requires a "url" param');
      }

      const init: RequestInit = { method, headers: { ...headers } };
      if (body && method !== 'GET') {
        init.headers = {
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string>),
        };
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url, init);
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      return { status: response.status, data };
    });

    this.handlers.set('log', async (params) => {
      const message = params.message ?? JSON.stringify(params);
      this.logger.log(`[tool:log] ${message}`);
      return { logged: true, message };
    });

    this.handlers.set('format', async (params) => {
      const template = params.template as string;
      if (!template) {
        throw new Error('format requires a "template" param');
      }
      return { result: template };
    });

    this.handlers.set('json_parse', async (params) => {
      const value = params.value as string;
      if (!value) {
        throw new Error('json_parse requires a "value" param');
      }
      return JSON.parse(value);
    });

    this.handlers.set('json_stringify', async (params) => {
      return {
        result: JSON.stringify(params.value ?? params, null, 2),
      };
    });

    this.handlers.set('pick', async (params, state) => {
      const path = params.path as string;
      if (!path) {
        throw new Error('pick requires a "path" param');
      }
      return { value: this.resolvePath(path, state) };
    });

    this.handlers.set('merge', async (params) => {
      const left = (params.left ?? {}) as Record<string, unknown>;
      const right = (params.right ?? {}) as Record<string, unknown>;
      return { result: { ...left, ...right } };
    });

    this.handlers.set('sleep', async (params) => {
      const ms = Number(params.ms ?? 0);
      if (Number.isNaN(ms) || ms < 0) {
        throw new Error('sleep requires a non-negative "ms" param');
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { slept_ms: ms };
    });

    this.handlers.set('artifact', async (params) => {
      return {
        artifact: {
          key: params.key ?? 'artifact',
          kind: params.kind ?? 'json',
          value: params.value ?? null,
          metadata: params.metadata ?? null,
        },
      };
    });

    this.handlers.set('webhook', async (params) => {
      const url = params.url as string;
      if (!url) {
        throw new Error('webhook requires a "url" param');
      }

      const response = await fetch(url, {
        method: ((params.method as string) || 'POST').toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...((params.headers ?? {}) as Record<string, string>),
        },
        body: JSON.stringify(params.body ?? {}),
      });

      return { status: response.status };
    });
  }

  private resolvePath(path: string, state: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = state;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
