import { BadRequestException, Injectable } from '@nestjs/common';
import { ConditionEvaluatorService } from '../../execution/conditions/condition-evaluator.service';
import {
  ConditionWorkflowNode,
  WorkflowDefinition,
  WorkflowNode,
} from './workflow-definition.types';

export interface CompiledGraph {
  entryNodes: string[];
  nodes: Map<string, WorkflowNode>;
  edges: Map<string, string[]>;
  terminalNodes: string[];
  branchTargets: Set<string>;
  definition: WorkflowDefinition;
}

@Injectable()
export class CompilerService {
  constructor(
    private readonly conditionEvaluator: ConditionEvaluatorService,
  ) {}

  compile(definition: Record<string, unknown>): CompiledGraph {
    const def = this.validateDefinition(definition as unknown as WorkflowDefinition);
    const nodes = new Map<string, WorkflowNode>();
    const edges = new Map<string, string[]>();
    const nodeIds = new Set<string>();
    const branchTargets = new Set<string>();

    for (const node of def.nodes) {
      if (nodeIds.has(node.id)) {
        throw new BadRequestException(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
      nodes.set(node.id, node);
      edges.set(node.id, []);
    }

    for (const node of def.nodes) {
      for (const dep of node.depends_on ?? []) {
        if (!nodeIds.has(dep)) {
          throw new BadRequestException(
            `Node "${node.id}" depends on unknown node "${dep}"`,
          );
        }
        edges.get(dep)!.push(node.id);
      }
    }

    for (const node of def.nodes) {
      if (node.type !== 'condition') {
        continue;
      }

      for (const [branchName, branch] of Object.entries(node.branches)) {
        if (!nodeIds.has(branch.next)) {
          throw new BadRequestException(
            `Condition "${node.id}" branch "${branchName}" references unknown node "${branch.next}"`,
          );
        }
        branchTargets.add(branch.next);
        edges.get(node.id)!.push(branch.next);
      }
    }

    this.detectCycles(nodeIds, def.nodes);

    const entryNodes = def.nodes
      .filter(
        (node) =>
          (node.depends_on?.length ?? 0) === 0 && !branchTargets.has(node.id),
      )
      .map((node) => node.id);

    if (entryNodes.length === 0) {
      throw new BadRequestException(
        'Workflow has no entry nodes. Every node is gated by another node or branch.',
      );
    }

    const terminalNodes = def.nodes
      .filter((node) => (edges.get(node.id)?.length ?? 0) === 0)
      .map((node) => node.id);

    return {
      entryNodes,
      nodes,
      edges,
      terminalNodes,
      branchTargets,
      definition: def,
    };
  }

  resolveTemplate(template: string, state: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
      const trimmedKey = key.trim();
      const value = this.resolveNestedKey(trimmedKey, state);
      return value !== undefined ? String(value) : `{{${trimmedKey}}}`;
    });
  }

  resolveValue(value: unknown, state: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      return this.resolveTemplate(value, state);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, state));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          this.resolveValue(nestedValue, state),
        ]),
      );
    }
    return value;
  }

  private validateDefinition(definition: WorkflowDefinition): WorkflowDefinition {
    if (!definition.id?.trim()) {
      throw new BadRequestException('Workflow definition must include an id');
    }
    if (!definition.name?.trim()) {
      throw new BadRequestException('Workflow definition must include a name');
    }
    if (!definition.trigger?.trim()) {
      throw new BadRequestException('Workflow definition must include a trigger');
    }
    if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
      throw new BadRequestException('Workflow must have at least one node');
    }

    const outputKeys = new Set<string>();

    for (const node of definition.nodes) {
      if (!node.id?.trim() || !node.type) {
        throw new BadRequestException('Each node must have an id and type');
      }
      if (node.depends_on && !Array.isArray(node.depends_on)) {
        throw new BadRequestException(
          `Node "${node.id}" depends_on must be an array`,
        );
      }

      if (node.output_key) {
        if (outputKeys.has(node.output_key)) {
          throw new BadRequestException(
            `Duplicate output_key "${node.output_key}"`,
          );
        }
        outputKeys.add(node.output_key);
      }

      switch (node.type) {
        case 'llm':
          if (!node.model?.trim() || !node.prompt?.trim() || !node.output_key?.trim()) {
            throw new BadRequestException(
              `LLM node "${node.id}" requires model, prompt, and output_key`,
            );
          }
          break;
        case 'tool':
          if (!node.tool?.trim()) {
            throw new BadRequestException(
              `Tool node "${node.id}" requires a tool name`,
            );
          }
          break;
        case 'condition':
          if (!node.branches || Object.keys(node.branches).length === 0) {
            throw new BadRequestException(
              `Condition node "${node.id}" must define at least one branch`,
            );
          }
          for (const [branchName, branch] of Object.entries(node.branches)) {
            if (!branchName.trim()) {
              throw new BadRequestException(
                `Condition node "${node.id}" contains an empty branch name`,
              );
            }
            if (!branch.next?.trim()) {
              throw new BadRequestException(
                `Condition node "${node.id}" branch "${branchName}" requires a next target`,
              );
            }
            this.conditionEvaluator.validate(branch.condition);
          }
          break;
        default:
          throw new BadRequestException(
            `Unsupported node type "${(node as { type: string }).type}"`,
          );
      }
    }

    if (definition.webhook && !definition.webhook.url?.trim()) {
      throw new BadRequestException('Workflow webhook url is required');
    }
    if (definition.artifact_keys && !Array.isArray(definition.artifact_keys)) {
      throw new BadRequestException('artifact_keys must be an array');
    }

    return definition;
  }

  private detectCycles(nodeIds: Set<string>, nodes: WorkflowNode[]): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const id of nodeIds) {
      adjacency.set(id, []);
    }

    for (const node of nodes) {
      for (const dep of node.depends_on ?? []) {
        adjacency.get(dep)!.push(node.id);
      }
      if (node.type === 'condition') {
        for (const branch of Object.values(node.branches)) {
          adjacency.get(node.id)!.push(branch.next);
        }
      }
    }

    const visit = (nodeId: string): void => {
      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (!visited.has(neighbor)) {
          visit(neighbor);
          continue;
        }
        if (inStack.has(neighbor)) {
          throw new BadRequestException(
            `Cycle detected involving node "${neighbor}"`,
          );
        }
      }

      inStack.delete(nodeId);
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        visit(id);
      }
    }
  }

  private resolveNestedKey(
    key: string,
    obj: Record<string, unknown>,
  ): unknown {
    const parts = key.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
