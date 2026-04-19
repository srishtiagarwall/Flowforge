import { useState, useEffect, useCallback } from 'react';

export interface Workflow {
  id: string;
  name: string;
  status: string;
  version: number;
  definition: any;
}

export interface Run {
  id: string;
  status: string;
  started_at: string;
  ended_at: string;
  total_tokens: number;
  attempt_count: number;
  output?: any;
  last_error?: string;
}

export interface Trace {
  step_name: string;
  error: boolean;
  latency_ms: number;
  tokens_used: number;
  created_at: string;
  input_snapshot?: any;
  output_snapshot?: any;
}

export function useFlowforgeApi() {
  const [apiKey, setApiKey] = useState<string>('');
  const [tenantName, setTenantName] = useState('Gemini Tenant');
  const [tenantPlan, setTenantPlan] = useState('pro');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [currentTraces, setCurrentTraces] = useState<Trace[]>([]);
  const [history, setHistory] = useState<Run[]>([]);
  
  const [flashMessage, setFlashMessage] = useState<{message: string, isError: boolean} | null>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem('flowforge.apiKey') || '';
    setApiKey(storedKey);
    if (storedKey) {
      loadWorkflows(storedKey);
    }
  }, []);

  const flash = useCallback((message: string, isError = false) => {
    setFlashMessage({ message, isError });
    setTimeout(() => setFlashMessage(null), 3000);
  }, []);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}, keyOverride?: string) => {
    const key = keyOverride || apiKey;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (!path.startsWith('/api/tenants') && key) {
      headers.set('x-api-key', key);
    }

    const response = await fetch(path, { ...options, headers });
    if (response.status === 204) return null;
    
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    
    if (!response.ok) {
      const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || `Error ${response.status}`;
      throw new Error(msg);
    }
    return data;
  }, [apiKey]);

  const createTenant = async () => {
    try {
      const tenant = await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: tenantName, plan: tenantPlan }),
      });
      setApiKey(tenant.api_key);
      localStorage.setItem('flowforge.apiKey', tenant.api_key);
      flash('Tenant created successfully.');
      loadWorkflows(tenant.api_key);
      return tenant;
    } catch (err: any) {
      flash(err.message, true);
      throw err;
    }
  };

  const loadWorkflows = useCallback(async (key: string) => {
    if (!key) return;
    try {
      const data = await apiFetch('/api/workflows', {}, key);
      setWorkflows(data || []);
    } catch (err: any) {
      flash(err.message, true);
    }
  }, [apiFetch, flash]);

  const saveWorkflow = async (payload: any) => {
    try {
      const isUpdate = Boolean(selectedWorkflow);
      const url = isUpdate ? `/api/workflows/${selectedWorkflow?.id}` : '/api/workflows';
      const method = isUpdate ? 'PUT' : 'POST';
      
      const workflow = await apiFetch(url, { method, body: JSON.stringify(payload) });
      setSelectedWorkflow(workflow);
      flash(`Workflow ${isUpdate ? 'updated' : 'created'}.`);
      loadWorkflows(apiKey);
    } catch (err: any) {
      flash(err.message, true);
      throw err;
    }
  };

  const deleteWorkflow = async () => {
    if (!selectedWorkflow) return;
    try {
      await apiFetch(`/api/workflows/${selectedWorkflow.id}`, { method: 'DELETE' });
      setSelectedWorkflow(null);
      setHistory([]);
      setCurrentRun(null);
      setCurrentTraces([]);
      flash('Workflow deleted.');
      loadWorkflows(apiKey);
    } catch (err: any) {
      flash(err.message, true);
    }
  };

  const loadHistory = useCallback(async (workflowId: string) => {
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/runs?page=1&limit=20`);
      setHistory(res?.data || []);
    } catch (err: any) {
      flash(err.message, true);
    }
  }, [apiFetch, flash]);

  const triggerRun = async (input: any, idempotencyKey?: string) => {
    if (!selectedWorkflow) return;
    try {
      const headers: any = {};
      if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
      
      const run = await apiFetch(`/api/workflows/${selectedWorkflow.id}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input }),
      });
      flash('Run queued. Polling until completion.');
      loadRunDetails(run.run_id);
    } catch (err: any) {
      flash(err.message, true);
      throw err;
    }
  };

  const loadRunDetails = useCallback(async (runId: string) => {
    if (!runId) return;
    try {
      const [runData, traceData] = await Promise.all([
        apiFetch(`/api/runs/${runId}`),
        apiFetch(`/api/runs/${runId}/traces`),
      ]);
      setCurrentRun(runData);
      setCurrentTraces(traceData || []);
      
      if (['queued', 'running'].includes(runData?.status)) {
        setTimeout(() => loadRunDetails(runId), 2000);
      } else if (selectedWorkflow) {
        loadHistory(selectedWorkflow.id);
      }
    } catch (err: any) {
      flash(err.message, true);
    }
  }, [apiFetch, flash, selectedWorkflow, loadHistory]);

  const clearSession = () => {
    localStorage.removeItem('flowforge.apiKey');
    setApiKey('');
    setWorkflows([]);
    setSelectedWorkflow(null);
    setHistory([]);
    setCurrentRun(null);
    setCurrentTraces([]);
    flash('Session cleared.');
  };

  return {
    apiKey, setApiKey,
    tenantName, setTenantName,
    tenantPlan, setTenantPlan,
    workflows,
    selectedWorkflow, setSelectedWorkflow,
    currentRun, currentTraces, history,
    flashMessage,
    createTenant, saveWorkflow, deleteWorkflow,
    loadHistory, triggerRun, loadRunDetails,
    clearSession, refreshWorkflows: () => loadWorkflows(apiKey)
  };
}
