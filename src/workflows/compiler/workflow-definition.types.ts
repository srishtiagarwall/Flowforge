export type WorkflowNodeType = 'llm' | 'tool' | 'condition';

export interface WorkflowWebhookConfig {
  url: string;
  headers?: Record<string, string>;
  include_traces?: boolean;
}

export interface WorkflowNodeBase {
  id: string;
  type: WorkflowNodeType;
  depends_on?: string[];
  output_key?: string;
}

export interface LlmWorkflowNode extends WorkflowNodeBase {
  type: 'llm';
  model: string;
  prompt: string;
  output_key: string;
}

export interface ToolWorkflowNode extends WorkflowNodeBase {
  type: 'tool';
  tool: string;
  params?: Record<string, unknown>;
}

export interface ConditionWorkflowBranch {
  condition: string;
  next: string;
}

export interface ConditionWorkflowNode extends WorkflowNodeBase {
  type: 'condition';
  branches: Record<string, ConditionWorkflowBranch>;
}

export type WorkflowNode =
  | LlmWorkflowNode
  | ToolWorkflowNode
  | ConditionWorkflowNode;

export interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;
  nodes: WorkflowNode[];
  artifact_keys?: string[];
  webhook?: WorkflowWebhookConfig;
}
