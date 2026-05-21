# Pi coding agent telemetry

Latitude provides a first-party pi coding agent telemetry package at `packages/telemetry/pi`, published as `@latitude-data/pi-telemetry`. It is both:

- a pi package whose extension listens to pi runtime events and emits Latitude-compatible OTLP traces; and
- a one-shot installer CLI (`latitude-pi`) that adds the package to pi settings and stores Latitude configuration.

The package replaces the generic third-party `mprokopov/pi-otel-telemetry` path when full Latitude trace reconstruction is required. It emits `span.type`, current OpenTelemetry GenAI semantic convention attributes, full prompt/assistant messages, and full tool input/output attributes so Latitude resolves pi activity as `prompt`, `chat`, and `execute_tool` operations rather than generic `unspecified` spans.

## User install model

The single-command install path is:

```bash
npx -y @latitude-data/pi-telemetry install
```

Non-interactive installs can provide credentials directly:

```bash
npx -y @latitude-data/pi-telemetry install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

The installer writes two files under the pi agent config directory (`$PI_CODING_AGENT_DIR` or `~/.pi/agent`):

| File | Purpose |
| --- | --- |
| `settings.json` | Adds the pi package source `npm:@latitude-data/pi-telemetry@<version>` to `packages`, replacing older Latitude pi telemetry entries. Pi auto-installs missing packages on startup. |
| `latitude-telemetry.json` | Stores `apiKey`, `project`, optional `baseUrl`, `enabled`, `allowConversationAccess`, tags, and metadata. The file is written with mode `0600` because it contains the Latitude API key. |

Restart pi after install so it can install and load the package. `/reload` is useful after changing config once the package is already installed, but startup is the reliable path for the first install.

The CLI also supports:

- `--staging` for `https://staging-ingest.latitude.so`
- `--dev` for local ingest at `http://localhost:3002`
- `--base-url=<url>` for a custom ingest base URL
- `--no-content` to keep structure/timing while scrubbing prompts, responses, tool arguments, tool results, system prompts, and full agent message snapshots
- `--allow-conversation` to force full content capture on
- `--pi-dir=<path>` to override the pi config directory
- `--dry-run` to print the proposed settings/config without writing
- `uninstall` to remove the package entry and config

Runtime environment variables override config-file values:

| Env var | Meaning |
| --- | --- |
| `LATITUDE_API_KEY` | API key used for ingest upload |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | Project slug sent as `X-Latitude-Project` |
| `LATITUDE_BASE_URL` | Ingest base URL, default `https://ingest.latitude.so` |
| `LATITUDE_PI_TELEMETRY_ENABLED=0` | Disable the extension for a pi process |
| `LATITUDE_DEBUG=1` | Log upload diagnostics to stderr and show a pi status indicator |
| `LATITUDE_PI_ALLOW_CONVERSATION_ACCESS` | `1`/`true`/`yes` enables gated content attributes |
| `LATITUDE_PI_NO_CONTENT` | `1`/`true`/`yes` disables gated content attributes |
| `LATITUDE_PI_USER_ID` | Overrides the `user.id` span attribute |
| `LATITUDE_PI_USER_EMAIL` / `PI_OTEL_USER_EMAIL` | Overrides user email resource/span attributes |
| `LATITUDE_PI_USER_NAME` / `PI_OTEL_USER_NAME` | Overrides user full-name resource/span attributes |

## Extension architecture

The extension is dependency-light and hand-rolls the OTLP JSON payload instead of using the OpenTelemetry JS SDK. This matches the Claude Code and OpenClaw telemetry packages: the payload subset is small, reload-safe, and avoids global provider ownership inside pi's extension runtime.

Runtime flow:

1. `session_start` reloads config and identity, then shows a small Latitude status indicator when enabled.
2. `before_agent_start` opens an `interaction` root span for the user prompt.
3. `turn_start` opens an `llm_request` span for the provider call.
4. `context` records the exact pi messages being sent to the provider as `gen_ai.input.messages`.
5. `before_provider_request` enriches the open LLM span with model/request parameters and tool definitions when present in the provider payload.
6. assistant `message_end` closes the `llm_request` span with `gen_ai.output.messages`, provider/model attributes, token usage, finish reason, and error state.
7. `tool_execution_start` / `tool_execution_end` create `tool_execution` spans as siblings of LLM spans under the interaction. Tool spans carry full `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` values when content capture is enabled.
8. `agent_end` closes abandoned spans defensively, enriches the interaction with aggregate assistant messages, builds one OTLP export request, and POSTs it to `${baseUrl}/v1/traces` with `Authorization: Bearer <apiKey>` and `X-Latitude-Project: <project>`.

The extension emits one Latitude trace per pi user prompt/agent run. All spans also carry `session.id` and `gen_ai.session.id`, so Latitude can group related traces into a session using pi's session id. This avoids the third-party extension's long-lived root session span that only flushed fully on pi shutdown.

## Trace shape

```text
interaction                         span.type=interaction → operation prompt
├── llm_request                     span.type=llm_request + gen_ai.operation.name=chat
├── tool_call:<toolName>            span.type=tool_execution + gen_ai.operation.name=execute_tool
├── llm_request                     next model call after tool results
└── tool_call:<toolName>
```

Tool spans are siblings of `llm_request` spans because tools run after a model call completes and before the next model call starts. Nesting tools under the model-call span would incorrectly imply the tool executed during the provider request.

## Latitude resolver contract

The package intentionally emits the attributes Latitude's OTLP resolvers already understand:

| Attribute | Purpose |
| --- | --- |
| `span.type=interaction` | Resolved to operation `prompt` by `packages/domain/spans/src/otlp/resolvers/operation.ts`. |
| `span.type=llm_request` | Claude-Code-compatible fallback and human-readable span typing. |
| `gen_ai.operation.name=chat` | Resolved to operation `chat`. |
| `gen_ai.operation.name=execute_tool` | Resolved to operation `execute_tool`. |
| `gen_ai.input.messages` / `gen_ai.output.messages` | Parts-based GenAI message arrays parsed by `parseGenAICurrent`. |
| `gen_ai.system_instructions` | Parts-based system prompt array. |
| `gen_ai.tool.definitions` | Tool definitions from provider payload when pi exposes them. |
| `gen_ai.provider.name` / `gen_ai.system` | Provider resolution. |
| `gen_ai.request.model` / `gen_ai.response.model` | Model and response-model resolution. |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, cache-token variants, `gen_ai.usage.total_tokens` | Token accounting. |
| `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | Tool detail reconstruction. |
| `latitude.tags` / `latitude.metadata` | JSON-string attributes parsed by enrichment resolvers. |
| `latitude.captured.content` | Explicit boolean that shows whether gated content was included. |

Message normalization is implemented in `src/messages.ts`. It handles pi's session message shapes (`user`, `assistant`, `toolResult`, custom/summary messages, and user bash entries), Anthropic-style content blocks, OpenAI-style `tool_calls`, reasoning/thinking blocks, and image blocks. Unknown blocks are JSON-stringified into text parts so content is not silently dropped.

## Content gate and privacy

Full content capture is on by default because the package's purpose is to reconstruct pi sessions in Latitude. Content-bearing attributes are marked internally with a `:gated` suffix until OTLP encoding. `buildOtlpRequest` strips the suffix when `allowConversationAccess=true`; when false, it omits all gated attributes.

Gated attributes include:

- `user_prompt`
- `gen_ai.input.messages`
- `gen_ai.output.messages`
- `gen_ai.system_instructions`
- `gen_ai.tool.definitions`
- `gen_ai.tool.call.arguments`
- `gen_ai.tool.call.result`
- `error.message` values that may contain tool/model output
- full normalized `pi.agent.messages`

Structural attributes such as model, provider, token counts, timings, tool names, session id, cwd metadata, and `latitude.captured.content` remain present in `--no-content` mode.

The package still sends sensitive metadata even with `--no-content`: pi cwd, session file path, user identity, host identity, model names, tool names, token counts, timing, and error types. Users should not enable it for sessions where those values must stay local.

## Package layout

```text
packages/telemetry/pi/
├── src/cli.ts              # latitude-pi CLI entry
├── src/setup.ts            # install/uninstall flow
├── src/settings-file.ts    # pi settings + config-file helpers
├── src/extension.ts        # pi extension entry
├── src/span-builder.ts     # event-to-span state machine
├── src/messages.ts         # pi/provider message normalization
├── src/otlp.ts             # SpanRecord → OTLP JSON encoder
├── src/client.ts           # Latitude ingest POST
├── src/config.ts           # runtime config + identity resolution
└── src/*.test.ts           # unit tests for builder, OTLP gate, settings helpers
```

Package metadata:

- npm package: `@latitude-data/pi-telemetry`
- bin: `latitude-pi`
- pi manifest: `pi.extensions = ["./dist/extension.js"]`
- build: `pnpm --filter @latitude-data/pi-telemetry build`
- checks: `pnpm --filter @latitude-data/pi-telemetry check`, `typecheck`, `test`
