import { Injectable, BadRequestException } from '@nestjs/common';

export interface WorkflowNode {
  id: string;
  type: 'llm' | 'tool' | 'condition';
  model?: string;
  prompt?: string;
  output_key?: string;
  depends_on?: string[];
  tool?: string;
  params?: Record<string, unknown>;
  branches?: Record<string, { condition: string; next: string }>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;
  nodes: WorkflowNode[];
}

export interface CompiledGraph {
  entryNodes: string[];
  nodes: Map<string, WorkflowNode>;
  edges: Map<string, string[]>; // node -> dependents (nodes that depend on it)
}

@Injectable()
export class CompilerService {
  compile(definition: Record<string, unknown>): CompiledGraph {
    const def = definition as unknown as WorkflowDefinition;

    if (!def.nodes || !Array.isArray(def.nodes) || def.nodes.length === 0) {
      throw new BadRequestException('Workflow must have at least one node');
    }

    const nodes = new Map<string, WorkflowNode>();
    const edges = new Map<string, string[]>();
    const nodeIds = new Set<string>();

    // Index all nodes
    for (const node of def.nodes) {
      if (!node.id || !node.type) {
        throw new BadRequestException('Each node must have an id and type');
      }
      if (nodeIds.has(node.id)) {
        throw new BadRequestException(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
      nodes.set(node.id, node);
      edges.set(node.id, []);
    }

    // Validate depends_on references and build edge map
    for (const node of def.nodes) {
      if (node.depends_on) {
        for (const dep of node.depends_on) {
          if (!nodeIds.has(dep)) {
            throw new BadRequestException(
              `Node "${node.id}" depends on unknown node "${dep}"`,
            );
          }
          edges.get(dep)!.push(node.id);
        }
      }
    }

    // Validate condition node branches reference existing nodes
    for (const node of def.nodes) {
      if (node.type === 'condition' && node.branches) {
        for (const [branchName, branch] of Object.entries(node.branches)) {
          if (branch.next && !nodeIds.has(branch.next)) {
            throw new BadRequestException(
              `Condition "${node.id}" branch "${branchName}" references unknown node "${branch.next}"`,
            );
          }
        }
      }
    }

    // Detect cycles using DFS
    this.detectCycles(nodeIds, def.nodes);

    // Entry nodes = nodes with no dependencies
    const entryNodes = def.nodes
      .filter((n) => !n.depends_on || n.depends_on.length === 0)
      .map((n) => n.id);

    if (entryNodes.length === 0) {
      throw new BadRequestException(
        'Workflow has no entry nodes (all nodes have dependencies — likely a cycle)',
      );
    }

    return { entryNodes, nodes, edges };
  }

  private detectCycles(nodeIds: Set<string>, nodes: WorkflowNode[]): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjList = new Map<string, string[]>();

    for (const id of nodeIds) {
      adjList.set(id, []);
    }
    for (const node of nodes) {
      if (node.depends_on) {
        for (const dep of node.depends_on) {
          adjList.get(dep)!.push(node.id);
        }
      }
    }

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbor of adjList.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (inStack.has(neighbor)) {
          throw new BadRequestException(
            `Cycle detected involving node "${neighbor}"`,
          );
        }
      }

      inStack.delete(nodeId);
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        dfs(id);
      }
    }
  }

  resolveTemplate(
    template: string,
    state: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
      const trimmedKey = key.trim();
      const value = this.resolveNestedKey(trimmedKey, state);
      return value !== undefined ? String(value) : `{{${trimmedKey}}}`;
    });
  }

  private resolveNestedKey(
    key: string,
    obj: Record<string, unknown>,
  ): unknown {
    const parts = key.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
