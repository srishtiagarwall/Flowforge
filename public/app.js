const storageKeys = {
  apiKey: 'flowforge.apiKey',
  workflowId: 'flowforge.workflowId',
  runId: 'flowforge.runId',
};

const pollIntervalMs = 1800;

const elements = {
  apiBaseLabel: document.getElementById('apiBaseLabel'),
  selectedWorkflowLabel: document.getElementById('selectedWorkflowLabel'),
  flashMessage: document.getElementById('flashMessage'),
  tenantForm: document.getElementById('tenantForm'),
  tenantName: document.getElementById('tenantName'),
  tenantPlan: document.getElementById('tenantPlan'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  tenantOutput: document.getElementById('tenantOutput'),
  clearSessionButton: document.getElementById('clearSessionButton'),
  refreshWorkflowsButton: document.getElementById('refreshWorkflowsButton'),
  workflowList: document.getElementById('workflowList'),
  workflowForm: document.getElementById('workflowForm'),
  workflowName: document.getElementById('workflowName'),
  workflowStatus: document.getElementById('workflowStatus'),
  workflowDefinition: document.getElementById('workflowDefinition'),
  workflowOutput: document.getElementById('workflowOutput'),
  newWorkflowButton: document.getElementById('newWorkflowButton'),
  loadSampleButton: document.getElementById('loadSampleButton'),
  deleteWorkflowButton: document.getElementById('deleteWorkflowButton'),
  runForm: document.getElementById('runForm'),
  idempotencyKey: document.getElementById('idempotencyKey'),
  runIdInput: document.getElementById('runIdInput'),
  runInput: document.getElementById('runInput'),
  runOutput: document.getElementById('runOutput'),
  historyOutput: document.getElementById('historyOutput'),
  tracesOutput: document.getElementById('tracesOutput'),
  runResultOutput: document.getElementById('runResultOutput'),
  runErrorOutput: document.getElementById('runErrorOutput'),
  refreshRunButton: document.getElementById('refreshRunButton'),
  loadHistoryButton: document.getElementById('loadHistoryButton'),
  runExplainBox: document.getElementById('runExplainBox'),
  runTimeline: document.getElementById('runTimeline'),
  runStatusBadge: document.getElementById('runStatusBadge'),
  runMetaText: document.getElementById('runMetaText'),
  runTokensValue: document.getElementById('runTokensValue'),
  runAttemptText: document.getElementById('runAttemptText'),
  runTraceCount: document.getElementById('runTraceCount'),
  runTraceHint: document.getElementById('runTraceHint'),
};

const state = {
  workflows: [],
  selectedWorkflow: null,
  currentRun: null,
  currentTraces: [],
  history: null,
  pollTimer: null,
};

const defaultWorkflow = () => ({
  name: 'Gemini Lead Qualifier',
  status: 'active',
  definition: {
    id: `wf_gemini_${Date.now()}`,
    name: 'Gemini lead qualification workflow',
    trigger: 'api',
    artifact_keys: ['score'],
    nodes: [
      {
        id: 'score_lead',
        type: 'llm',
        model: 'gemini-2.0-flash',
        prompt:
          'Score this lead from 0 to 100 and explain briefly: {{input.lead}}',
        output_key: 'score',
      },
      {
        id: 'write_log',
        type: 'tool',
        depends_on: ['score_lead'],
        tool: 'log',
        params: {
          message: 'Lead scored: {{score}}',
        },
        output_key: 'result',
      },
    ],
  },
});

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderJson(value) {
  return `<pre class="json-block">${escapeHtml(pretty(value))}</pre>`;
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }
  return new Date(value).toLocaleString();
}

function setFlash(message, isError = false) {
  elements.flashMessage.textContent = message;
  elements.flashMessage.style.background = isError
    ? 'rgba(100, 31, 24, 0.92)'
    : 'rgba(20, 32, 28, 0.9)';
  elements.flashMessage.classList.add('visible');
  window.clearTimeout(setFlash.timeoutId);
  setFlash.timeoutId = window.setTimeout(() => {
    elements.flashMessage.classList.remove('visible');
  }, 2800);
}

function getApiKey() {
  return elements.apiKeyInput.value.trim();
}

function requireApiKey() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Create a tenant or paste an x-api-key first.');
  }
  return apiKey;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (!path.startsWith('/tenants')) {
    headers.set('x-api-key', requireApiKey());
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.message instanceof Array
        ? data.message.join(', ')
        : data?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function persistSession() {
  localStorage.setItem(storageKeys.apiKey, getApiKey());
  localStorage.setItem(storageKeys.workflowId, state.selectedWorkflow?.id || '');
  localStorage.setItem(storageKeys.runId, elements.runIdInput.value.trim());
}

function syncHeader() {
  elements.apiBaseLabel.textContent = window.location.origin;
  elements.selectedWorkflowLabel.textContent = state.selectedWorkflow
    ? `${state.selectedWorkflow.name} v${state.selectedWorkflow.version}`
    : 'None';
}

function renderWorkflowList() {
  if (!state.workflows.length) {
    elements.workflowList.innerHTML =
      '<p class="muted">No workflows yet. Save one from the editor.</p>';
    return;
  }

  elements.workflowList.innerHTML = state.workflows
    .map((workflow) => {
      const activeClass =
        workflow.id === state.selectedWorkflow?.id
          ? 'workflow-item active'
          : 'workflow-item';
      return `
        <button class="${activeClass}" type="button" data-workflow-id="${workflow.id}">
          <strong>${escapeHtml(workflow.name)}</strong>
          <span>${escapeHtml(workflow.status)} · version ${workflow.version}</span>
        </button>
      `;
    })
    .join('');

  elements.workflowList
    .querySelectorAll('[data-workflow-id]')
    .forEach((button) =>
      button.addEventListener('click', () => selectWorkflow(button.dataset.workflowId)),
    );
}

function fillWorkflowForm(workflow) {
  const source = workflow || defaultWorkflow();
  elements.workflowName.value = source.name;
  elements.workflowStatus.value = source.status || 'active';
  elements.workflowDefinition.value = pretty(source.definition);
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function schedulePolling() {
  stopPolling();
  if (!state.currentRun || !['queued', 'running'].includes(state.currentRun.status)) {
    return;
  }

  state.pollTimer = window.setTimeout(async () => {
    try {
      await loadRunDetails({ silent: true });
    } catch (_error) {
      return;
    }

    if (state.currentRun && ['queued', 'running'].includes(state.currentRun.status)) {
      schedulePolling();
    }
  }, pollIntervalMs);
}

function renderTimeline(status) {
  const steps = Array.from(elements.runTimeline.querySelectorAll('.timeline-step'));
  steps.forEach((step) => {
    step.classList.remove('active', 'complete', 'failed');
  });

  if (!status) {
    return;
  }

  if (status === 'queued') {
    steps[0].classList.add('active');
  } else if (status === 'running') {
    steps[0].classList.add('complete');
    steps[1].classList.add('active');
  } else if (status === 'done') {
    steps[0].classList.add('complete');
    steps[1].classList.add('complete');
    steps[2].classList.add('active', 'complete');
  } else if (status === 'failed') {
    steps[0].classList.add('complete');
    steps[1].classList.add('failed');
    steps[2].classList.add('failed');
  }
}

function renderCurrentRun() {
  const run = state.currentRun;
  const traces = state.currentTraces;

  if (!run) {
    elements.runExplainBox.textContent =
      'Pick or trigger a run to see what the engine is doing step by step.';
    elements.runStatusBadge.textContent = 'No run';
    elements.runMetaText.textContent = 'Trigger a workflow to populate this view.';
    elements.runTokensValue.textContent = '0';
    elements.runAttemptText.textContent = 'Attempts: 0';
    elements.runTraceCount.textContent = '0';
    elements.runTraceHint.textContent = 'No step traces yet.';
    elements.runOutput.innerHTML = 'No run loaded.';
    elements.runResultOutput.innerHTML = 'No output yet.';
    elements.runErrorOutput.innerHTML = 'No error.';
    elements.tracesOutput.innerHTML = 'No traces loaded.';
    renderTimeline(null);
    return;
  }

  const statusText = run.status.toUpperCase();
  const isLive = ['queued', 'running'].includes(run.status);
  const traceCount = traces.length;

  elements.runExplainBox.textContent = isLive
    ? 'The workflow is still in flight. Flowforge has created a run record and the worker is executing nodes. This panel auto-refreshes until the run reaches done or failed.'
    : run.status === 'done'
      ? 'This run has finished. The output below is the final workflow state that was persisted by the backend.'
      : 'This run failed. The backend stored the last known error and any traces written before the failure.';

  elements.runStatusBadge.innerHTML = `<span class="pill ${escapeHtml(run.status)}">${statusText}</span>`;
  elements.runMetaText.textContent = `Run ${run.id} started ${formatDate(run.started_at)} and ended ${formatDate(run.ended_at)}.`;
  elements.runTokensValue.textContent = String(run.total_tokens ?? 0);
  elements.runAttemptText.textContent = `Attempts: ${run.attempt_count ?? 0}`;
  elements.runTraceCount.textContent = String(traceCount);
  elements.runTraceHint.textContent =
    traceCount > 0
      ? 'Each trace represents one executed workflow node.'
      : isLive
        ? 'Waiting for node traces to be persisted.'
        : 'No traces were returned for this run.';

  elements.runOutput.innerHTML = `
    <div class="key-value-list">
      <div class="kv-row"><span class="kv-key">Run ID</span><span class="kv-value">${escapeHtml(run.id)}</span></div>
      <div class="kv-row"><span class="kv-key">Status</span><span class="kv-value">${escapeHtml(run.status)}</span></div>
      <div class="kv-row"><span class="kv-key">Started At</span><span class="kv-value">${escapeHtml(formatDate(run.started_at))}</span></div>
      <div class="kv-row"><span class="kv-key">Ended At</span><span class="kv-value">${escapeHtml(formatDate(run.ended_at))}</span></div>
      <div class="kv-row"><span class="kv-key">Webhook Status</span><span class="kv-value">${escapeHtml(String(run.webhook_status ?? 'none'))}</span></div>
      <div class="kv-row"><span class="kv-key">Artifacts</span><span class="kv-value">${escapeHtml(String(run.artifacts?.length ?? 0))}</span></div>
    </div>
  `;

  elements.runResultOutput.innerHTML = run.output
    ? renderJson(run.output)
    : 'No output yet.';
  elements.runErrorOutput.innerHTML = run.last_error
    ? `<pre class="json-block">${escapeHtml(run.last_error)}</pre>`
    : 'No error.';

  if (!traces.length) {
    elements.tracesOutput.innerHTML = isLive
      ? 'No traces yet. The worker may still be on the first step.'
      : 'No traces loaded.';
  } else {
    elements.tracesOutput.innerHTML = traces
      .map(
        (trace) => `
          <article class="trace-item">
            <div class="trace-top">
              <strong>${escapeHtml(trace.step_name)}</strong>
              <span class="pill ${trace.error ? 'failed' : 'done'}">${trace.error ? 'ERROR' : 'OK'}</span>
            </div>
            <div class="trace-meta">
              ${escapeHtml(`Latency: ${trace.latency_ms} ms | Tokens: ${trace.tokens_used} | Created: ${formatDate(trace.created_at)}`)}
            </div>
            ${
              trace.input_snapshot
                ? `<div class="trace-block"><strong>Input Snapshot</strong>${renderJson(trace.input_snapshot)}</div>`
                : ''
            }
            ${
              trace.output_snapshot
                ? `<div class="trace-block"><strong>Output Snapshot</strong>${renderJson(trace.output_snapshot)}</div>`
                : ''
            }
            ${
              trace.error
                ? `<div class="trace-block"><strong>Error</strong><pre class="json-block">${escapeHtml(trace.error)}</pre></div>`
                : ''
            }
          </article>
        `,
      )
      .join('');
  }

  renderTimeline(run.status);
}

function renderHistory() {
  const history = state.history;
  if (!history || !history.data?.length) {
    elements.historyOutput.innerHTML = 'No history loaded.';
    return;
  }

  elements.historyOutput.innerHTML = `
    <div class="history-list">
      ${history.data
        .map(
          (run) => `
            <button class="history-item" type="button" data-history-run="${run.id}">
              <div class="history-top">
                <strong>${escapeHtml(run.id)}</strong>
                <span class="pill ${escapeHtml(run.status)}">${escapeHtml(run.status.toUpperCase())}</span>
              </div>
              <div class="history-meta">
                ${escapeHtml(`Tokens: ${run.total_tokens} | Attempts: ${run.attempt_count} | Started: ${formatDate(run.started_at)}`)}
              </div>
            </button>
          `,
        )
        .join('')}
    </div>
  `;

  elements.historyOutput
    .querySelectorAll('[data-history-run]')
    .forEach((button) =>
      button.addEventListener('click', async () => {
        elements.runIdInput.value = button.dataset.historyRun;
        persistSession();
        await loadRunDetails();
      }),
    );
}

function selectWorkflow(workflowId) {
  const workflow = state.workflows.find((item) => item.id === workflowId) || null;
  state.selectedWorkflow = workflow;
  if (workflow) {
    fillWorkflowForm(workflow);
  }
  syncHeader();
  renderWorkflowList();
  persistSession();
}

async function loadWorkflows() {
  const workflows = await apiFetch('/workflows');
  state.workflows = workflows;
  const rememberedId = localStorage.getItem(storageKeys.workflowId);
  if (!state.selectedWorkflow && rememberedId) {
    state.selectedWorkflow =
      workflows.find((workflow) => workflow.id === rememberedId) || null;
  }
  if (state.selectedWorkflow) {
    state.selectedWorkflow =
      workflows.find((workflow) => workflow.id === state.selectedWorkflow.id) || null;
  }
  renderWorkflowList();
  syncHeader();
  if (state.selectedWorkflow) {
    fillWorkflowForm(state.selectedWorkflow);
  }
}

async function handleTenantCreate(event) {
  event.preventDefault();
  try {
    const tenant = await apiFetch('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: elements.tenantName.value.trim(),
        plan: elements.tenantPlan.value,
      }),
    });
    elements.apiKeyInput.value = tenant.api_key;
    elements.tenantOutput.textContent = pretty(tenant);
    persistSession();
    setFlash('Tenant created and API key stored.');
    await loadWorkflows();
  } catch (error) {
    elements.tenantOutput.textContent = error.message;
    setFlash(error.message, true);
  }
}

async function handleWorkflowSave(event) {
  event.preventDefault();
  try {
    const definition = JSON.parse(elements.workflowDefinition.value);
    const payload = {
      name: elements.workflowName.value.trim(),
      status: elements.workflowStatus.value,
      definition,
    };

    const isUpdate = Boolean(state.selectedWorkflow);
    const workflow = isUpdate
      ? await apiFetch(`/workflows/${state.selectedWorkflow.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await apiFetch('/workflows', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

    elements.workflowOutput.textContent = pretty(workflow);
    setFlash(`Workflow ${isUpdate ? 'updated' : 'created'}.`);
    state.selectedWorkflow = workflow;
    await loadWorkflows();
    selectWorkflow(workflow.id);
  } catch (error) {
    elements.workflowOutput.textContent = error.message;
    setFlash(error.message, true);
  }
}

async function handleWorkflowDelete() {
  if (!state.selectedWorkflow) {
    setFlash('Select a workflow first.', true);
    return;
  }

  try {
    await apiFetch(`/workflows/${state.selectedWorkflow.id}`, {
      method: 'DELETE',
    });
    elements.workflowOutput.textContent = `Deleted workflow ${state.selectedWorkflow.id}.`;
    state.selectedWorkflow = null;
    state.history = null;
    state.currentRun = null;
    state.currentTraces = [];
    stopPolling();
    fillWorkflowForm();
    renderCurrentRun();
    renderHistory();
    persistSession();
    setFlash('Workflow deleted.');
    await loadWorkflows();
  } catch (error) {
    elements.workflowOutput.textContent = error.message;
    setFlash(error.message, true);
  }
}

async function handleRunTrigger(event) {
  event.preventDefault();
  if (!state.selectedWorkflow) {
    setFlash('Save or select a workflow first.', true);
    return;
  }

  try {
    const input = JSON.parse(elements.runInput.value);
    const run = await apiFetch(`/workflows/${state.selectedWorkflow.id}/run`, {
      method: 'POST',
      headers: elements.idempotencyKey.value.trim()
        ? { 'idempotency-key': elements.idempotencyKey.value.trim() }
        : {},
      body: JSON.stringify({
        input,
      }),
    });
    elements.runIdInput.value = run.run_id;
    persistSession();
    setFlash('Run queued. Polling until completion.');
    await loadRunDetails();
    await loadRunHistory();
  } catch (error) {
    elements.runOutput.textContent = error.message;
    setFlash(error.message, true);
  }
}

async function loadRunDetails(options = {}) {
  const runId = elements.runIdInput.value.trim();
  if (!runId) {
    if (!options.silent) {
      setFlash('Enter or trigger a run first.', true);
    }
    return;
  }

  try {
    const [run, traces] = await Promise.all([
      apiFetch(`/runs/${runId}`),
      apiFetch(`/runs/${runId}/traces`),
    ]);
    state.currentRun = run;
    state.currentTraces = traces;
    persistSession();
    renderCurrentRun();
    schedulePolling();
  } catch (error) {
    stopPolling();
    state.currentRun = null;
    state.currentTraces = [];
    renderCurrentRun();
    if (!options.silent) {
      setFlash(error.message, true);
    }
    throw error;
  }
}

async function loadRunHistory() {
  if (!state.selectedWorkflow) {
    setFlash('Select a workflow first.', true);
    return;
  }

  try {
    state.history = await apiFetch(
      `/workflows/${state.selectedWorkflow.id}/runs?page=1&limit=20`,
    );
    renderHistory();
  } catch (error) {
    elements.historyOutput.textContent = error.message;
    setFlash(error.message, true);
  }
}

function resetSession() {
  stopPolling();
  localStorage.removeItem(storageKeys.apiKey);
  localStorage.removeItem(storageKeys.workflowId);
  localStorage.removeItem(storageKeys.runId);
  elements.apiKeyInput.value = '';
  elements.runIdInput.value = '';
  state.selectedWorkflow = null;
  state.workflows = [];
  state.currentRun = null;
  state.currentTraces = [];
  state.history = null;
  fillWorkflowForm();
  renderWorkflowList();
  syncHeader();
  renderCurrentRun();
  renderHistory();
  elements.tenantOutput.textContent = 'No tenant created yet.';
  elements.workflowOutput.textContent = 'No workflow action yet.';
  setFlash('Session cleared.');
}

function bootstrap() {
  elements.apiKeyInput.value = localStorage.getItem(storageKeys.apiKey) || '';
  elements.runIdInput.value = localStorage.getItem(storageKeys.runId) || '';
  elements.runInput.value = pretty({
    lead: 'ACME Corp wants enterprise Gemini automation support.',
  });
  fillWorkflowForm();
  syncHeader();
  renderWorkflowList();
  renderCurrentRun();
  renderHistory();

  elements.tenantForm.addEventListener('submit', handleTenantCreate);
  elements.workflowForm.addEventListener('submit', handleWorkflowSave);
  elements.runForm.addEventListener('submit', handleRunTrigger);
  elements.clearSessionButton.addEventListener('click', resetSession);
  elements.refreshWorkflowsButton.addEventListener('click', async () => {
    try {
      await loadWorkflows();
      setFlash('Workflows refreshed.');
    } catch (error) {
      setFlash(error.message, true);
    }
  });
  elements.newWorkflowButton.addEventListener('click', () => {
    state.selectedWorkflow = null;
    fillWorkflowForm();
    syncHeader();
    renderWorkflowList();
    persistSession();
  });
  elements.loadSampleButton.addEventListener('click', () => {
    fillWorkflowForm(defaultWorkflow());
    setFlash('Gemini sample loaded into the editor.');
  });
  elements.deleteWorkflowButton.addEventListener('click', handleWorkflowDelete);
  elements.refreshRunButton.addEventListener('click', () => loadRunDetails());
  elements.loadHistoryButton.addEventListener('click', loadRunHistory);
  elements.apiKeyInput.addEventListener('change', persistSession);
  elements.runIdInput.addEventListener('change', async () => {
    persistSession();
    if (elements.runIdInput.value.trim()) {
      await loadRunDetails();
    }
  });

  if (getApiKey()) {
    loadWorkflows()
      .then(async () => {
        if (state.selectedWorkflow) {
          await loadRunHistory();
        }
        if (elements.runIdInput.value.trim()) {
          await loadRunDetails({ silent: true });
        }
      })
      .catch((error) => {
        setFlash(error.message, true);
      });
  }
}

bootstrap();
