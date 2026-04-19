"use client";

import { useFlowforgeApi, Workflow, Run, Trace } from '@/hooks/useFlowforgeApi';
import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { Play, Settings, RefreshCw, Trash2, Plus, Zap, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function FlowforgeDashboard() {
  const api = useFlowforgeApi();
  const [definitionInput, setDefinitionInput] = useState('');
  const [runInputJson, setRunInputJson] = useState('{\n  "lead": "ACME Corp wants enterprise Gemini automation support."\n}');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const chartData = useMemo(() => {
    if (!api.history?.length) return null;
    const sorted = [...api.history].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    return {
      labels: sorted.map(r => new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      datasets: [{
        label: 'Total Tokens',
        data: sorted.map(r => r.total_tokens || 0),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    };
  }, [api.history]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index' as const, intersect: false, backgroundColor: 'rgba(24, 24, 27, 0.9)' }
    },
    scales: {
      x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' }, beginAtZero: true }
    }
  };

  const loadSample = () => {
    setDefinitionInput(JSON.stringify({
      id: `wf_gemini_${Date.now()}`,
      name: 'Gemini lead qualification workflow',
      trigger: 'api',
      artifact_keys: ['score'],
      nodes: [
        {
          id: 'score_lead', type: 'llm', model: 'gemini-2.0-flash',
          prompt: 'Score this lead from 0 to 100 and explain briefly: {{input.lead}}',
          output_key: 'score',
        },
        {
          id: 'write_log', type: 'tool', depends_on: ['score_lead'],
          tool: 'log', params: { message: 'Lead scored: {{score}}' },
          output_key: 'result',
        },
      ],
    }, null, 2));
    api.setSelectedWorkflow(prev => prev ? { ...prev, name: 'Gemini Lead Qualifier', status: 'active' } : null);
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-[1600px] mx-auto font-sans">
      <div className="background-glow background-glow-a"></div>
      <div className="background-glow background-glow-b"></div>

      <header className="panel flex flex-col md:flex-row items-center justify-between mb-8 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Zap className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Flowforge Console</h1>
            <p className="text-slate-400 text-sm">Premium React Operator UI</p>
          </div>
        </div>
        <div className="flex gap-4 mt-4 md:mt-0">
          <div className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">API Base</span>
            <span className="text-slate-200 font-medium text-sm">Same origin (Proxied)</span>
          </div>
          <div className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Selected Workflow</span>
            <span className="text-slate-200 font-medium text-sm">{api.selectedWorkflow?.name || 'None'}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-8">
        <div className="flex flex-col gap-8">
          <section className="panel p-6">
            <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">1. Tenant</span>
                <h2 className="text-xl font-semibold mt-1">Bootstrap Access</h2>
              </div>
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={api.clearSession}>Clear Session</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); api.createTenant(); }} className="flex flex-col gap-4 mb-6">
              <label>
                <span className="text-sm font-medium text-slate-400 mb-1 block">Tenant Name</span>
                <input className="input-field" value={api.tenantName} onChange={e => api.setTenantName(e.target.value)} required />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-400 mb-1 block">Plan</span>
                <select className="input-field" value={api.tenantPlan} onChange={e => api.setTenantPlan(e.target.value)}>
                  <option value="pro">Pro</option>
                  <option value="free">Free</option>
                </select>
              </label>
              <button className="btn-primary" type="submit">Create Tenant</button>
            </form>
            <label>
              <span className="text-sm font-medium text-slate-400 mb-1 block">Active API Key</span>
              <input className="input-field font-mono text-sm" value={api.apiKey} onChange={e => api.setApiKey(e.target.value)} placeholder="ff_..." />
            </label>
          </section>

          <section className="panel p-6">
            <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">2. Workflows</span>
                <h2 className="text-xl font-semibold mt-1">List & Select</h2>
              </div>
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={api.refreshWorkflows}><RefreshCw className="w-4 h-4"/> Refresh</button>
            </div>
            <div className="flex flex-col gap-3">
              {api.workflows.length === 0 ? <p className="text-slate-500 text-sm">No workflows yet.</p> : null}
              {api.workflows.map(wf => (
                <button 
                  key={wf.id} 
                  onClick={() => {
                    api.setSelectedWorkflow(wf);
                    setDefinitionInput(JSON.stringify(wf.definition, null, 2));
                    api.loadHistory(wf.id);
                  }}
                  className={clsx(
                    "text-left p-4 rounded-xl border transition-all duration-200",
                    api.selectedWorkflow?.id === wf.id 
                      ? "bg-violet-500/20 border-violet-500 border-l-4" 
                      : "bg-black/20 border-white/10 hover:border-white/20 hover:bg-black/40"
                  )}>
                  <strong className="block text-slate-200 font-semibold">{wf.name}</strong>
                  <span className="text-xs text-slate-500 mt-1 block">{wf.status} • v{wf.version}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-8 min-w-0">
          <section className="panel p-6">
            <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">3. Editor</span>
                <h2 className="text-xl font-semibold mt-1">Create or Update</h2>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => { api.setSelectedWorkflow(null); setDefinitionInput(''); }}><Plus className="w-4 h-4"/> New Draft</button>
                <button className="btn-danger text-xs py-1.5 px-3" onClick={api.deleteWorkflow}><Trash2 className="w-4 h-4"/> Delete</button>
              </div>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              try {
                const def = JSON.parse(definitionInput);
                api.saveWorkflow({ name: api.selectedWorkflow?.name || 'New Workflow', status: api.selectedWorkflow?.status || 'active', definition: def });
              } catch(err) {
                alert("Invalid JSON");
              }
            }} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="text-sm font-medium text-slate-400 mb-1 block">Name</span>
                  <input className="input-field" value={api.selectedWorkflow?.name || ''} onChange={e => api.setSelectedWorkflow(prev => prev ? {...prev, name: e.target.value} : { id: '', name: e.target.value, status: 'active', version: 1, definition: {} })} required />
                </label>
                <label>
                  <span className="text-sm font-medium text-slate-400 mb-1 block">Status</span>
                  <select className="input-field" value={api.selectedWorkflow?.status || 'active'} onChange={e => api.setSelectedWorkflow(prev => prev ? {...prev, status: e.target.value} : { id: '', name: 'New Workflow', status: e.target.value, version: 1, definition: {} })}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
              </div>
              <label>
                <span className="text-sm font-medium text-slate-400 mb-1 block">Definition JSON</span>
                <textarea className="input-field font-mono text-sm min-h-[300px]" value={definitionInput} onChange={e => setDefinitionInput(e.target.value)}></textarea>
              </label>
              <div className="flex gap-3 mt-2">
                <button className="btn-primary" type="submit">Save Workflow</button>
                <button className="btn-ghost" type="button" onClick={loadSample}>Load Sample</button>
              </div>
            </form>
          </section>

          <section className="panel p-6">
             <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">4. Runs</span>
                <h2 className="text-xl font-semibold mt-1">Trigger & Inspect</h2>
              </div>
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => api.currentRun && api.loadRunDetails(api.currentRun.id)}><RefreshCw className="w-4 h-4"/> Refresh Run</button>
            </div>
            
            <form onSubmit={e => {
              e.preventDefault();
              try { api.triggerRun(JSON.parse(runInputJson), idempotencyKey); }
              catch { alert("Invalid Run JSON"); }
            }} className="flex flex-col gap-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="text-sm font-medium text-slate-400 mb-1 block">Idempotency Key (optional)</span>
                  <input className="input-field" value={idempotencyKey} onChange={e => setIdempotencyKey(e.target.value)} />
                </label>
              </div>
              <label>
                <span className="text-sm font-medium text-slate-400 mb-1 block">Run Input JSON</span>
                <textarea className="input-field font-mono text-sm min-h-[120px]" value={runInputJson} onChange={e => setRunInputJson(e.target.value)}></textarea>
              </label>
              <div><button className="btn-primary" type="submit"><Play className="w-4 h-4"/> Trigger Run</button></div>
            </form>

            {/* Timeline */}
            <div className="flex flex-wrap gap-4 mb-8">
              {['queued', 'running', 'done'].map((step, i) => {
                const isActive = api.currentRun?.status === step || (step === 'queued' && ['running', 'done'].includes(api.currentRun?.status || ''));
                const isComplete = api.currentRun?.status === 'done' || (step === 'queued' && ['running', 'done'].includes(api.currentRun?.status || '')) || (step === 'running' && api.currentRun?.status === 'done');
                const isFailed = api.currentRun?.status === 'failed' && i > 0;
                
                return (
                  <div key={step} className={clsx(
                    "flex-1 min-w-[150px] p-4 rounded-xl border relative overflow-hidden transition-all duration-300",
                    isComplete ? "bg-emerald-500/10 border-emerald-500/30" : 
                    isActive ? "bg-violet-500/10 border-violet-500/30" : 
                    isFailed ? "bg-red-500/10 border-red-500/30" : "bg-black/20 border-white/10"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-4 h-4 rounded-full shadow-[0_0_0_4px_rgba(0,0,0,0.5)] z-10",
                        isComplete ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]" :
                        isActive ? "bg-violet-500 shadow-[0_0_0_4px_rgba(139,92,246,0.2)] animate-pulse" :
                        isFailed ? "bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.2)]" : "bg-white/20"
                      )}></div>
                      <div>
                        <strong className="block text-slate-200 capitalize">{step}</strong>
                        <span className="text-xs text-slate-500">{i===0?'Record created':i===1?'Executing nodes':'Output persisted'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-black/20 border border-white/10 p-5 rounded-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Status</span>
                <strong className="text-2xl text-white block">
                  {api.currentRun ? <span className={clsx("px-3 py-1 rounded-full text-sm", 
                    api.currentRun.status==='done'?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':
                    api.currentRun.status==='failed'?'bg-red-500/20 text-red-400 border border-red-500/30':
                    'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  )}>{api.currentRun.status.toUpperCase()}</span> : "No run"}
                </strong>
              </div>
              <div className="bg-black/20 border border-white/10 p-5 rounded-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Tokens Used</span>
                <strong className="text-2xl text-violet-400 block">{api.currentRun?.total_tokens || 0}</strong>
              </div>
              <div className="bg-black/20 border border-white/10 p-5 rounded-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Trace Count</span>
                <strong className="text-2xl text-emerald-400 block">{api.currentTraces?.length || 0}</strong>
              </div>
            </div>

            {/* Chart */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4 border-b border-white/10 pb-2">Run Token Analytics</h3>
              <div className="h-[250px] bg-black/20 border border-white/10 rounded-xl p-4">
                {chartData ? <Line data={chartData} options={chartOptions} /> : <div className="flex items-center justify-center h-full text-slate-500">No chart data</div>}
              </div>
            </div>

            {/* Traces */}
            <div>
              <h3 className="text-lg font-semibold mb-4 border-b border-white/10 pb-2">Step Traces</h3>
              <div className="flex flex-col gap-4">
                {!api.currentTraces.length ? <p className="text-slate-500">No traces available.</p> : null}
                {api.currentTraces.map((trace, i) => (
                  <div key={i} className="bg-black/20 border border-white/10 rounded-xl p-5">
                    <div className="flex justify-between items-center mb-3">
                      <strong className="text-lg">{trace.step_name}</strong>
                      <span className={clsx("px-3 py-1 rounded-full text-xs font-bold", trace.error ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400")}>
                        {trace.error ? "ERROR" : "OK"}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-400 mb-4 pb-4 border-b border-white/10">
                      Latency: {trace.latency_ms}ms | Tokens: {trace.tokens_used}
                    </div>
                    {trace.output_snapshot && (
                      <div>
                        <strong className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Output Snapshot</strong>
                        <pre className="bg-black p-4 rounded-xl border border-white/10 font-mono text-sm text-violet-300 overflow-x-auto">
                          {JSON.stringify(trace.output_snapshot, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </section>
        </div>
      </div>

      {api.flashMessage && (
        <div className={clsx(
          "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full backdrop-blur-xl border shadow-2xl z-50 animate-in slide-in-from-bottom-5 fade-in duration-300",
          api.flashMessage.isError ? "bg-red-500/20 border-red-500/30 text-white" : "bg-black/80 border-white/20 text-white"
        )}>
          {api.flashMessage.message}
        </div>
      )}
    </main>
  );
}
