# latitude-telemetry-hermes

Stream [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research's
open-source agent harness) sessions to [Latitude](https://latitude.so) as OTLP traces —
user prompts, model turns, tool calls, tool results, token usage, and the real system
prompt — so you get full-fidelity observability of your agent runs in Latitude.

This is the Hermes counterpart to the other harness integrations
([`@latitude-data/claude-code-telemetry`](../claude-code),
[`@latitude-data/pi-telemetry`](../pi),
[`@latitude-data/openclaw-telemetry`](../openclaw)). Hermes is a Python harness and loads
plugins from Python, so this connector ships as a **pip package** rather than npm.

## Install

```bash
pip install latitude-telemetry-hermes
```

Then enable the plugin by adding `latitude` to `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - latitude
```

Hermes discovers the plugin through the `hermes_agent.plugins` entry point — there are no
files to copy.

> **Enable via `config.yaml`, not `hermes plugins enable latitude`.** Hermes's runtime loads
> pip/entry-point plugins, but its `hermes plugins list`/`enable`/`disable` commands scan only
> bundled and `~/.hermes/plugins/` directory plugins — so they report a pip-installed plugin as
> "not installed or bundled" even though it loads fine
> ([hermes-agent#23802](https://github.com/NousResearch/hermes-agent/issues/23802)). The
> `config.yaml` entry above is the reliable way to turn it on.

> **Plugin not loading at all?** It must be installed into the *same* Python that runs Hermes.
> The official installer puts Hermes in its own venv (`~/.hermes/hermes-agent/venv`) that ignores
> your shell's Python — so a plain `pip install` from another interpreter (system, pyenv, mise, …)
> won't be discovered. Install into Hermes's venv instead:
>
> ```bash
> ~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python latitude-telemetry-hermes
> ```

Set your credentials in the environment (or in `~/.hermes/.env`,
which Hermes loads at startup):

```bash
export LATITUDE_API_KEY=lat_xxx
export LATITUDE_PROJECT=my-project
```

That's it — every session is now streamed to Latitude as OTLP traces. To export
structure and timing without prompt/response/tool content, set `LATITUDE_NO_CONTENT=true`.

> **Self-hosted / local Latitude?** The plugin defaults to Latitude Cloud
> (`https://ingest.latitude.so`). Point it at your own ingest by setting
> `LATITUDE_BASE_URL` to the ingest **origin only** — e.g. `http://localhost:3002`
> for a local dev stack — without the `/v1/traces` suffix (the plugin appends it).
> Your `LATITUDE_API_KEY` and `LATITUDE_PROJECT` must come from that same instance.

## How it works

Hermes loads pip-installed plugins via the `hermes_agent.plugins` entry point and calls
the module's `register(ctx)` function, which subscribes to the lifecycle hooks
(`pre_api_request` / `post_api_request`, `pre_llm_call` / `post_llm_call`,
`pre_tool_call` / `post_tool_call`, and `on_session_end` / `on_session_finalize`) — the
same hooks the bundled `langfuse` and `nemo_relay` plugins use. The `*_api_request` pair is
the LLM-call span boundary; the `*_llm_call` pair frames the turn; the session hooks flush
the exporter so short / one-shot runs (`hermes -z "…"`) ship before the process exits.

The plugin owns the **OTLP mapping** for that hook stream. It assembles one trace per
turn:

```
interaction (one user turn)
├── llm_request    (one per model call: model, provider, tokens, finish reason, system prompt)
├── tool_execution (one per tool call: name, arguments, result, success)
└── llm_request    (the final answer)
```

Spans follow Latitude's GenAI semantic conventions (`gen_ai.*`), so they render natively
in the Latitude trace viewer. Content-bearing attributes are tagged `:gated` and dropped
before export when content capture is disabled. The plugin is **fail-open** — a telemetry
error never affects the agent — and depends only on the Python standard library (plus
`certifi`, which Hermes already ships, for TLS verification).

## Configuration

All configuration is read from environment variables:

| Env | Default | Description |
|-----|---------|-------------|
| `LATITUDE_API_KEY` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `https://ingest.latitude.so` | Ingest origin (no path; the plugin appends `/v1/traces`). Set to your own ingest for self-hosted/local, e.g. `http://localhost:3002` |
| `LATITUDE_HERMES_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `true` | Master switch |
| `LATITUDE_HERMES_NO_CONTENT` / `LATITUDE_NO_CONTENT` | `false` | Export structure/timing only (no prompts, responses, or tool I/O) |
| `LATITUDE_DEBUG` | `false` | Verbose logging |

Telemetry stays off until both `LATITUDE_API_KEY` and a project are set.

## Development

```bash
uv sync
uv run pytest
```

## License

MIT
