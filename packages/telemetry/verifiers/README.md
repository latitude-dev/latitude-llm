# latitude-telemetry-verifiers

Export [Prime Intellect Verifiers](https://github.com/PrimeIntellect-ai/verifiers) eval
rollouts to [Latitude](https://latitude.so) as OTLP traces (and optional custom scores
from rewards/metrics).

This is the Verifiers counterpart to the other harness integrations
([`latitude-telemetry-hermes`](../hermes), Claude Code, Pi, OpenClaw). Verifiers has no
host plugin entry point for observability, so this package ships as a **library + CLI**
you call from your eval script or after a run.

## Install

```bash
pip install latitude-telemetry-verifiers
```

```bash
export LATITUDE_API_KEY=lat_xxx
export LATITUDE_PROJECT=my-project
```

## Usage

### After `run_eval` (recommended for scripts)

```python
from verifiers.v1.cli.eval.runner import run_eval
from latitude_telemetry_verifiers import export_episodes

episodes = await run_eval(env, config)
export_episodes(episodes)  # ships traces + reward scores, then flushes
```

### As `Env.run_slot` `on_complete`

```python
from latitude_telemetry_verifiers import make_on_complete

on_complete = make_on_complete(next=persist_episode)  # chain your append_episode
await env.run_slot(slot, ctx, semaphore, on_complete)
```

### Post-hoc from a results directory

After `uv run eval …` / `prime eval …`:

```bash
latitude-verifiers-export export ./outputs/<run-dir>
# or
python -m latitude_telemetry_verifiers export ./outputs/<run-dir>
```

Reads `traces.jsonl`, `episodes.jsonl`, or `results.jsonl` when present.

## Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `LATITUDE_API_KEY` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `https://ingest.latitude.so` | Ingest origin (plugin appends `/v1/traces`) |
| `LATITUDE_API_BASE_URL` | `https://api.latitude.so` | Public API origin for scores |
| `LATITUDE_EXPORT_SCORES` | `true` | POST rewards/metrics as custom scores |
| `LATITUDE_NO_CONTENT` | `false` | Structure/timing only |
| `LATITUDE_DEBUG` | `false` | Verbose logging |
| `LATITUDE_VERIFIERS_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `true` | Master switch |

Telemetry stays off until both `LATITUDE_API_KEY` and a project are set. Export is
fail-open: a Latitude error never fails your eval.

## How it works

Each Verifiers `Trace` becomes one Latitude trace:

```
interaction (rollout root; session = eval/episode id)
├── llm_request      (one per ModelCall: model, usage, finish reason, messages)
└── tool_call:<name> (tool_execution; one per tool result)
```

Rewards map to custom scores (`sourceId = verifiers.reward.<name>`) against the same
trace id (Verifiers' 32-hex `Trace.id`).

## Development

```bash
cd packages/telemetry/verifiers
uv sync --all-groups
uv run pytest tests/ -x
```
