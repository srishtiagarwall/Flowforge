import { ConditionEvaluatorService } from '../../execution/conditions/condition-evaluator.service';
import { CompilerService } from './compiler.service';

describe('CompilerService', () => {
  const service = new CompilerService(new ConditionEvaluatorService());

  it('compiles a valid workflow definition', () => {
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
});
