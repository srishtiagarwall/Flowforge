export const WORKFLOW_RUNS_QUEUE = 'workflow-runs';

export interface RunJobData {
  runId: string;
  workflowId: string;
  tenantId: string;
  input: Record<string, unknown>;
  definition: Record<string, unknown>;
}
