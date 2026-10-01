# @latitude-data/openclaw-telemetry

OpenClaw plugin that streams every agent run to [Latitude](https://latitude.so) as OTLP traces: the user prompt and the sending user, the system prompt, every model call with its own tokens, cost and time to first token, the tools the agent was offered and the ones it called, memory reads and writes, subagents, cron runs and compactions, all grouped into one Latitude session per OpenClaw session.

This is the OpenClaw counterpart to the other harness integrations ([`latitude-telemetry-hermes`](../hermes), [`@latitude-data/claude-code-telemetry`](../claude-code), [`@latitude-data/pi-telemetry`](../pi)).

> OpenClaw also bundles a generic OpenTelemetry exporter (`@openclaw/diagnostics-otel`). It deliberately scrubs session, run and user ids ([openclaw/openclaw#91927](https://github.com/openclaw/openclaw/issues/91927)), exports no system prompt, no tool definitions and no memory, so it cannot produce Latitude sessions, users, tool rollups or the memory ledger. Use this plugin for full fidelity.

## Requirements

- **OpenClaw 2026.8.1 or newer** on PATH.
- A **Latitude API key** from `https://console.latitude.so/projects/<your-slug>/settings/keys` and the matching **project slug**.

## Install

### One-shot CLI

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 install
```

The installer prompts for the API key and project slug, runs `openclaw plugins install --accept-capabilities`, writes the plugin entry into `openclaw.json`, adds it to `plugins.allow`, validates the result and offers to restart the gateway. See the [CLI README](../openclaw-cli#readme) for flags, dry-run mode, custom config dir and CI usage.

### Manual install

```bash
openclaw plugins install @latitude-data/openclaw-telemetry@0.1.0 --accept-capabilities

P='plugins.entries["@latitude-data/openclaw-telemetry"]'
openclaw config set "$P.config.apiKey" "lat_xxx"
openclaw config set "$P.config.project" "my-project-slug"
openclaw config set "$P.config.allowConversationAccess" true
openclaw config set "$P.hooks.allowConversationAccess" true
openclaw config set "$P.enabled" true
openclaw gateway restart
```

`--accept-capabilities` records your consent to the plugin's declared surface; OpenClaw requires it for every non-bundled plugin. Both `allowConversationAccess` keys are required, see [The two flags](#the-two-flags). Optionally add the plugin id to `plugins.allow` to silence OpenClaw's provenance warning at startup (`config set` replaces the whole array, so include any ids already there).

Verify:

```bash
openclaw config validate --json
grep -E "latitude-openclaw|typed hook" /tmp/openclaw/openclaw-*.log | tail
```

With `config.debug` on, the gateway log shows `[latitude-openclaw] enabled v0.1.0 ...` at startup and one `exported N spans` line per run.

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 uninstall
# or
openclaw plugins uninstall @latitude-data/openclaw-telemetry --force && openclaw gateway restart
```

## What gets sent

One trace per agent run (a user turn, a cron run, a heartbeat, a subagent run):

```
interaction                              invoke_agent   prompt, final answer, outcome, sender
├── search_memory                        memory         the snapshot injected at session start, once per session
├── llm_request                          chat           tokens, cost, TTFT, system prompt, tool definitions, messages
├── tool_call:<name>                     execute_tool   arguments, result, error
│   └── search_memory | upsert_memory    memory         memory tools and memory file writes
├── tool_call:sessions_spawn
│   └── subagent                         spawn → ended, with the child run's interaction nested inside
├── compaction
└── llm_request
```

Every span carries the OpenClaw session id (`session.id`), the sender of a user turn (`user.id`), the agent (`gen_ai.agent.name`), derived tags and `openclaw.*` metadata. A subagent's spans join the parent's trace and session so one delegation reads as one conversation.

Per-call usage, cost, finish reason and output come from the run's transcript at `agent_end`, matched to each `model_call_started` / `model_call_ended` window by timestamp; OpenClaw's own cost is reported as the span's cost so a model missing from Latitude's catalog still shows a price. Tags are `openclaw`, the channel (`slack`, `telegram`, ...), the agent id, `cron:<job>` on cron runs and `subagent:<agent>` on a run that spawned one, plus whatever `config.tags` adds.

Design notes, hook traps and the full attribute tables live in [`dev-docs/openclaw-telemetry.md`](../../../dev-docs/openclaw-telemetry.md).

## Configuration

Everything lives under `plugins.entries["@latitude-data/openclaw-telemetry"]`.

### `.config` — read by the plugin

| Key | Default | Description |
| --- | --- | --- |
| `apiKey` | — | Latitude API key (required). |
| `project` | — | Project slug (required). |
| `baseUrl` | `https://ingest.latitude.so` | Ingest origin, without `/v1/traces`. |
| `allowConversationAccess` | `false` | Attach prompts, responses, system prompt, tool I/O and memory bodies. Must match `hooks.allowConversationAccess`. |
| `serviceName` | `openclaw` | OTLP `service.name`, the Service axis in Latitude. |
| `tags` | — | Extra tags, array or comma-separated string. |
| `metadata` | — | Extra metadata, string map. Keys starting with `openclaw.` are ignored. |
| `memory` | `true` | Emit memory spans. |
| `memoryContent` | `true` | Include memory bodies and queries on memory spans. |
| `toolDefinitions` | `true` | Attach the offered tool definitions to each model call. |
| `maxContentChars` | `262144` | Per-attribute content budget. Strings are truncated from the middle; message lists and tool definitions drop items from the middle so they still parse. |
| `redact` | — | `{ "attributes": ["exact key" or "/regex/flags"], "mask": "******" }`: mask selected attribute values before export, keeping the key. |
| `enabled` | `true` | Set to `false` to pause emission. |
| `debug` | `false` | Log diagnostics to the gateway log. |

### `.hooks` — read by OpenClaw

| Key | Description |
| --- | --- |
| `allowConversationAccess` | OpenClaw's dispatch gate for `llm_input`, `llm_output` and `agent_end`. When absent or `false`, those hooks are never registered for this plugin and no traces are produced. |

### The two flags

- `hooks.allowConversationAccess` is the **dispatch gate**: `false` means OpenClaw never forwards the conversation hooks, so nothing is exported.
- `config.allowConversationAccess` is the **content gate**: `false` means the full span tree still ships, with message, prompt, tool I/O and memory bodies removed and `latitude.captured.content=false` on every span.

Structural-only telemetry is therefore `hooks: true` plus `config: false` (the CLI's `--no-content`).

### Targeting staging or local dev

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.baseUrl' "https://staging-ingest.latitude.so"
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.baseUrl' "http://localhost:3002"
```

The CLI has `--staging` / `--dev` for the same.

## How it fails

Fail-open. An unreachable ingest, a bad key or a malformed hook payload is logged (with `debug: true`) and the agent run continues. Exports retry on `429`, `5xx` and network errors and never resend a span that was accepted.

## Development

```bash
pnpm --filter @latitude-data/openclaw-telemetry test
pnpm --filter @latitude-data/openclaw-telemetry build && (cd packages/telemetry/openclaw && npm pack)
openclaw plugins install npm-pack:/path/to/latitude-data-openclaw-telemetry-0.1.0.tgz --accept-capabilities --force
```

## License

MIT
