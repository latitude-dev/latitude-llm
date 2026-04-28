# Changelog

All notable changes to the OpenClaw Telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-04-27

### Fixed

- **OpenClaw discovery now actually finds the plugin.** 0.0.2 shipped `openclaw.plugin.json` correctly (manifest with `id` + `configSchema`), but `package.json` was missing the `openclaw.extensions` field. OpenClaw's `resolvePackageExtensionEntries` reads `package.json["openclaw"].extensions` to know **where** the plugin entry lives — without it, discovery falls through to looking for `index.{ts,js,mjs,cjs}` at the directory root, doesn't find one, and skips us silently. The gateway then warns `plugin not found: @latitude-data/openclaw-telemetry (stale config entry ignored; remove it from plugins config)` even though everything else is in place. Now both the published `package.json` and the minimal `package.json` the installer writes into `~/.openclaw/extensions/latitude-telemetry/` declare `"openclaw": { "extensions": ["./dist/plugin.js"] }`. After re-running `install`, the gateway log lists `@latitude-data/openclaw-telemetry` in the ready-plugins line.

### Added

- `--version` / `-v` and `--help` / `-h` top-level flags on the CLI. Run `npx -y @latitude-data/openclaw-telemetry --version` to confirm which version is installed (or shadow-cached) on a given box.

## [0.0.2] - 2026-04-25

End-to-end install fix. The 0.0.1 install path was broken in five places, all reported by an OpenClaw 2026.4.21 maintainer who tried it on a real install. Re-running `npx -y @latitude-data/openclaw-telemetry install` cleans up any leftover 0.0.1 keys.

### Fixed

- **`openclaw.json` written by the installer is now accepted by OpenClaw's strict zod schema.** 0.0.1 wrote `hooks.allowConversationAccess: true` (the strict `hooks` namespace only accepts `allowPromptInjection` on older OpenClaw versions, and `allowPromptInjection`+`allowConversationAccess` on 2026.4.22+) and `LATITUDE_*` keys at top-level `env` (the root schema's `env` block only accepts `{shellEnv, vars}`, not arbitrary keys). Both fields caused the gateway file-watcher to quarantine the new config as `clobbered.<ts>` and silently roll back to `last-good`. We now write everything under `plugins.entries[id].config`, which is `record(string, unknown)` and accepted by every OpenClaw version.
- **Plugin discovery now finds us.** OpenClaw scans `<configDir>/extensions/<plugin>` for an `openclaw.plugin.json` manifest at the plugin root — npm `main` is irrelevant, and global `npm install -g` is not enough. Two changes: (1) we now ship `openclaw.plugin.json` in the package, with the required `id` and `configSchema`, and (2) the installer materializes the package's `dist/` + manifest into `~/.openclaw/extensions/latitude-telemetry/` so discovery picks it up.
- **`api.pluginConfig` is now the primary source of credentials.** 0.0.1's runtime read `process.env.LATITUDE_*` and ignored `api.pluginConfig`. Combined with the schema-rejection bug, the plugin disabled itself silently because creds were dropped on the floor before they reached our runtime. The new `loadConfig` reads `api.pluginConfig` first (the user's `plugins.entries[id].config`), and falls back to env vars for compatibility.
- **`allowConversationAccess` is now actually honored.** 0.0.1 advertised the flag but always attached full content to spans. The new runtime gates `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, and the interaction's `user_prompt` on this flag. When off, spans still emit with the same shape — timing, token usage, model name, agent name, ids — just scrubbed of payload content. A `latitude.captured.content` boolean attribute makes the gate state visible in the Latitude UI.

### Changed

- **Default capture posture flipped at runtime, kept on at install.** The runtime now defaults `allowConversationAccess` to `false` if the key is missing from `pluginConfig` (privacy-preserving default for hand-edited configs). The interactive installer still writes `true` by default — pass `--no-content` to install with structural-only telemetry. This means re-installing on top of an old config is a no-op for capture posture; only hand-edited configs that drop the key change behaviour.
- **Migration on re-install.** `npx -y @latitude-data/openclaw-telemetry install` now strips `hooks.allowConversationAccess` and any top-level `env.LATITUDE_*` keys our 0.0.1 installer left behind, before writing the new entry. No manual cleanup required.

### Added

- `openclaw.plugin.json` manifest at the package root, with a JSON schema for `apiKey` / `project` / `baseUrl` / `allowConversationAccess` / `enabled` / `debug`.
- `--no-content` install flag for shipping structural telemetry without payloads.
- `latitude.captured.content` boolean attribute on every span so operators can see whether content capture was on for a given trace.

## [0.0.1] - 2026-04-24

### Added

- Initial release. OpenClaw plugin that streams every agent run to Latitude as OTLP traces by subscribing to OpenClaw's typed `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` hooks.
- Per-run state accumulator keyed by `runId` that pairs LLM input/output into single calls, nests tool invocations under their parent LLM call, and handles out-of-order tool events defensively.
- OTLP span tree with three span kinds — `interaction` (per agent run), `llm_request` (per LLM call), `tool_execution` (per tool invocation). Every span carries `openclaw.agent.id` and `openclaw.agent.name` so multi-agent setups are filterable in the Latitude UI.
- `llm_request` spans capture everything OpenClaw surfaces: provider, request/response model, resolved ref, system prompt, full message history, current prompt, assistant text, tool call parts, and full token usage (input/output/cache_read/cache_creation/total) under both canonical `gen_ai.*` keys and legacy aliases.
- Installer CLI (`npx @latitude-data/openclaw-telemetry install`) that writes a plugin entry with `hooks.allowConversationAccess: true` and `LATITUDE_*` env vars to `~/.openclaw/openclaw.json`, plus matching `uninstall`.
- Supports production / `--staging` / `--dev` environment flags and non-interactive `--api-key` / `--project` / `--yes` flags for CI.
