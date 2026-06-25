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
hermes plugins enable latitude
```

Hermes discovers the plugin automatically through the `hermes_agent.plugins` entry point —
there are no files to copy. Set your credentials in the environment (or in `~/.hermes/.env`,
which Hermes loads at startup):

```bash
export LATITUDE_API_KEY=lat_xxx
export LATITUDE_PROJECT=my-project
```

That's it — every session is now streamed to Latitude as OTLP traces. To export
structure and timing without prompt/response/tool content, set `LATITUDE_NO_CONTENT=true`.

## How it works

Hermes loads pip-installed plugins via the `hermes_agent.plugins` entry point and calls
the module's `register(ctx)` function, which subscribes to the lifecycle hooks
(`pre_api_request` / `post_api_request`, `pre_llm_call` / `post_llm_call`,
`pre_tool_call` / `post_tool_call`) — the same hooks the bundled `langfuse` plugin uses.

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
| `LATITUDE_BASE_URL` | `https://ingest.latitude.so` | Ingest endpoint |
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
