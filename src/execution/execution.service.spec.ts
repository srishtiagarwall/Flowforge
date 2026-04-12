import { ExecutionService } from './execution.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { ConditionEvaluatorService } from './conditions/condition-evaluator.service';
import { ToolRegistryService } from './tools/tool-registry.service';

describe('ExecutionService', () => {
  it('executes a simple workflow through LangGraph', async () => {
    const conditionEvaluator = new ConditionEvaluatorService();
    const compilerService = new CompilerService(conditionEvaluator);
    const llmFactory = {
      getAdapter: () => ({
        call: async () => ({ text: '42', tokens: 3 }),
      }),
    };
    const observability = {
      writeTrace: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExecutionService(
      compilerService,
      llmFactory as never,
      new ToolRegistryService(),
      observability as never,
      conditionEvaluator,
    );

    const graph = compilerService.compile({
      id: 'wf_execution',
      name: 'Execution test',
      trigger: 'api',
      nodes: [
        {
          id: 'generate',
          type: 'llm',
          model: 'gpt-4o-mini',
          prompt: 'Value for {{input.topic}}',
          output_key: 'score',
        },
        {
          id: 'route',
          type: 'condition',
          depends_on: ['generate'],
          branches: {
            high: {
              condition: 'score >= 40',
              next: 'done',
            },
          },
        },
        {
          id: 'done',
          type: 'tool',
          tool: 'log',
          params: { message: 'done' },
          output_key: 'result',
        },
      ],
    });

    const result = await service.execute(graph, { topic: 'answer' }, 'run_1');

    expect(result.output.score).toBe('42');
    expect(result.output.result).toEqual({ logged: true, message: 'done' });
    expect(result.totalTokens).toBe(3);
  });
});
