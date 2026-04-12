import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { CompiledGraph } from '../workflows/compiler/compiler.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { ObservabilityService } from '../observability/observability.service';
import { LLMFactoryService } from './llm/llm-factory.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ConditionEvaluatorService } from './conditions/condition-evaluator.service';
import {
  ConditionWorkflowNode,
  WorkflowNode,
} from '../workflows/compiler/workflow-definition.types';

interface TraceRecord {
  step_name: string;
  input_snapshot: Record<string, unknown> | null;
  output_snapshot: Record<string, unknown> | null;
  latency_ms: number;
  tokens_used: number;
  error: string | null;
}

const ExecutionStateAnnotation = Annotation.Root({
  input: Annotation<Record<string, unknown>>({
    reducer: (_left, right) => right,
    default: () => ({}),
  }),
  values: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  traces: Annotation<TraceRecord[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  totalTokens: Annotation<number>({
    reducer: (left, right) => left + right,
    default: () => 0,
  }),
  routeTarget: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

type ExecutionState = typeof ExecutionStateAnnotation.State;

export interface ExecutionResult {
  output: Record<string, unknown>;
  totalTokens: number;
  traces: TraceRecord[];
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly compilerService: CompilerService,
    private readonly llmFactory: LLMFactoryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly observabilityService: ObservabilityService,
    private readonly conditionEvaluator: ConditionEvaluatorService,
  ) {}

  async execute(
    graph: CompiledGraph,
    input: Record<string, unknown>,
    runId: string,
  ): Promise<ExecutionResult> {
    const stateGraph = new StateGraph(ExecutionStateAnnotation) as any;

    for (const node of graph.nodes.values()) {
      stateGraph.addNode(node.id, async (state: ExecutionState) =>
        this.executeNode(node, state, runId),
      );
    }

    for (const entryNodeId of graph.entryNodes) {
      stateGraph.addEdge(START, entryNodeId);
    }

    for (const node of graph.nodes.values()) {
      if (node.type === 'condition') {
        stateGraph.addConditionalEdges(
          node.id,
          (state: ExecutionState) => state.routeTarget ?? END,
        );
      }
    }

    for (const node of graph.nodes.values()) {
      if (node.type !== 'condition' && graph.terminalNodes.includes(node.id)) {
        stateGraph.addEdge(node.id, END);
      }
    }

    for (const node of graph.nodes.values()) {
      if ((node.depends_on?.length ?? 0) > 1) {
        stateGraph.addEdge(node.depends_on!, node.id);
        continue;
      }
      for (const dep of node.depends_on ?? []) {
        stateGraph.addEdge(dep, node.id);
      }
    }

    const executable = stateGraph.compile();
    const result = await executable.invoke({
      input,
      values: {},
      traces: [],
      totalTokens: 0,
      routeTarget: null,
    });

    return {
      output: result.values,
      totalTokens: result.totalTokens,
      traces: result.traces,
    };
  }

  private async executeNode(
    node: WorkflowNode,
    state: ExecutionState,
    runId: string,
  ): Promise<Partial<ExecutionState>> {
    const scope = this.getTemplateScope(state);
    const startedAt = Date.now();
    let tokensUsed = 0;
    let outputSnapshot: Record<string, unknown> = {};
    let inputSnapshot: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;
    let partialState: Partial<ExecutionState> = {};

    try {
      switch (node.type) {
        case 'llm': {
          const prompt = this.compilerService.resolveTemplate(node.prompt, scope);
          inputSnapshot = { prompt, model: node.model };

          const adapter = this.llmFactory.getAdapter(node.model);
          const response = await adapter.call(node.model, prompt);
          tokensUsed = response.tokens;
          outputSnapshot = {
            result: response.text,
            model: node.model,
            tokens: response.tokens,
          };
          partialState = {
            values: { [node.output_key]: response.text },
            totalTokens: tokensUsed,
            routeTarget: null,
          };
          break;
        }
        case 'tool': {
          const params = (this.compilerService.resolveValue(
            node.params ?? {},
            scope,
          ) ?? {}) as Record<string, unknown>;
          inputSnapshot = { params, tool: node.tool };
          const result = await this.toolRegistry.execute(node.tool, params, scope);
          outputSnapshot = { result, tool: node.tool };
          partialState = {
            values: node.output_key ? { [node.output_key]: result } : {},
            routeTarget: null,
          };
          break;
        }
        case 'condition': {
          const routeTarget = this.resolveConditionRoute(node, scope);
          inputSnapshot = { branches: node.branches };
          outputSnapshot = { routeTarget };
          partialState = { routeTarget };
          break;
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Node "${node.id}" failed: ${errorMessage}`);
    }

    const trace = {
      step_name: node.id,
      input_snapshot: inputSnapshot,
      output_snapshot: outputSnapshot,
      latency_ms: Date.now() - startedAt,
      tokens_used: tokensUsed,
      error: errorMessage,
    };

    await this.observabilityService.writeTrace({
      run_id: runId,
      ...trace,
    });

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return {
      ...partialState,
      traces: [trace],
    };
  }

  private resolveConditionRoute(
    node: ConditionWorkflowNode,
    scope: Record<string, unknown>,
  ): string | null {
    for (const [branchName, branch] of Object.entries(node.branches)) {
      if (this.conditionEvaluator.evaluate(branch.condition, scope)) {
        this.logger.log(
          `Condition node "${node.id}": branch "${branchName}" matched`,
        );
        return branch.next;
      }
    }

    this.logger.warn(`Condition node "${node.id}": no branch matched`);
    return null;
  }

  private getTemplateScope(state: ExecutionState): Record<string, unknown> {
    return {
      input: state.input,
      ...state.values,
    };
  }
}
