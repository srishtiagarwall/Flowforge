import { ConfigService } from '@nestjs/config';
import { ConditionEvaluatorService } from '../../execution/conditions/condition-evaluator.service';
import { CompilerService } from './compiler.service';

describe('CompilerService', () => {
  const createService = (overrides: Record<string, string> = {}) =>
    new CompilerService(
      new ConditionEvaluatorService(),
      new ConfigService({
        OPENAI_API_KEY: 'test-openai-key',
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        GEMINI_API_KEY: 'test-gemini-key',
        ...overrides,
      }),
    );

  it('compiles a valid workflow definition', () => {
    const service = createService();
    const compiled = service.compile({
      id: 'wf_1',
      name: 'Lead qualification',
      trigger: 'api',
      nodes: [
        {
          id: 'draft',
          type: 'llm',
          model: 'gpt-4o-mini',
          prompt: 'Summarize {{input.text}}',
          output_key: 'summary',
        },
        {
          id: 'decide',
          type: 'condition',
          depends_on: ['draft'],
          branches: {
            ok: {
              condition: 'summary != ""',
              next: 'notify',
            },
          },
        },
        {
          id: 'notify',
          type: 'tool',
          tool: 'log',
        },
      ],
    });

    expect(compiled.entryNodes).toEqual(['draft']);
    expect(compiled.terminalNodes).toEqual(['notify']);
  });

  it('rejects duplicate output keys', () => {
    const service = createService();
    expect(() =>
      service.compile({
        id: 'wf_1',
        name: 'Bad workflow',
        trigger: 'api',
        nodes: [
          {
            id: 'a',
            type: 'llm',
            model: 'gpt-4o-mini',
            prompt: 'A',
            output_key: 'dup',
          },
          {
            id: 'b',
            type: 'tool',
            tool: 'log',
            output_key: 'dup',
          },
        ],
      }),
    ).toThrow('Duplicate output_key');
  });

  it('rejects llm nodes when the provider key is not configured', () => {
    const service = createService({ OPENAI_API_KEY: '' });

    expect(() =>
      service.compile({
        id: 'wf_missing_key',
        name: 'Missing provider key',
        trigger: 'api',
        nodes: [
          {
            id: 'draft',
            type: 'llm',
            model: 'gpt-4o-mini',
            prompt: 'Summarize {{input.text}}',
            output_key: 'summary',
          },
        ],
      }),
    ).toThrow('OPENAI_API_KEY is not configured');
  });
});
