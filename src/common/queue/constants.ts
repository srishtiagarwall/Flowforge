export const WORKFLOW_RUNS_QUEUE = 'workflow-runs';
export const WORKFLOW_RUNS_DLQ = 'workflow-runs-dlq';

export interface RunJobData {
  runId: string;
  workflowId: string;
  tenantId: string;
  input: Record<string, unknown>;
  definition: Record<string, unknown>;
}

export interface RunDeadLetterJobData {
  runId: string;
  workflowId: string;
  tenantId: string;
  error: string;
  attemptsMade: number;
  definition: Record<string, unknown>;
}
