import SkillsCallout from "/snippets/skills-callout.mdx"
import FirstArtifact from "/snippets/first-artifact.mdx"

# OpenClaw telemetry

Stream [OpenClaw](https://openclaw.ai) agent runs into Latitude as traces. After setup, every run appears in your project's **Traces** view with the user prompt and who sent it, the system prompt, each model call with its tokens, cost and time to first token, the tools the agent was offered and the ones it called, memory reads and writes, subagents and cron runs, grouped into one Latitude **session** per OpenClaw session. No Latitude account yet? Your agent can create a temporary one and do this whole setup with the [`latitude-setup` skill](/getting-started/skills), no signup.

<SkillsCallout />

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project, or none yet: your agent can create a temporary one with the [`latitude-setup` skill](/getting-started/skills), no signup, and fill in the values below
- OpenClaw 2026.8.1 or newer
- A Latitude **API key** and your **project slug** (project sidebar → **Settings → API Keys**)

## Install

The one-shot installer does everything: it installs the plugin into OpenClaw, writes the credentials into `~/.openclaw/openclaw.json`, validates the config and restarts the gateway.

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 install
```

Non-interactive, for a server or CI:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 install \
  --api-key="$LATITUDE_API_KEY" --project=your-project-slug --yes --restart
```

Prefer to do it by hand? The same four steps:

```bash
openclaw plugins install @latitude-data/openclaw-telemetry@0.1.0 --accept-capabilities

P='plugins.entries["@latitude-data/openclaw-telemetry"]'
openclaw config set "$P.config.apiKey" "lat_xxx"
openclaw config set "$P.config.project" "your-project-slug"
openclaw config set "$P.config.allowConversationAccess" true
openclaw config set "$P.hooks.allowConversationAccess" true
openclaw config set "$P.enabled" true
openclaw gateway restart
```

<Note>
  **Both `allowConversationAccess` keys are needed.** `hooks.allowConversationAccess` is OpenClaw's
  own gate: without it OpenClaw never hands the conversation to any third-party plugin, so nothing is
  exported at all. `config.allowConversationAccess` tells the plugin to include prompt, response,
  tool and memory content in what it sends; set it to `false` for structural-only telemetry.
</Note>

<Note>
  **`--accept-capabilities` is required on OpenClaw 2026.8+.** OpenClaw asks the operator to consent
  to every non-bundled plugin's declared surface. The installer passes the flag for you.
</Note>

## Verify

Send a message to one of your OpenClaw agents (from Slack, Telegram, the CLI, wherever it listens). Within a few seconds the run appears under **Traces**, and the conversation it belongs to under **Sessions**. To watch the plugin work, turn on its debug log and read the gateway log:

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.debug' true
openclaw gateway restart
grep latitude-openclaw /tmp/openclaw/openclaw-*.log | tail
```

You should see `enabled v0.1.0 ...` at startup and one `exported N spans` line per run.

## See what was captured

<FirstArtifact />

## What you get

One trace per agent run, shaped like the run itself:

```
interaction                  the turn: prompt, answer, outcome, sender
├── search_memory            what the agent remembered coming in (once per session)
├── llm_request              a model call: tokens, cost, TTFT, system prompt, tool definitions
├── tool_call:exec           a tool call: arguments, result, error
│   └── upsert_memory        a memory write made by that tool
├── tool_call:sessions_spawn
│   └── subagent             the delegated run, nested inside
├── compaction               a context compaction: the messages summarized and the summary
└── llm_request
```

- **Sessions.** Every span carries OpenClaw's session id, so a multi-turn conversation in a Slack channel or a DM is one Latitude session.
- **Users.** The sender of each user turn becomes the trace's user, so the **Users** page works for Slack, Telegram and other channels; the display name and handle are in metadata.
- **Cost.** Each model call reports OpenClaw's own cost, so a model Latitude does not price yet still shows what OpenClaw charged it at.
- **Tools.** The Tools page sees both the tools the agent was offered and the ones it called.
- **Memory.** `MEMORY.md`, `USER.md` and the `memory/` notes appear on the Memory page as the store `openclaw/<agent>`, with every write diffed and blamed to the run that made it.
- **Subagents and cron.** A delegated run nests under the tool call that spawned it, in the parent's session. Cron runs are tagged `cron:<job>`.
- **Compactions.** A context compaction is a model call whose input is the messages that were summarized and whose output is the summary. One triggered outside a turn is its own trace, named `compaction`.

Tags on every trace: `openclaw`, the channel (`slack`, `telegram`, ...), the agent id, `cron:<job>` and `subagent:<agent>` where relevant. Add your own with `config.tags` and `config.metadata`, and set `config.serviceName` to tell several OpenClaw deployments apart.

## Configuration

Everything lives under `plugins.entries["@latitude-data/openclaw-telemetry"].config` in `openclaw.json`; change a value with `openclaw config set` and restart the gateway.

| Key | Default | Description |
| --- | --- | --- |
| `apiKey` | — | Latitude API key (required) |
| `project` | — | Project slug (required) |
| `baseUrl` | `https://ingest.latitude.so` | Ingest origin for self-hosted or staging Latitude |
| `allowConversationAccess` | `false` | Include prompts, responses, system prompt, tool I/O and memory bodies |
| `serviceName` | `openclaw` | The Service axis in Latitude; one per deployment |
| `tags` | — | Extra tags (array or comma-separated) |
| `metadata` | — | Extra metadata (string map) |
| `memory` | `true` | Emit memory spans |
| `memoryContent` | `true` | Include memory bodies and queries |
| `toolDefinitions` | `true` | Attach the offered tool definitions to each model call |
| `maxContentChars` | `262144` | Per-attribute content budget; larger values are truncated from the middle |
| `redact` | — | `{ "attributes": ["key or /regex/"], "mask": "******" }` to mask attribute values before export |
| `enabled` | `true` | Set to `false` to pause without uninstalling |
| `debug` | `false` | Log diagnostics to the gateway log |

## OpenAI models and the Codex harness

OpenClaw runs `openai/*` models through its bundled Codex app-server by default, even with an API key. That harness reports one usage figure per turn, no per-call timing and no time to first token, and keeps subagents to itself, so traces are coarser: the plugin synthesizes the model calls from the transcript and measures first-token latency from the streamed reply. To get per-call usage, TTFB and subagent nesting for OpenAI models, keep them on OpenClaw's own runtime:

```bash
openclaw config set 'models.providers.openai.agentRuntime' '{"id":"openclaw"}'
openclaw gateway restart
```

Every trace says which harness produced it in `openclaw.harness.id`. Other providers already run on OpenClaw's runtime.

## Structural-only telemetry

Keep timing, tokens, cost and the run shape while sending no content:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 install --no-content
```

or set `config.allowConversationAccess` to `false` while leaving `hooks.allowConversationAccess` at `true`. Every span then carries `latitude.captured.content=false`.

## Disable or uninstall

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.enabled' false
openclaw gateway restart
```

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.1.0 uninstall
```

## OpenClaw's native OpenTelemetry exporter

OpenClaw also bundles a generic OTLP exporter (`@openclaw/diagnostics-otel`) that Latitude ingests. It is fine for a quick look at model calls and tool spans, but it redacts session, run and user ids by design ([openclaw/openclaw#91927](https://github.com/openclaw/openclaw/issues/91927)) and exports no system prompt, no tool definitions and no memory, so the Sessions, Users, Tools and Memory pages stay empty. If you use it, point it at `https://ingest.latitude.so/v1/traces` with the `Authorization: Bearer <key>` and `X-Latitude-Project: <slug>` headers and `protocol: "http/protobuf"`; the endpoint must be `https://`, since a plain `http://` gets a redirect OTLP exporters do not follow. Do not run both exporters at once: the same model call would be counted twice.

## Captured data and privacy

With content capture on, Latitude receives prompts, responses, system instructions, tool arguments and results, and memory file contents, alongside timing, token usage and cost. Content is only sent when `config.allowConversationAccess` is `true`. Use `config.redact` to mask specific attributes, `config.memoryContent=false` to keep memory operations without their bodies, or structural-only mode to send no content at all.

## Troubleshooting

**No traces appear.** Run the verify grep above. `unknown typed hook ... ignored` means the plugin is older than the OpenClaw it runs on: upgrade with the installer. `typed hook "llm_input" blocked` means `hooks.allowConversationAccess` is not `true`. `requires capability consent` means the plugin was installed without `--accept-capabilities`: run `openclaw plugins enable @latitude-data/openclaw-telemetry --accept-capabilities`.

**Traces show timing but no content.** `config.allowConversationAccess` is `false`.

**`hooks.allowConversationAccess is not true` in the log.** OpenClaw is withholding the conversation hooks from the plugin: set that key to `true` and restart.

**`ingest HTTP 401` in the log.** The API key does not belong to the project's organization.
