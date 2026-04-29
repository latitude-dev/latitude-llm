# @latitude-data/openclaw-telemetry

OpenClaw plugin that streams every agent run to [Latitude](https://latitude.so) as OTLP traces. Full fidelity — exact system prompt, message history, assistant output, token usage, tool I/O, and the running agent's name on every span.

## Install

Requires OpenClaw **2026.4.25 or newer** on PATH. Older versions are detected up-front and the installer aborts with an upgrade message.

```bash
npx -y @latitude-data/openclaw-telemetry install
openclaw gateway restart
```

The installer prompts for your Latitude API key and project slug, then:

1. Verifies your OpenClaw version (aborts on `< 2026.4.25`).
2. Hands plugin placement to OpenClaw via `openclaw plugins install <package-path> --force`. OpenClaw copies files into `~/.openclaw/extensions/<id>/`, writes the install record to `~/.openclaw/plugins/installs.json`, and creates the `plugins.entries[id]` block.
3. Layers our config on top in `~/.openclaw/openclaw.json`:
   - **`config.*`** — credentials, baseUrl, and `allowConversationAccess` (the payload-content gate the plugin's runtime reads).
   - **`hooks.allowConversationAccess`** — the dispatch gate OpenClaw's runtime checks before forwarding LLM/tool/agent events to non-bundled plugins. Always mirrored to the same value as `config.allowConversationAccess`.
4. Adds the plugin id to `plugins.allow` (running `npx install` is the trust signal). Pass `--no-trust` to opt out.

Traces show up at `https://console.latitude.so/projects/<your-slug>` once the gateway restarts.

### Install flags

| Flag | What it does |
| --- | --- |
| `--api-key=<key>` | Pass the API key instead of being prompted. |
| `--project=<slug>` | Pass the project slug instead of being prompted. |
| `--staging` | Target `https://staging.latitude.so` / `https://staging-ingest.latitude.so`. |
| `--dev` | Target `http://localhost:3000` / `http://localhost:3002`. |
| `--yes` / `--no-prompt` | Skip all prompts. Required for non-TTY / CI invocations. |
| `--no-content` | Skip raw prompt/response/tool I/O capture. Spans still emit with timing, token usage, model name, and ids. Mirrored into both `config.allowConversationAccess` and `hooks.allowConversationAccess`. |
| `--no-trust` | Skip auto-adding the plugin id to `plugins.allow`. OpenClaw will keep printing `plugins.allow is empty` warnings until you add it manually. |

Re-running `install` is idempotent — credentials/baseUrl are overwritten from prompts, but hand-edited `enabled`, `debug`, and `allowConversationAccess` values in `openclaw.json` are preserved unless you pass the corresponding flag.

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry uninstall
```

Shows a plan, asks for confirmation, then runs `openclaw plugins uninstall @latitude-data/openclaw-telemetry --force` (which removes files, the install record, the plugin entry, and the `plugins.allow` entry). Defensive cleanup follows for any leftover keys, with a backup at `openclaw.json.latitude-bak`.

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

- **`agent`** — root of the run. Carries `openclaw.session.key`, `openclaw.agent.id`, `openclaw.agent.name`, aggregated token usage across all generations, run duration, success/error status, the first user prompt, and the full final message list. This is where attempt-aggregate `gen_ai.*` lands.
- **`model_call`** — one per actual provider API call inside the run. Carries provider, request/response model, `openclaw.api`, `openclaw.transport`, per-call duration, outcome, error category, time-to-first-byte, request payload bytes, response stream bytes, upstream request id hash, and `gen_ai.input.messages` snapshotted at the moment that generation started. Per-call output messages and per-call token usage aren't surfaced by OpenClaw today (attempt-aggregate only); those stay on `agent`.
- **`tool_call:<name>`** — one per tool invocation. Canonical `gen_ai.tool.*` attributes: `name`, `call.id`, `call.arguments`, `call.result`. Sibling of `agent`, NOT child of `model_call` — tools run between generations, not during them.
- **`compaction`** — rare; fires when OpenClaw hits the message budget mid-run. Records before/after message counts and the compacted-out count.
- **`subagent`** — one per child run spawned by this agent. The child's entire `agent` subtree (its own `model_call`s, `tool_call`s, even further-nested `subagent`s) parents itself underneath via cross-runId trace propagation, so a spawn tree is one waterfall in one trace.

Every span carries `openclaw.agent.id` and `openclaw.agent.name`. Multi-agent setups produce spans tagged with the invoking agent's id, letting you filter and group by agent in the Latitude UI.

All spans share the same `traceId` so they group as one trace per agent run (and one trace per spawn tree, by virtue of the subagent linkage).

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

The hook system runs handlers fire-and-forget (see [`src/plugins/hooks.ts`](https://github.com/openclaw/openclaw/blob/main/src/plugins/hooks.ts) upstream), so nothing we do here can slow the agent loop. The one exception is `before_tool_call`, which is a `runModifyingHook` — our handler returns `undefined` so OpenClaw dispatches the tool normally. Returning anything else (e.g. `{block: true}`) would block every tool call.

**No runtime wrapping.** Unlike third-party OpenClaw observability plugins that try to monkey-patch `@mariozechner/pi-ai` (and run into jiti's CJS/ESM module isolation), we stay inside the supported plugin API. The hooks give us everything, at lower risk of breaking on OpenClaw updates.

## Configuration reference

The installer writes two blocks to `plugins.entries["@latitude-data/openclaw-telemetry"]`:

### `.config` — read by the plugin's runtime

| Key | Required | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | yes | — | Bearer token for Latitude ingestion. |
| `project` | yes | — | Slug of the project to route traces into. |
| `baseUrl` | no | `https://ingest.latitude.so` | Override OTLP ingest origin. Installer sets this only when you pass `--staging` or `--dev`. |
| `allowConversationAccess` | no | `false` | When `true`, attach raw prompts, assistant responses, system instructions, and tool I/O to spans. When `false`, emit only timing, token usage, model name, agent id, and structural ids — same span tree, scrubbed payloads. **Must match `hooks.allowConversationAccess` below — see "the two flags".** |
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

For *this* plugin, we always couple them — the installer writes both from the same source. If you hand-edit, set them to the same value:

- **Both `true`**: full content capture (the default).
- **Both `false`**: structural-only telemetry (set via `--no-content`).
- Anything else is incoherent: `hooks: false + config: true` means dispatch is off and content gating is moot; `hooks: true + config: false` works but is what you'd get with both `false` plus extra ceremony.

### Environment variable fallbacks

If a `config.*` key isn't set, the runtime falls back to env vars on the gateway process: `LATITUDE_API_KEY`, `LATITUDE_PROJECT`, `LATITUDE_BASE_URL`, `LATITUDE_DEBUG`, `LATITUDE_OPENCLAW_ENABLED`. The installer doesn't set them — pluginConfig is the canonical surface — but they're useful for flipping `debug` without editing `openclaw.json`.

### Manual installation

If you can't run the installer, do exactly what it does:

1. **Hand placement to OpenClaw** with `openclaw plugins install <path-to-extracted-package> --force`. This is what populates `~/.openclaw/extensions/`, writes the install record, and creates the (initially empty) `plugins.entries[id]` block. Don't hand-place files into the extensions directory — the persisted plugin index won't see them.
2. **Add the config + hooks block** to `~/.openclaw/openclaw.json`:

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
          "project": "my-openclaw-project",
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

Run `openclaw config validate` — should print `valid: true`. Then `openclaw gateway restart`.

## Privacy

There are two defaults at play — keep them straight:

- **Installer default**: when you run `npx -y @latitude-data/openclaw-telemetry install` without `--no-content`, the installer writes `allowConversationAccess: true` to both the `hooks` and `config` blocks. **You get full content capture** — prompts, assistant responses, system instructions, tool I/O — shipped to Latitude alongside structural telemetry.
- **Runtime default for absent keys**: if you hand-write `openclaw.json` and leave `allowConversationAccess` out entirely, `config.allowConversationAccess` falls back to `false` at the plugin's runtime (privacy-preserving) and `hooks.allowConversationAccess` falls back to OpenClaw's default (also `false`, which means dispatch is blocked and you get nothing). **Manual installs without those keys produce no traces, not "structural-only traces".**

The installer always writes both keys to the same value, so the installer-driven path is unambiguous. The runtime-default trap only matters for hand-rolled configs.

When you pass `--no-content` (or hand-edit both flags to `false`), we emit the same span tree but scrub the content attributes (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.call.arguments`/`result`, the interaction's `user_prompt`). Timings, token usage, model name, agent name, ids, and the `latitude.captured.content: false` boolean still flow.

To pause emission entirely without uninstalling, set `LATITUDE_OPENCLAW_ENABLED=0` in the gateway environment, or set `enabled: false` on the plugin entry in `openclaw.json`.

## Supported OpenClaw versions

Requires OpenClaw **2026.4.25 or newer**. The installer detects the version up-front via `openclaw --version` and aborts with an upgrade message on older versions — supporting the full range with portability shims would mean shipping known-broken behaviour (≤ 2026.4.21 reject `hooks.allowConversationAccess` outright; 2026.4.22 – 2026.4.24 have unverified dispatch gating). Run `npm install -g openclaw@latest` to upgrade.

## How it fails

Fail-open by design. If the API is unreachable, your key is wrong, or a hook payload is malformed, the plugin logs to stderr (when `LATITUDE_DEBUG=1`) and the agent run continues unaffected.

## License

MIT
