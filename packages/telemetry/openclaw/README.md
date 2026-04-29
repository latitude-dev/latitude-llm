# @latitude-data/openclaw-telemetry

OpenClaw plugin that streams every agent run to [Latitude](https://latitude.so) as OTLP traces — full system prompt, message history, assistant output, token usage, tool I/O, and the running agent's name on every span.

## Requirements

- **OpenClaw 2026.4.25 or newer** on PATH.
- A **Latitude API key** and **project slug** — both from [console.latitude.so/settings/api-keys](https://console.latitude.so/settings/api-keys).

## Install

### Recommended — one-shot CLI

The companion CLI handles every step (install, config, validate, restart) in one command:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install
```

It prompts for your API key and project slug, runs `openclaw plugins install` for you, writes the plugin entry into `openclaw.json`, adds the plugin to `plugins.allow`, validates the result, and (on TTY) offers to restart the gateway. See the [CLI README](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw-cli#readme) for the full flag matrix, dry-run mode, custom config dir, and CI usage.

### Manual install

If you'd rather not use the CLI, do exactly what it does, in four steps:

#### 1. Install the runtime

```bash
openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7
```

Pin to an exact version. OpenClaw's `security audit --deep` warns about unpinned install specs, so always include the `@<version>` suffix.

OpenClaw fetches from npm, runs its security scan, copies files into `~/.openclaw/extensions/<id>/`, and creates a (disabled) `plugins.entries["@latitude-data/openclaw-telemetry"]` entry in `~/.openclaw/openclaw.json`.

#### 2. Configure and enable

Run these `openclaw config set` commands (use bracket notation so the scoped package name parses correctly). Substitute your real API key and project slug:

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.apiKey' "lat_xxx"
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.project' "my-project-slug"
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.allowConversationAccess' true
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].hooks.allowConversationAccess' true
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].enabled' true
```

Both `allowConversationAccess` writes are required — see [The two flags](#the-two-flags).

#### 3. Add to `plugins.allow` (optional but recommended)

OpenClaw warns at every gateway restart about non-bundled plugins that auto-load without provenance via `plugins.allow`. Silence the warning:

```bash
# `config set` can't append to arrays — set the whole list. Include any other
# plugins you already have in `plugins.allow`.
openclaw config set 'plugins.allow' '["@latitude-data/openclaw-telemetry"]'
```

#### 4. Restart the gateway

```bash
openclaw gateway restart
```

Verify everything's wired:

```bash
openclaw config validate --json
# → {"valid": true, ...}

grep -E "blocked|plugin not found|latitude" /tmp/openclaw/openclaw-*.log | tail
# → ready (N plugins: ..., @latitude-data/openclaw-telemetry, ...)
# → no "blocked", no "plugin not found"
```

Send a message to one of your OpenClaw agents — within seconds, traces appear at `https://console.latitude.so/projects/<your-slug>`.

#### Or: hand-edit `~/.openclaw/openclaw.json`

Equivalent to steps 2 + 3 in one paste:

```jsonc
{
  "plugins": {
    "allow": ["@latitude-data/openclaw-telemetry"],
    "entries": {
      "@latitude-data/openclaw-telemetry": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        },
        "config": {
          "apiKey": "lat_xxx",
          "project": "my-project-slug",
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

Merge with whatever else is in `openclaw.json`. Then run `openclaw config validate` and `openclaw gateway restart`.

## Uninstall

If you installed via the CLI:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 uninstall
```

Manual uninstall:

```bash
openclaw plugins uninstall @latitude-data/openclaw-telemetry --force
openclaw gateway restart
```

OpenClaw removes the extension files, install record, plugin entry, and the `plugins.allow` entry.

## Targeting staging or local dev

By default the plugin sends to production (`https://ingest.latitude.so`). Override `baseUrl` to point elsewhere:

```bash
# Staging
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.baseUrl' \
  "https://staging-ingest.latitude.so"

# Local dev
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.baseUrl' \
  "http://localhost:3002"
```

The CLI handles this with `--staging` / `--dev` flags.

## Structural-only telemetry (no content capture)

To get trace metadata (timings, token usage, model name, agent name, ids) without prompt/response content, keep `hooks.allowConversationAccess` at `true` so events still dispatch, and set only `config.allowConversationAccess` to `false`:

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.allowConversationAccess' false
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].hooks.allowConversationAccess' true
```

Setting `hooks.allowConversationAccess=false` would block dispatch entirely — see [The two flags](#the-two-flags). With this config the plugin still emits the full span tree, just with content attributes (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, tool args/results) scrubbed. Each span carries `latitude.captured.content: false` so the gate state is visible in the Latitude UI.

The CLI handles this with `--no-content`.

## What gets sent

For each agent run, the plugin emits one trace shaped like the actual run:

```
agent (root, traceId = hash(runId))
├─ compaction         (0..1, rare; budget-triggered)
├─ model_call         (1..N, one per provider API call)
├─ tool_call: foo     (between model_calls; sibling of agent)
├─ model_call
├─ tool_call: bar
├─ subagent           (0..N — the child's full agent tree nests under here)
│   └─ agent
│       ├─ model_call
│       └─ tool_call: ...
└─ model_call         (final)
```

Five span kinds:

- **`agent`** — root of the run. Carries `openclaw.session.key`, `openclaw.agent.id`, `openclaw.agent.name`, aggregated token usage across all generations, run duration, success/error status, the first user prompt, and the full final message list. Attempt-aggregate `gen_ai.*` lands here.
- **`model_call`** — one per provider API call inside the run. Carries provider, request/response model, `openclaw.api`, `openclaw.transport`, per-call duration, outcome, error category, time-to-first-byte, request payload bytes, response stream bytes, upstream request id hash, and `gen_ai.input.messages` snapshotted at the moment that generation started. Per-call output messages and per-call token usage aren't surfaced by OpenClaw today (attempt-aggregate only); those stay on `agent`.
- **`tool_call:<name>`** — one per tool invocation. Canonical `gen_ai.tool.*` attributes: `name`, `call.id`, `call.arguments`, `call.result`. Sibling of `agent`, NOT child of `model_call` — tools run between generations, not during them.
- **`compaction`** — rare; fires when OpenClaw hits the message budget mid-run. Records before/after message counts and the compacted-out count.
- **`subagent`** — one per child run spawned by this agent. The child's entire `agent` subtree (its own `model_call`s, `tool_call`s, even further-nested `subagent`s) parents itself underneath via cross-runId trace propagation, so a spawn tree is one waterfall in one trace.

Every span carries `openclaw.agent.id` and `openclaw.agent.name` — multi-agent setups produce spans tagged with the invoking agent's id, letting you filter and group by agent in the Latitude UI. All spans share the same `traceId`, so they group as one trace per agent run (and one trace per spawn tree, by virtue of the subagent linkage).

### Backend caveat: Codex / Claude-Code-style providers

OpenClaw's `model_call_started` / `model_call_ended` hooks fire from its `selection` layer, which wraps the agent's `streamFn` invocation. For "agentic" backends (Codex, Claude Code) the inner generations happen inside the backend's own loop and don't surface as separate `model_call` events. Result: a Codex-backed run shows ONE `model_call` per attempt instead of N. Anthropic and OpenAI direct don't have this issue. The fix is upstream in OpenClaw — out of scope for this plugin.

## How it works

We subscribe to OpenClaw's typed plugin hooks (`src/plugins/hook-types.ts` upstream). The model is "one span per paired before/after (or start/end) event":

| Span | Start hook | End hook |
| --- | --- | --- |
| `agent` | `before_agent_start` | `agent_end` |
| `model_call` | `model_call_started` | `model_call_ended` |
| `tool_call` | `before_tool_call` | `after_tool_call` |
| `compaction` | `before_compaction` | `after_compaction` |
| `subagent` | `subagent_spawned` | `subagent_ended` |

Two more hooks (`llm_input`, `llm_output`) are subscribed to for **content only** — they don't open or close spans, they just enrich the `agent` span with attempt-aggregate data and seed the rolling history snapshot used by per-call `model_call.gen_ai.input.messages`.

The hook system runs handlers fire-and-forget, so nothing we do here can slow the agent loop. The one exception is `before_tool_call`, which is a `runModifyingHook` — our handler returns `undefined` so OpenClaw dispatches the tool normally. Returning anything else (e.g. `{block: true}`) would block every tool call.

**No runtime wrapping.** We stay inside the supported plugin API rather than monkey-patching `@mariozechner/pi-ai`. The hooks give us everything, at lower risk of breaking on OpenClaw updates.

## Configuration reference

Two blocks live under `plugins.entries["@latitude-data/openclaw-telemetry"]`:

### `.config` — read by the plugin's runtime

| Key | Required | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | yes | — | Bearer token for Latitude ingestion. |
| `project` | yes | — | Slug of the project to route traces into. |
| `baseUrl` | no | `https://ingest.latitude.so` | Override OTLP ingest origin. The CLI sets this only when `--staging` or `--dev` is passed. |
| `allowConversationAccess` | no | `false` | When `true`, attach raw prompts, assistant responses, system instructions, and tool I/O to spans. When `false`, emit only timing, token usage, model name, agent id, and structural ids — same span tree, scrubbed payloads. **Must match `hooks.allowConversationAccess` below — see [The two flags](#the-two-flags).** |
| `enabled` | no | `true` | Set to `false` to pause emission without uninstalling. |
| `debug` | no | `false` | Log diagnostic lines to stderr (visible in the gateway log). |

### `.hooks` — read by OpenClaw's runtime

| Key | Required | Default | Description |
| --- | --- | --- | --- |
| `allowConversationAccess` | yes (on 2026.4.25+) | — | OpenClaw's hook dispatcher gates `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` events on this. When `false` or absent, every typed hook is blocked and the plugin never sees an event — which means no traces, with the gateway log showing `[plugins] typed hook "..." blocked because non-bundled plugins must set plugins.entries.<id>.hooks.allowConversationAccess=true`. |

### The two flags

`hooks.allowConversationAccess` and `config.allowConversationAccess` mean different things:

- **`hooks.*`** is the **dispatch gate**. `false` → OpenClaw never forwards events to us. No traces.
- **`config.*`** is the **payload-content gate**. `false` → we emit spans normally but scrub message content from them. Structural-only telemetry.

For *this* plugin we always couple them — the CLI writes both from the same source. If you hand-edit:

- **Both `true`**: full content capture (the default).
- `hooks: true` + `config: false`: structural-only telemetry (set via `--no-content`).
- `hooks: false` + anything: no traces. Don't.

### Environment-variable fallbacks

If a `config.*` key isn't set, the runtime falls back to env vars on the gateway process: `LATITUDE_API_KEY`, `LATITUDE_PROJECT`, `LATITUDE_BASE_URL`, `LATITUDE_DEBUG`, `LATITUDE_OPENCLAW_ENABLED`. Useful for flipping `debug` without editing `openclaw.json`.

## Privacy

The CLI's first-install default writes `allowConversationAccess: true` to both blocks → full content capture. Pass `--no-content` for structural-only telemetry.

For hand-edited configs, leaving `allowConversationAccess` out entirely produces **no traces** (not "structural-only traces") because `hooks.allowConversationAccess` defaults to `false` at OpenClaw's level and dispatch is blocked. Always set both keys explicitly.

To pause emission without uninstalling, set `enabled: false` on the plugin entry, or `LATITUDE_OPENCLAW_ENABLED=0` in the gateway environment.

## Supported OpenClaw versions

Requires **2026.4.25 or newer**. Earlier versions either reject `hooks.allowConversationAccess` outright (≤ 2026.4.21) or have unverified dispatch gating (2026.4.22 – 2026.4.24). The CLI's version check aborts on older versions; manual installs run into validation errors. Run `npm install -g openclaw@latest` to upgrade.

## How it fails

Fail-open by design. If the API is unreachable, your key is wrong, or a hook payload is malformed, the plugin logs to stderr (when `debug: true`) and the agent run continues unaffected.

## License

MIT
