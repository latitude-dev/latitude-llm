# @latitude-data/openclaw-telemetry-cli

One-shot installer for the [`@latitude-data/openclaw-telemetry`](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw#readme) OpenClaw plugin. Wraps `openclaw plugins install` + the manual `openclaw config set` flow into a single `npx -y` command, with TTY prompts, CI flags, dry-run, custom config dir, upgrade detection, and the gateway restart.

For details on the plugin runtime itself — what it sends, the span tree, and the manual install flow — see the [runtime README](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw#readme).

## Requirements

- **OpenClaw 2026.4.25 or newer** on PATH.
- A **Latitude API key** and **project slug** — both from [console.latitude.so/settings/api-keys](https://console.latitude.so/settings/api-keys).

## Install

Interactive (recommended for first-time setup):

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install
```

The CLI prompts for your API key and project slug, installs the plugin, writes the config, validates it, and offers to restart the gateway.

Non-interactive / CI:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install \
  --api-key="$LATITUDE_API_KEY" \
  --project=my-project \
  --yes \
  --no-restart
```

`--yes` skips all prompts (required when you can't type into a TTY); `--no-restart` keeps the gateway running so you can finish other config first.

## What the CLI does

In order, on every install:

1. **Verifies your OpenClaw version** (`openclaw --version` ≥ 2026.4.25). Aborts with an upgrade message on older versions.
2. **Verifies the runtime contract** — that `@latitude-data/openclaw-telemetry@0.0.7` exists on npm. (Catches half-published releases.)
3. **Detects any prior install** via `<configDir>/plugins/installs.json`. Renders `Upgrading 0.0.6 → 0.0.7` (or `Re-applying 0.0.7 (idempotent)`) if found.
4. **Prompts for your API key and project slug** — interactive only; flags / `--yes` skip the prompts.
5. **Backs up `openclaw.json`** to `openclaw.json.latitude-bak` before any change.
6. **Runs `openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7 --force`** — npm fetch, security scan, extension placement, install record, disabled `plugins.entries[id]`.
7. **Writes the plugin config** atomically (temp + rename): `apiKey`, `project`, `baseUrl` (only if `--staging` / `--dev`), `config.allowConversationAccess` AND `hooks.allowConversationAccess` (always coupled — both `true` by default; `--no-content` to emit structural-only telemetry).
8. **Adds the plugin id to `plugins.allow`** to silence OpenClaw's "untracked code" warning. Pass `--no-trust` to opt out.
9. **Validates** the result with `openclaw config validate --json`. If it fails, restores the backup and aborts with the validator's message.
10. **Restarts the gateway**. Default: prompts on TTY, skips non-TTY (with manual instructions). `--restart` always restarts; `--no-restart` always skips.

## Flags

| Flag | Effect |
| --- | --- |
| `--api-key=<key>` | Pass the API key non-interactively. |
| `--project=<slug>` | Pass the project slug non-interactively. |
| `--staging` | Target `https://staging.latitude.so` / `https://staging-ingest.latitude.so`. |
| `--dev` | Target `http://localhost:3000` / `http://localhost:3002`. |
| `--no-content` | Disable conversation capture (still emits structural-only telemetry — timing, tokens, ids). Mirrored into both `config.allowConversationAccess` and `hooks.allowConversationAccess`. |
| `--allow-conversation` | Force conversation capture on (overrides existing config). |
| `--no-trust` | Skip auto-adding the plugin id to `plugins.allow`. |
| `--openclaw-dir=<path>` | Override the OpenClaw config directory. See [Custom config directory](#custom-config-directory). |
| `--dry-run` | Preview every change without touching the filesystem or spawning subprocesses. See [Dry run](#dry-run). |
| `--restart` | Always restart the gateway, even non-TTY. CI escape hatch for "do everything". |
| `--no-restart` | Never restart the gateway, even on TTY. Always wins over `--restart`. |
| `--yes` / `--no-prompt` | Skip all prompts. Required when running non-TTY without supplying `--api-key` / `--project`. |
| `--version`, `-v` | Print the CLI version and exit. |
| `--help`, `-h` | Print usage. |

## Modes

### Dry run

Preview every change without touching the filesystem or spawning subprocesses:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --dry-run \
  --api-key=lat_xxx --project=my-project
```

Output includes the resolved config dir, the exact `openclaw plugins install` command we'd spawn, and a unified-ish JSON diff between the current `openclaw.json` and the proposed result. Useful for reviewing changes before applying them, or for verifying flag behaviour in CI.

### Custom config directory

The CLI resolves the OpenClaw config directory in this order, stopping at the first match:

1. **`--openclaw-dir=<path>`** flag (absolute, or relative to cwd; the space-separated form `--openclaw-dir <path>` works too).
2. **`OPENCLAW_HOME`** env var (absolute, or relative to cwd).
3. **`./openclaw.json`** in the current working directory → use cwd.
4. **`~/.openclaw`** (default).

The resolved path is printed at install start. The CLI passes `OPENCLAW_HOME=<resolved>` to every spawned `openclaw` subprocess, so the runtime side picks up the same dir.

> **Caveat.** OpenClaw's CLI may not honor `OPENCLAW_HOME` directly. When that happens, the runtime side may write the install record into `~/.openclaw/`, while we write `openclaw.json` to the custom dir. The post-install `openclaw config validate --json` step catches this — validation fails because the entry is in a different file from the install record, the backup is restored, and the CLI aborts with both paths in the error. **No silent two-place writes.**

### Structural-only telemetry

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --no-content \
  --api-key=lat_xxx --project=my-project
```

The plugin still emits the full span tree — timings, token usage, model name, agent name, ids — just with content attributes (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, tool args/results) scrubbed. Each span carries `latitude.captured.content: false` so the gate state is visible in the Latitude UI.

### Targeting staging or local dev

```bash
# Staging
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --staging --yes \
  --api-key=lat_xxx --project=my-project

# Local dev
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --dev --yes \
  --api-key=lat_xxx --project=my-project
```

`--staging` writes `baseUrl: https://staging-ingest.latitude.so`; `--dev` writes `baseUrl: http://localhost:3002`. Without either flag, the runtime defaults to production (`https://ingest.latitude.so`).

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 uninstall
```

The uninstall flow:

1. Confirms with the operator (TTY only — pass `--yes` to skip).
2. Backs up `openclaw.json` to `openclaw.json.latitude-bak`.
3. Runs `openclaw plugins uninstall @latitude-data/openclaw-telemetry --force`. OpenClaw removes the extension files, the install record, `plugins.entries[id]`, and the `plugins.allow` entry.
4. Defensive cleanup of any lingering state in `openclaw.json` (idempotent — safe to re-run).
5. Restart prompt (same TTY-vs-CI logic as install; `--restart` / `--no-restart` override).

The backup at `openclaw.json.latitude-bak` is kept after uninstall — delete it manually when you don't need it anymore.

## Lockstep policy

This CLI installs **exactly** `@latitude-data/openclaw-telemetry@0.0.7` (pinned in source as `RUNTIME_VERSION`). Every CLI release is paired with a runtime release of the same version number; bumping the runtime requires bumping the CLI in the same commit and re-publishing both.

If npm doesn't have the exact pinned version (half-published release), the CLI aborts with `Upgrade the CLI: npm install -g @latitude-data/openclaw-telemetry-cli@latest`.

Pinning to an exact version also satisfies OpenClaw's `Pin install specs to exact versions` supply-chain audit warning automatically.

## Why this is a separate package

OpenClaw 2026.4.25+ runs an install-time security scan on `openclaw plugins install` (`plugins.code_safety`, looking for `dangerous-exec` / `env-harvesting` patterns). This CLI uses `child_process.spawn` to invoke OpenClaw — a `dangerous-exec` flag. Keeping the CLI in a **separate npm package** that's installed via `npx` / `npm install -g` rather than `openclaw plugins install` means the CLI never goes through OpenClaw's scanner. The runtime plugin ([`@latitude-data/openclaw-telemetry`](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw)) is installed by this CLI on the operator's behalf and is itself scanner-clean (no `child_process`, no `node:fs` runtime reads).

See the [runtime CHANGELOG](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/openclaw/CHANGELOG.md) for the wider history of the split.

## License

MIT
