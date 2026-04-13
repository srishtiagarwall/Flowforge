# Flowforge

Flowforge is a multi-tenant AI workflow engine built with NestJS, PostgreSQL, Redis, BullMQ, and LangGraph.

## What It Does

- Stores workflow definitions as JSON.
- Runs workflows asynchronously.
- Supports `llm`, `tool`, and `condition` nodes.
- Tracks run status, retries, traces, artifacts, and webhook delivery.
- Isolates every workflow and run by tenant API key.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the values you need. For Docker Compose local dev, PostgreSQL is exposed on host port `55432`.

3. Start PostgreSQL and Redis:

```bash
docker compose up -d
```

4. Apply migrations:

```bash
npm run migration:run
```

5. For local schema bootstrapping only, if you explicitly want TypeORM to create tables automatically instead of using migrations, set:

```env
DATABASE_SYNCHRONIZE=true
```

6. Start the API:

```bash
npm run start:dev
```

## Architecture

The high-level architecture diagram is available at [docs/hld_workflow_engine.svg](/abs/path/C:/Users/srish/OneDrive/Desktop/Backup/Personal/Flowforge/Flowforge/docs/hld_workflow_engine.svg).

## Test And Build

```bash
npm run build
npm test
npm run test:e2e
```

## Workflow Shape

```json
{
  "id": "wf_lead_qualify_v1",
  "name": "Lead qualification workflow",
  "trigger": "api",
  "artifact_keys": ["score", "result"],
  "webhook": {
    "url": "https://example.com/workflow-events",
    "include_traces": true
  },
  "nodes": [
    {
      "id": "score_lead",
      "type": "llm",
      "model": "gpt-4o-mini",
      "prompt": "Score this lead: {{input.lead}}",
      "output_key": "score"
    },
    {
      "id": "route_lead",
      "type": "condition",
      "depends_on": ["score_lead"],
      "branches": {
        "high": { "condition": "score >= 70", "next": "notify_sales" },
        "low": { "condition": "score < 70", "next": "log_low_score" }
      }
    },
    {
      "id": "notify_sales",
      "type": "tool",
      "tool": "webhook",
      "params": {
        "url": "https://example.com/sales",
        "body": { "score": "{{score}}" }
      },
      "output_key": "result"
    }
  ]
}
```

## API

- `POST /tenants`
- `POST /workflows`
- `GET /workflows`
- `GET /workflows/:id`
- `PUT /workflows/:id`
- `DELETE /workflows/:id`
- `POST /workflows/:id/run`
- `GET /runs/:runId`
- `GET /runs/:runId/traces`
- `GET /workflows/:id/runs`

All workflow and run endpoints require `x-api-key`.

## Curl Demo

Create a tenant:

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Tenant","plan":"pro"}'
```

Create a workflow:

```bash
curl -X POST http://localhost:3000/workflows \
  -H "Content-Type: application/json" \
  -H "x-api-key: <TENANT_API_KEY>" \
  -d '{
    "name":"Lead Qualification",
    "status":"active",
    "definition":{
      "id":"wf_lead_qualify_v1",
      "name":"Lead qualification workflow",
      "trigger":"api",
      "artifact_keys":["score"],
      "nodes":[
        {
          "id":"score_lead",
          "type":"llm",
          "model":"gpt-4o-mini",
          "prompt":"Score this lead: {{input.lead}}",
          "output_key":"score"
        }
      ]
    }
  }'
```

Trigger a run:

```bash
curl -X POST http://localhost:3000/workflows/<WORKFLOW_ID>/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: <TENANT_API_KEY>" \
  -H "idempotency-key: demo-run-1" \
  -d '{
    "input":{
      "lead":"ACME Corp wants a pricing quote"
    }
  }'
```

Poll run status:

```bash
curl http://localhost:3000/runs/<RUN_ID> \
  -H "x-api-key: <TENANT_API_KEY>"
```

Fetch traces:

```bash
curl http://localhost:3000/runs/<RUN_ID>/traces \
  -H "x-api-key: <TENANT_API_KEY>"
```

List workflow runs:

```bash
curl "http://localhost:3000/workflows/<WORKFLOW_ID>/runs?page=1&limit=20" \
  -H "x-api-key: <TENANT_API_KEY>"
```

The Postman collection for the planned API contract is available at [docs/postman_collection.json](/abs/path/C:/Users/srish/OneDrive/Desktop/Backup/Personal/Flowforge/Flowforge/docs/postman_collection.json).

## Built-in Tools

- `http_request`
- `log`
- `format`
- `json_parse`
- `json_stringify`
- `pick`
- `merge`
- `sleep`
- `artifact`
- `webhook`

## Notes

- LangGraph is used as the execution runtime.
- Condition evaluation is intentionally limited to safe comparison syntax.
- BullMQ retries failed runs and moves final failures into a dedicated DLQ queue.
