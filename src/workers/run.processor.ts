import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WORKFLOW_RUNS_QUEUE, RunJobData } from '../common/queue/constants';
import { RunsService } from '../runs/runs.service';
import { CompilerService } from '../workflows/compiler/compiler.service';
import { ObservabilityService } from '../observability/observability.service';
import { RunStatus } from '../runs/workflow-run.entity';

@Processor(WORKFLOW_RUNS_QUEUE)
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly compilerService: CompilerService,
    private readonly observabilityService: ObservabilityService,
  ) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    const { runId, definition, input } = job.data;
    this.logger.log(`Processing run ${runId}`);

    await this.runsService.updateStatus(runId, RunStatus.RUNNING);

    try {
      // Compile workflow definition
      const graph = this.compilerService.compile(definition);
      this.logger.log(
        `Compiled workflow: ${graph.entryNodes.length} entry nodes, ${graph.nodes.size} total nodes`,
      );

      // Execute nodes in topological order
      const state: Record<string, unknown> = { input };
      const executedNodes = new Set<string>();
      let totalTokens = 0;

      const executeNode = async (nodeId: string): Promise<void> => {
        if (executedNodes.has(nodeId)) return;

        const node = graph.nodes.get(nodeId)!;

        // Wait for dependencies
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

        try {
          switch (node.type) {
            case 'llm': {
              // Placeholder: resolve template, log what would be sent
              const resolvedPrompt = node.prompt
                ? this.compilerService.resolveTemplate(node.prompt, state)
                : '';
              stepOutput = {
                type: 'llm',
                model: node.model,
                prompt: resolvedPrompt,
                result: `[LLM placeholder — model: ${node.model}]`,
              };
              if (node.output_key) {
                state[node.output_key] = stepOutput.result;
              }
              break;
            }
            case 'tool': {
              stepOutput = {
                type: 'tool',
                tool: node.tool,
                params: node.params,
                result: `[Tool placeholder — tool: ${node.tool}]`,
              };
              break;
            }
            case 'condition': {
              stepOutput = {
                type: 'condition',
                branches: node.branches,
                result: '[Condition evaluated — placeholder]',
              };
              // In a full implementation, evaluate the condition and follow the branch
              if (node.branches) {
                const firstBranch = Object.values(node.branches)[0];
                if (firstBranch?.next) {
                  await executeNode(firstBranch.next);
                }
              }
              break;
            }
          }
        } catch (err) {
          stepError = err instanceof Error ? err.message : String(err);
        }

        const latencyMs = Date.now() - startTime;

        await this.observabilityService.writeTrace({
          run_id: runId,
          step_name: nodeId,
          input_snapshot: node.type === 'llm' ? { prompt: (stepOutput as Record<string, unknown>).prompt } : null,
          output_snapshot: stepOutput,
          latency_ms: latencyMs,
          tokens_used: 0, // Placeholder until real LLM integration
          error: stepError,
        });

        executedNodes.add(nodeId);
      };

      // Start execution from entry nodes
      for (const entryNodeId of graph.entryNodes) {
        await executeNode(entryNodeId);
      }

      // Also execute nodes that are reachable from entry nodes but not yet executed
      for (const nodeId of graph.nodes.keys()) {
        if (!executedNodes.has(nodeId)) {
          await executeNode(nodeId);
        }
      }

      await this.runsService.updateStatus(runId, RunStatus.DONE, state, totalTokens);
      this.logger.log(`Run ${runId} completed`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId} failed: ${errorMsg}`);
      await this.runsService.updateStatus(runId, RunStatus.FAILED, {
        error: errorMsg,
      });
      throw err; // Re-throw so BullMQ can retry
    }
  }
}
