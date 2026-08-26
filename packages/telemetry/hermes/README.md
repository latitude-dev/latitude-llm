# latitude-telemetry-hermes

Stream [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research's
open-source agent harness) sessions to [Latitude](https://latitude.so) as OTLP traces —
user prompts, model turns, tool calls and results, the tools the agent was offered,
memory reads and writes, delegated subagents, token usage, cost and timing, and the real
system prompt — so you get full-fidelity observability of your agent runs in Latitude.

This is the Hermes counterpart to the other harness integrations
([`@latitude-data/claude-code-telemetry`](../claude-code),
[`@latitude-data/pi-telemetry`](../pi),
[`@latitude-data/openclaw-telemetry`](../openclaw)). Hermes is a Python harness and loads
plugins from Python, so this connector ships as a **pip package** rather than npm.

## Install

```bash
pip install latitude-telemetry-hermes
```

Then enable the plugin by adding `latitude` to `~/.hermes/config.yaml`, plus Hermes's
reasoning-delta forwarding so time-to-first-token is measurable:

```yaml
plugins:
  enabled:
    - latitude
  stream_reasoning_deltas: true
```

> **`stream_reasoning_deltas: true` is required for TTFT.** It is Hermes's own setting, off by
> default. Hermes streams a turn's visible text through a path that does not notify plugins when the
> turn ends in a tool call — most turns, for a coding agent — so reasoning deltas are the only ones a
> plugin reliably sees, and they are not forwarded until this is on. With it on, TTFT landed on 51 of
> 53 model calls in our dogfood session.

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
Secret redaction is on by default: content passes through Hermes's own redactor on the way
out, so a token echoed by a terminal tool is masked before it leaves the machine.

> **Self-hosted / local Latitude?** The plugin defaults to Latitude Cloud
> (`https://ingest.latitude.so`). Point it at your own ingest by setting
> `LATITUDE_BASE_URL` to the ingest **origin only** — e.g. `http://localhost:3002`
> for a local dev stack — without the `/v1/traces` suffix (the plugin appends it).
> Your `LATITUDE_API_KEY` and `LATITUDE_PROJECT` must come from that same instance.

## Upgrade

```bash
~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python -U latitude-telemetry-hermes
```

Then **restart Hermes.** Python resolves entry-point plugins once at process start, so a running
Hermes keeps executing the version it loaded — the upgraded files sit on disk unread. A CLI session
picks the new version up on its next run; a long-running process never does.

The gateway is that long-running process, and it is normally supervised, so it will not restart
itself. On macOS the installer registers it with launchd:

```bash
launchctl list | grep -i hermes
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway
```

Spans exported before the restart keep the shape the old version gave them — nothing is rewritten
retroactively, so judge an upgrade on a new session.

## How it works

Hermes loads pip-installed plugins via the `hermes_agent.plugins` entry point and calls
the module's `register(ctx)` function, which subscribes to the lifecycle hooks —
`pre_api_request` / `post_api_request` / `api_request_error`, `pre_llm_call` /
`post_llm_call`, `pre_tool_call` / `post_tool_call`, `on_stream_start` /
`on_stream_delta` / `on_stream_end`, `on_session_start` / `on_session_end` /
`on_session_reset` / `on_session_finalize`, and `subagent_start` / `subagent_stop`. The
`*_api_request` family is the LLM-call span boundary; the `*_llm_call` pair frames the
turn; the stream hooks supply time-to-first-token; the session hooks bound the memory read
and flush the exporter so short / one-shot runs (`hermes -z "…"`) ship before the process
exits.

The plugin owns the **OTLP mapping** for that hook stream. It assembles one trace per
turn:

```
interaction (one user turn)
├── search_memory  (what the agent remembered coming in, once per session)
├── llm_request    (one per model call: model, tokens, cost, TTFT, system prompt, tool definitions)
├── tool_call:*    (one per tool call: arguments, result, success, duration)
│   └── upsert_memory  (a memory write, under the call that made it)
└── tool_call:delegate
    └── interaction    (a delegated subagent, nested under the call that spawned it)
```

Spans follow Latitude's GenAI semantic conventions (`gen_ai.*`), so they render natively
in the Latitude trace viewer. Content-bearing attributes are tagged `:gated` and dropped
before export when content capture is disabled. Spans are shipped as they finish, coalesced
into batches under a size ceiling, and retried on transient ingest errors. The plugin is
**fail-open** — a telemetry error never affects the agent — and depends only on the Python
standard library (plus `certifi`, which Hermes already ships, for TLS verification).

Hermes internals are imported only for what no hook exposes (memory paths, the tool
snapshot, the secret redactor, cost status), always guarded and always with a working
fallback, so a Hermes upgrade degrades one attribute rather than the plugin.

Design notes, hook payload traps, the usage reconciliation and the full attribute tables
live in [`dev-docs/hermes-telemetry.md`](../../../dev-docs/hermes-telemetry.md).

## Configuration

Every setting is readable from **two** places, the environment winning: the env var below,
or `plugins.entries.latitude.settings.<key>` in the active profile's `config.yaml`. Both
`config.yaml` and `.env` are profile-scoped, so one profile per agent gives each agent its
own credentials, tags and metadata. The `~/.hermes/…` paths here are the **default**
profile's; a named profile keeps its own pair under `~/.hermes/profiles/<name>/`.

```yaml
# ~/.hermes/config.yaml
plugins:
  enabled: [latitude]
  entries:
    latitude:
      settings:
        api_key: lat_xxx
        project: my-project
        agent: { name: alescript, version: 2.1.0 }
        tags: [prod, eu-west]
        metadata: { deployment: staging }
```

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_API_KEY` | `api_key` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | `project` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `base_url` | `https://ingest.latitude.so` | Ingest origin (no path; the plugin appends `/v1/traces`) |
| `LATITUDE_HERMES_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `enabled` | `true` | Master switch |
| `LATITUDE_DEBUG` | `debug` | `false` | Verbose logging, including each export's HTTP status |
| `LATITUDE_HERMES_NO_CONTENT` / `LATITUDE_NO_CONTENT` | `no_content` | `false` | Structure and timing only |
| `LATITUDE_HERMES_MAX_CONTENT_CHARS` | `max_content_chars` | `262144` | Per-attribute content budget; larger values are truncated from the middle |
| `LATITUDE_HERMES_REDACT_SECRETS` | `redact_secrets` | `true` | Run exported content through Hermes's secret redactor |
| `LATITUDE_HERMES_REDACT_ATTRIBUTES` | `redact_attributes` | — | Attributes whose **value** never leaves the machine; the key is still sent, masked. Exact key or `/regex/flags` |
| `LATITUDE_HERMES_REDACT_MASK` | `redact_mask` | `******` | Replacement for a redacted attribute value |
| `LATITUDE_HERMES_MEMORY` | `memory` | `true` | Emit memory spans for the built-in stores |
| `LATITUDE_HERMES_MEMORY_CONTENT` | `memory_content` | `true` | Include memory record bodies |
| `LATITUDE_HERMES_TOOL_DEFINITIONS` | `tool_definitions` | `true` | Emit the tool definitions the agent was offered |
| `LATITUDE_HERMES_STREAM_TTFT` | `stream_ttft` | `true` | Subscribe to stream deltas to measure TTFT |
| `LATITUDE_HERMES_AUX_USAGE` | `aux_usage` | `true` | Recover the usage of Hermes's auxiliary model calls |
| `LATITUDE_HERMES_AGENT_NAME` | `agent.name` | profile name unless `default` | Names the agent: a tag plus `gen_ai.agent.name` |
| `LATITUDE_HERMES_AGENT_VERSION` | `agent.version` | — | Adds the version as its own tag, plus version metadata |
| `LATITUDE_HERMES_SERVICE_NAME` | `service_name` | `hermes-agent` | OTLP `service.name` — the Service breakdown/filter axis |
| `LATITUDE_HERMES_TAGS` / `LATITUDE_TAGS` | `tags` | — | Extra tags, comma-separated or a JSON array; appended to the derived ones |
| `LATITUDE_HERMES_METADATA` / `LATITUDE_METADATA` | `metadata` | — | Extra metadata, a JSON object or `key=value` pairs |

Telemetry stays off until both an API key and a project are set.

Derived tags (`hermes`, the platform, the agent name, the agent version, `cron:<job>`,
`subagent:<role>`) make several agents in one project distinguishable, and make comparing
two versions of one agent a single analytics breakdown or a two-variant experiment. See
[the public docs](https://docs.latitude.so/telemetry/hermes) for the recipe.

## Development

```bash
uv sync
uv run pytest
```

## License

MIT
