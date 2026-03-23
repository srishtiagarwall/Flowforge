import { Injectable, Logger } from '@nestjs/common';
import { CompiledGraph } from '../workflows/compiler/compiler.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { ObservabilityService } from '../observability/observability.service';
import { LLMFactoryService } from './llm/llm-factory.service';
import { ToolRegistryService } from './tools/tool-registry.service';

export interface ExecutionResult {
  finalState: Record<string, unknown>;
  totalTokens: number;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly compilerService: CompilerService,
    private readonly llmFactory: LLMFactoryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async execute(
    graph: CompiledGraph,
    input: Record<string, unknown>,
    runId: string,
  ): Promise<ExecutionResult> {
    const state: Record<string, unknown> = { input };
    const executedNodes = new Set<string>();
    let totalTokens = 0;

    const executeNode = async (nodeId: string): Promise<void> => {
      if (executedNodes.has(nodeId)) return;

      const node = graph.nodes.get(nodeId)!;

      // Execute dependencies first
      if (node.depends_on) {
        for (const dep of node.depends_on) {
          if (!executedNodes.has(dep)) {
            await executeNode(dep);
          }
        }
      }

      const startTime = Date.now();
      let stepOutput: Record<string, unknown> = {};
      let stepError: string | null = null;
      let tokensUsed = 0;

      try {
        switch (node.type) {
          case 'llm': {
            const model = node.model ?? 'gpt-4o-mini';
            const resolvedPrompt = node.prompt
              ? this.compilerService.resolveTemplate(node.prompt, state)
              : '';

            const adapter = this.llmFactory.getAdapter(model);
            const response = await adapter.call(model, resolvedPrompt);

            tokensUsed = response.tokens;
            totalTokens += tokensUsed;

            stepOutput = {
              result: response.text,
              model,
              tokens: response.tokens,
            };

            if (node.output_key) {
              state[node.output_key] = response.text;
            }
            break;
          }

          case 'tool': {
            const toolName = node.tool ?? '';
            const params = node.params
              ? this.resolveParams(node.params, state)
              : {};

            const result = await this.toolRegistry.execute(toolName, params, state);

            stepOutput = { result, tool: toolName };

            if (node.output_key) {
              state[node.output_key] = result;
            }
            break;
          }

          case 'condition': {
            if (node.branches) {
              let matched = false;

              for (const [branchName, branch] of Object.entries(node.branches)) {
                if (this.evaluateCondition(branch.condition, state)) {
                  this.logger.log(
                    `Condition node "${nodeId}": branch "${branchName}" matched`,
                  );
                  stepOutput = { branch: branchName, next: branch.next };
                  if (branch.next) {
                    await executeNode(branch.next);
                  }
                  matched = true;
                  break;
                }
              }

              if (!matched) {
                this.logger.warn(
                  `Condition node "${nodeId}": no branch matched`,
                );
                stepOutput = { branch: null, message: 'No condition matched' };
              }
            }
            break;
          }
        }
      } catch (err) {
        stepError = err instanceof Error ? err.message : String(err);
        this.logger.error(`Node "${nodeId}" failed: ${stepError}`);
      }

      const latencyMs = Date.now() - startTime;

      await this.observabilityService.writeTrace({
        run_id: runId,
        step_name: nodeId,
        input_snapshot:
          node.type === 'llm'
            ? {
                prompt: node.prompt
                  ? this.compilerService.resolveTemplate(node.prompt, state)
                  : '',
              }
            : node.type === 'tool'
              ? { params: node.params ?? null }
              : { branches: node.branches ?? null },
        output_snapshot: stepOutput,
        latency_ms: latencyMs,
        tokens_used: tokensUsed,
        error: stepError,
      });

      executedNodes.add(nodeId);
    };

    // Execute from entry nodes
    for (const entryNodeId of graph.entryNodes) {
      await executeNode(entryNodeId);
    }

    // Catch any nodes not reachable from entry nodes (shouldn't happen with a valid DAG)
    for (const nodeId of graph.nodes.keys()) {
      if (!executedNodes.has(nodeId)) {
        await executeNode(nodeId);
      }
    }

    return { finalState: state, totalTokens };
  }

  private evaluateCondition(
    condition: string,
    state: Record<string, unknown>,
  ): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('state', `"use strict"; return !!(${condition});`);
      return fn(state) as boolean;
    } catch (err) {
      this.logger.warn(
        `Failed to evaluate condition "${condition}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private resolveParams(
    params: Record<string, unknown>,
    state: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        resolved[key] = this.compilerService.resolveTemplate(value, state);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
}
