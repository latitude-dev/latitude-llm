# Verifiers (Prime Intellect) telemetry

Stream [Prime Intellect Verifiers](https://github.com/PrimeIntellect-ai/verifiers) eval rollouts into Latitude as traces. After setup, each rollout appears in your project's **Traces** view with prompts, model calls, tool calls, token usage, timing, and rewards — optionally as Latitude custom scores.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- A Verifiers v1 eval setup (`verifiers.v1`, `uv run eval`, or `prime eval`)
- `pip` / `uv` in the same environment that runs your eval

## Install

1. In Latitude, copy your project slug from the project sidebar.
2. Create or copy an API key from **Settings → API Keys**.
3. Install the package into the env that runs Verifiers:

```bash
pip install latitude-telemetry-verifiers
# or: uv pip install latitude-telemetry-verifiers
```

4. Set credentials:

```bash
export LATITUDE_API_KEY=lat_xxx
export LATITUDE_PROJECT=your-project-slug
```

<Note>
  Traces go to Latitude Cloud ingest (`https://ingest.latitude.so`) by default. Scores use the public API (`https://api.latitude.so`). For self-hosted or local Latitude, set `LATITUDE_BASE_URL` (ingest origin, no `/v1/traces` suffix) and `LATITUDE_API_BASE_URL` (API origin) to match that instance.
</Note>

## Usage

### From a Python eval script

```python
from latitude_telemetry_verifiers import export_episodes

episodes = await run_eval(env, config)
export_episodes(episodes)
```

Or attach an `on_complete` callback to `Env.run_slot`:

```python
from latitude_telemetry_verifiers import make_on_complete

on_complete = make_on_complete(next=your_persist_callback)
await env.run_slot(slot, ctx, semaphore, on_complete)
```

### After a CLI eval (post-hoc)

Run your eval as usual, then export the results directory:

```bash
latitude-verifiers-export export ./outputs/<run-dir>
```

The CLI looks for `traces.jsonl`, `episodes.jsonl`, or `results.jsonl`.

## Verify

Open your Latitude project → **Traces**. New rollouts should appear within a few seconds after export. If you left score export enabled (default), rewards show up as custom scores on those traces.

If nothing arrives, set `LATITUDE_DEBUG=true` and re-run the export.

## Structural-only telemetry

```bash
export LATITUDE_NO_CONTENT=true
```

Structural-only traces still include timing, model, token usage, and span structure. Message and tool content are omitted.

## Disable scores

```bash
export LATITUDE_EXPORT_SCORES=false
# or: latitude-verifiers-export export ./outputs/<run-dir> --no-scores
```

## Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `LATITUDE_API_KEY` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `https://ingest.latitude.so` | Ingest origin (appends `/v1/traces`) |
| `LATITUDE_API_BASE_URL` | `https://api.latitude.so` | Public API origin for scores |
| `LATITUDE_EXPORT_SCORES` | `true` | POST rewards/metrics as custom scores |
| `LATITUDE_VERIFIERS_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `true` | Master switch |
| `LATITUDE_NO_CONTENT` | `false` | Structure/timing only |
| `LATITUDE_DEBUG` | `false` | Verbose logging |

Telemetry stays off until both `LATITUDE_API_KEY` and a project are set.

## How it works

Verifiers v1 records each rollout as a typed `Trace` (messages, `ModelCall`s, tools, rewards, timing). This package maps that record to OTLP:

```
interaction (one rollout; session = eval/episode id)
├── llm_request      (one per model call)
└── tool_call:<name> (tool_execution; one per tool result)
```

It POSTs traces to ingest and, when enabled, POSTs each reward as a custom score (`sourceId = verifiers.reward.<name>`) against the same 32-hex trace id. Export is fail-open: a Latitude error never fails your eval.

## Captured data and privacy

By default Latitude receives prompts, responses, tool I/O, model metadata, token usage, and reward values.

- Set `LATITUDE_NO_CONTENT=true` for structural telemetry only.
- Disable or skip export before working with sensitive material you do not want sent to Latitude.

## Troubleshooting

**No traces appear.** Confirm `LATITUDE_API_KEY` and `LATITUDE_PROJECT` are set in the same environment that runs the export, and that the results path contains a `.jsonl` file.

**Scores missing.** Check `LATITUDE_EXPORT_SCORES` is not false, and that `LATITUDE_API_BASE_URL` points at the same Latitude instance as your API key.

**Traces show timing but no content.** Structural-only mode is on — unset `LATITUDE_NO_CONTENT`.
