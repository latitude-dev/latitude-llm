# Hermes telemetry

Stream [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research's open-source agent harness) runs into Latitude as traces. After setup, each Hermes turn appears in your project's **Traces** view with user prompts, model turns, tool calls and results, the tools the agent was offered, memory reads and writes, delegated subagents, token usage, cost, timing, and the real system prompt that reached the model.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- Hermes Agent installed locally
- `pip` (Hermes already runs on Python — the plugin uses only the standard library plus `certifi`, which Hermes already ships)

## Install

1. In Latitude, copy your project slug from the project sidebar.
2. Create or copy an API key from **Settings → API Keys**.
3. Install the plugin:

```bash
pip install latitude-telemetry-hermes
```

4. Enable it by adding `latitude` to the enabled-plugins list in `~/.hermes/config.yaml`, and turn on Hermes's reasoning-delta forwarding so time-to-first-token is measurable:

```yaml
plugins:
  enabled:
    - latitude
  stream_reasoning_deltas: true
```

<Note>
  **`stream_reasoning_deltas: true` is required for time-to-first-token.** It is Hermes's own
  setting, off by default, and without it TTFT is missing from most spans — see
  [Time to first token](#time-to-first-token).
</Note>

Hermes discovers the plugin through the `hermes_agent.plugins` entry point — there are no files to copy.

<Note>
  **Enable via `config.yaml`, not `hermes plugins enable latitude`.** Hermes's runtime loads
  pip/entry-point plugins, but its `hermes plugins list`/`enable`/`disable` commands scan only
  bundled and `~/.hermes/plugins/` directory plugins — so they report a pip-installed plugin as
  **"not installed or bundled"** even though it loads fine ([hermes-agent#23802](https://github.com/NousResearch/hermes-agent/issues/23802)).
  The `config.yaml` entry above is the reliable way to turn it on.
</Note>

<Note>
  The plugin must be installed into the **same Python that runs Hermes**. The official installer
  puts Hermes in its own venv (`~/.hermes/hermes-agent/venv`) that ignores your shell's Python, so
  a plain `pip install` from another interpreter (system, pyenv, mise, …) won't be discovered.
  Install into Hermes's venv instead:

  ```bash
  ~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python latitude-telemetry-hermes
  ```
</Note>

5. Set your credentials in the environment, or add them to `~/.hermes/.env` (Hermes loads it at startup):

```bash
LATITUDE_API_KEY=lat_xxx
LATITUDE_PROJECT=your-project-slug
```

<Note>
  The plugin sends to Latitude Cloud (`https://ingest.latitude.so`) by default. If you
  run a **self-hosted or local** Latitude, also set `LATITUDE_BASE_URL` to your ingest
  **origin only** — for example `http://localhost:3002` on a local dev stack — with no
  `/v1/traces` suffix (the plugin appends it). The API key and project slug must belong
  to that same instance.
</Note>

## Verify

Run Hermes and send a message to your agent, then open your Latitude project and go to **Traces**. The new trace should appear within a few seconds.

If nothing arrives, set `LATITUDE_DEBUG=true` in `~/.hermes/.env` and run again to see the plugin's logging: it logs every export with its HTTP status. (`hermes plugins list` does **not** show pip-installed plugins — see the install note — so it can't be used to confirm the plugin is loaded.)

## Structural-only telemetry

If you want trace structure without prompt, response, or tool content, set:

```bash
LATITUDE_NO_CONTENT=true
```

Structural-only traces still include timing, model, token usage, and run structure. Message content, tool input/output and memory bodies are omitted. For finer control — keeping content but masking one attribute — see [Privacy](#privacy).

## Disable or uninstall

To pause telemetry without removing anything, set the environment variable in `~/.hermes/.env`:

```bash
LATITUDE_HERMES_TELEMETRY_ENABLED=0
```

To stop Hermes loading the plugin at all, remove `latitude` from `plugins.enabled` in `~/.hermes/config.yaml`. (`hermes plugins disable latitude` doesn't work for pip-installed plugins — see the install note.)

To remove the integration entirely, drop it from `plugins.enabled` and uninstall the package:

```bash
pip uninstall latitude-telemetry-hermes
```

(Your `~/.hermes/.env` credentials are left in place so a re-install is one step.)

## Configuration

Every setting can be given in **two** places, and the environment wins:

- an environment variable — in your shell or in `~/.hermes/.env`;
- a key under `plugins.entries.latitude.settings` in `~/.hermes/config.yaml`.

Both files are **per profile** (`~/.hermes/profiles/<name>/`), so if you give each agent its own Hermes profile, each one gets its own credentials, tags and metadata with no environment juggling.

```yaml
# ~/.hermes/config.yaml
plugins:
  enabled:
    - latitude
  entries:
    latitude:
      settings:
        api_key: lat_xxx
        project: my-project
        service_name: alescript        # optional; default "hermes-agent"
        agent:
          name: alescript
          version: 2.1.0
        tags: [prod, eu-west]
        metadata:
          deployment: staging
          owner: platform-team
```

### Credentials and transport

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_API_KEY` | `api_key` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | `project` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `base_url` | `https://ingest.latitude.so` | Ingest origin (no path; the plugin appends `/v1/traces`). Set to your own ingest for self-hosted/local, e.g. `http://localhost:3002` |

Telemetry stays off until both an API key and a project are set.

### Switches

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_HERMES_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `enabled` | `true` | Master switch |
| `LATITUDE_DEBUG` | `debug` | `false` | Verbose logging, including every export's HTTP status |

### Content

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_HERMES_NO_CONTENT` / `LATITUDE_NO_CONTENT` | `no_content` | `false` | Export structure and timing only — no prompts, responses, tool I/O or memory bodies |
| `LATITUDE_HERMES_MAX_CONTENT_CHARS` | `max_content_chars` | `262144` | Per-attribute size budget. A larger conversation is truncated from the middle, with the omission marked in the exported messages |

### Privacy

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_HERMES_REDACT_SECRETS` | `redact_secrets` | `true` | Run exported content through Hermes's own secret redactor |
| `LATITUDE_HERMES_REDACT_ATTRIBUTES` | `redact_attributes` | — | Comma-separated attribute keys whose value never leaves the machine. Each is an exact key or a `/regex/flags` pattern |
| `LATITUDE_HERMES_REDACT_MASK` | `redact_mask` | `******` | Replacement for a redacted attribute value |

### Features

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_HERMES_MEMORY` | `memory` | `true` | Emit memory spans for the built-in stores |
| `LATITUDE_HERMES_MEMORY_CONTENT` | `memory_content` | `true` | Include memory record bodies |
| `LATITUDE_HERMES_TOOL_DEFINITIONS` | `tool_definitions` | `true` | Emit the tool definitions the agent is equipped with |
| `LATITUDE_HERMES_STREAM_TTFT` | `stream_ttft` | `true` | Subscribe to stream deltas to measure time-to-first-token. Hermes builds one small payload per token while this is on, so set it to `0` if you would rather not pay that. See the note on TTFT coverage below |
| `LATITUDE_HERMES_AUX_USAGE` | `aux_usage` | `true` | Recover the token usage of Hermes's auxiliary model calls (approvals, context compaction, title generation), which fire no plugin hooks |

### Identity and grouping

| Env | `config.yaml` key | Default | Description |
|-----|-------------------|---------|-------------|
| `LATITUDE_HERMES_AGENT_NAME` | `agent.name` | the profile name, unless it is `default` | Names the agent: a tag, plus `gen_ai.agent.name` |
| `LATITUDE_HERMES_AGENT_VERSION` | `agent.version` | — | Adds the version as its own tag, plus version metadata |
| `LATITUDE_HERMES_SERVICE_NAME` | `service_name` | `hermes-agent` | OTLP `service.name` — the **Service** column, breakdown and filter |
| `LATITUDE_HERMES_TAGS` / `LATITUDE_TAGS` | `tags` | — | Extra tags: comma-separated or a JSON array. Appended to the derived ones, never replacing them |
| `LATITUDE_HERMES_METADATA` / `LATITUDE_METADATA` | `metadata` | — | Extra metadata: a JSON object, or `key=value` pairs |

## How it works

Hermes loads pip-installed plugins via the `hermes_agent.plugins` entry point and calls the module's `register(ctx)`, which subscribes to its lifecycle hooks: `pre_api_request` / `post_api_request` / `api_request_error`, `pre_llm_call` / `post_llm_call`, `pre_tool_call` / `post_tool_call`, `on_stream_start` / `on_stream_delta` / `on_stream_end`, `on_session_start` / `on_session_end` / `on_session_reset` / `on_session_finalize`, and `subagent_start` / `subagent_stop`.

Each Hermes turn becomes one trace:

```
interaction                      one user turn
├── search_memory                what the agent remembered coming in (once per session)
├── llm_request                  one per model call: model, tokens, cost, TTFT, system prompt, tool definitions
├── tool_call:terminal           one per tool call: arguments, result, success, duration
├── tool_call:memory
│   └── upsert_memory            what the agent wrote to memory
└── tool_call:delegate
    └── interaction              a delegated subagent, nested under the call that spawned it
```

Spans follow Latitude's GenAI semantic conventions (`gen_ai.*`), so they render natively in the trace viewer. Spans are shipped as they finish, batched, and retried on transient ingest errors. The plugin is **fail-open**: a telemetry error never affects your agent, and it depends only on the Python standard library plus `certifi`, which Hermes already ships.

## Running several agents in one project

Send every agent to the same project and tell them apart with tags. The plugin derives these automatically:

| Tag | Where it comes from |
|-----|---------------------|
| `hermes` | Always — so Hermes traces stay identifiable in a project that also receives other harnesses |
| the platform | `cli`, `slack`, `discord`, `cron`, … |
| the agent name | `agent.name`, or the Hermes profile name when it isn't `default` |
| the agent version | `agent.version` — e.g. `2.1.0` |
| `cron:<job>` | Scheduled runs, from the cron job id |
| `subagent:<role>` | Traces that delegated to a subagent |

Add your own with `tags` / `metadata`; yours are appended to the derived ones, never replacing them.

**Recommended layout for several agents:** give each agent its own Hermes profile (sessions, memory and credentials are then already isolated), set `agent.name` and `agent.version` in each profile's `config.yaml`, and set `service_name` only if you want the **Service** column to read as the agent rather than the harness.

**Comparing two versions of one agent.** The version lands on two surfaces on purpose, because they answer different questions:

- **The tag** is a breakdown dimension, so one analytics query gives you a row per version:
  `queryAnalytics { stream: "sessions", metric: { kind: "avg", field: "cost" }, breakdown: "tag" }`.
  It is also a session filter, so an **experiment** with `tags contains 2.2.0` against a baseline of `tags contains 2.1.0` gives you a two-variant score comparison. (If several agents in the project could share a version string, combine it with the agent-name tag.)
- **The metadata key** `metadata.hermes.agent.version` is filter-only, and stays clean when you have dozens of versions and don't want dozens of tags.

## Memory

If your agent uses Hermes's built-in memory, its reads and writes appear as memory operations on the **Memory** page and in each session's memory footprint.

- The store is `hermes/<profile>`, with one record per store file: `MEMORY.md` and `USER.md`.
- Memory enters the system prompt as a frozen snapshot at session start, so it is recorded as **one read per session**.
- A write is recorded after the `memory` tool call succeeds, by reading the file back off disk — so the recorded body is exactly what landed. Latitude turns the sequence of bodies into a diff view and per-entry history.
- Turn it off with `LATITUDE_HERMES_MEMORY=0`, or keep the structure without the bodies with `LATITUDE_HERMES_MEMORY_CONTENT=0`.
- If you have configured an external memory provider (Mem0, Supermemory, Honcho, …) in `config.yaml`, the built-in files are no longer the live store and memory telemetry turns itself off.

## Identified users

On a gateway platform (Slack, Discord, …) each turn carries the platform's member id as the user, so per-user analytics and the Users page work. Hermes only exposes that id to plugins — no display name, no email — so that is what you see. When a platform uses an email address as its user id, the email is recorded too.

## Time to first token

`isStreaming` is set on every streaming call. **Time-to-first-token needs one setting in Hermes's own config**, because Hermes decides which streamed tokens reach a plugin:

```yaml
# ~/.hermes/config.yaml
plugins:
  stream_reasoning_deltas: true
```

Without it, TTFT is missing from most spans. Hermes streams a turn's visible text through a path that does not notify plugins whenever the turn ends in a tool call — which is most turns for a coding agent — so the only tokens a plugin reliably sees are reasoning tokens, and those are not forwarded until this setting is on. With it on, TTFT lands on the great majority of calls: in our own dogfood session, **51 of 53** model calls reported it, ranging from 1.2 s to 13.1 s.

This is a Hermes-side limitation, not a plugin setting, so there is nothing to configure on the Latitude side. `LATITUDE_HERMES_STREAM_TTFT=0` disables our subscription entirely if you would rather not pay for the per-token hook at all.

## Token usage and cost

Hermes's `/usage` and Latitude will not show the same numbers, and neither is wrong:

- **Background reviews.** A background review runs a full conversation loop on its own agent object in a separate thread. Latitude sees those calls; `/usage` reads the main agent's counters, so it doesn't. Latitude = main loop + background reviews.
- **Reasoning tokens.** Hermes's "Output tokens" includes reasoning; Latitude shows output and reasoning as separate figures.
- **Auxiliary calls.** Approvals, context compaction and title generation don't fire plugin hooks. Latitude recovers their usage from Hermes's own per-task ledger at the end of each session, so session totals match `session_model_usage` in `~/.hermes/state.db` — the arbiter if you ever want to check by hand.
- **Cost on a subscription route.** On an OAuth/subscription route Hermes reports the call as *included* at $0, while Latitude shows the equivalent list price from its model catalog. The span records which regime it was in, so the figure is explainable rather than mysterious.

## Captured data and privacy

By default Latitude receives what it needs to reconstruct a Hermes run: prompts, responses, the system prompt, tool definitions, tool input and output, memory record bodies, model metadata, token usage and timing.

**Secret redaction is on by default.** Everything content-bearing goes through Hermes's own secret redactor on the way out, with URL-credential redaction enabled — so an API key echoed by a terminal tool is masked before it leaves the machine. Turn it off with `LATITUDE_HERMES_REDACT_SECRETS=0` if you'd rather see raw values. If the redactor can't be loaded, the span says so (`hermes.redaction.applied=false`) rather than quietly claiming protection it didn't apply.

**Keeping a specific attribute local.** `LATITUDE_HERMES_REDACT_ATTRIBUTES` replaces the whole value of any attribute you name — for example `gen_ai.memory.records,gen_ai.tool.call.result`, or a pattern like `/^gen_ai\.tool\.call\./`. The attribute is still sent, with its value masked, so you can see what the plugin exported.

**Structure only.** `LATITUDE_NO_CONTENT=true` drops every content-bearing attribute: you keep timing, model, token usage and run structure, and lose prompts, responses, tool I/O and memory bodies.

Telemetry runs for each turn until disabled or uninstalled. Disable it before working with material you do not want sent to Latitude.

## Troubleshooting

**No traces appear.** Confirm `latitude` is in `plugins.enabled` in `~/.hermes/config.yaml` (`hermes plugins list` never shows a pip-installed plugin — see the install note), check that the API key and project slug are correct, then set `LATITUDE_DEBUG=true` and send a new message: the plugin logs each export and its HTTP status.

**Need more diagnostics.** Set `LATITUDE_DEBUG=true` in `~/.hermes/.env` and trigger another run.

**Traces show timing but no content.** Structural-only mode is enabled. Remove `LATITUDE_NO_CONTENT` from `~/.hermes/.env`.

**A value looks masked.** Secret redaction is on by default; `LATITUDE_HERMES_REDACT_SECRETS=0` turns it off. A value that is exactly `******` was matched by `LATITUDE_HERMES_REDACT_ATTRIBUTES`.

**Memory operations are missing.** Check that the agent actually wrote memory in the session, that `LATITUDE_HERMES_MEMORY` isn't `0`, and that `config.yaml` doesn't configure an external `memory.provider` — that turns built-in memory telemetry off.
