# @latitude-data/openclaw-telemetry-cli

One-shot installer for the [`@latitude-data/openclaw-telemetry`](https://www.npmjs.com/package/@latitude-data/openclaw-telemetry) OpenClaw plugin. Wraps the manual `openclaw plugins install` + `openclaw config set` flow into a single `npx -y` invocation, with prompts on TTY and flags for CI.

## Install

Requires OpenClaw **2026.4.25 or newer**. Get a Latitude API key + project slug from `https://console.latitude.so/settings/api-keys` first.

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install
```

The CLI will:

1. Verify your OpenClaw version (`openclaw --version` ≥ 2026.4.25); abort with an upgrade message otherwise.
2. Verify the runtime contract — that `@latitude-data/openclaw-telemetry@0.0.7` exists on npm. (Half-published releases abort here.)
3. Detect any prior install via `<configDir>/plugins/installs.json` and render `Upgrading 0.0.6 → 0.0.7` UX.
4. Prompt for your API key and project slug (interactive only).
5. Back up `~/.openclaw/openclaw.json` to `openclaw.json.latitude-bak` before any change.
6. Run `openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7 --force` (npm fetch + security scan + extension placement + install record + disabled `plugins.entries[id]`).
7. Layer your config + hooks on top of the entry: `apiKey`, `project`, `baseUrl` (only when `--staging` / `--dev` set), `config.allowConversationAccess` AND `hooks.allowConversationAccess` (always coupled — both are `true` by default).
8. Add the plugin id to `plugins.allow` (silences the "untracked code" warning at every gateway start). Pass `--no-trust` to opt out.
9. Run `openclaw config validate --json` to confirm the result; restore the backup and abort if validation fails.
10. On TTY, prompt to restart the gateway; non-TTY skips by default. `--restart` / `--no-restart` override.

## Flag matrix

| Flag | Effect |
| --- | --- |
| `--api-key=<key>` | Pass the API key non-interactively. |
| `--project=<slug>` | Pass the project slug non-interactively. |
| `--staging` | Target `https://staging.latitude.so` / `https://staging-ingest.latitude.so`. |
| `--dev` | Target `http://localhost:3000` / `http://localhost:3002`. |
| `--no-content` | Disable conversation capture (still emits structural-only telemetry — timing, tokens, ids). Mirrored into both `config.allowConversationAccess` and `hooks.allowConversationAccess`. |
| `--allow-conversation` | Force conversation capture on. |
| `--no-trust` | Skip auto-adding the plugin id to `plugins.allow`. The "untracked code" warning will keep showing until you add it manually. |
| `--openclaw-dir=<path>` | Override the OpenClaw config directory. See [Config dir resolution](#config-dir-resolution). |
| `--dry-run` | Render the proposed JSON diff against `openclaw.json` and the install spec we'd run; exit 0 without writing or spawning anything. |
| `--restart` | Always restart the gateway after install, even non-TTY (CI escape hatch for "do everything"). |
| `--no-restart` | Never restart the gateway, even on TTY. Always wins over `--restart`. |
| `--yes` / `--no-prompt` | Skip all prompts. Required when `--api-key` and `--project` are not on a TTY. |

## CI install

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install \
  --api-key="$LATITUDE_API_KEY" \
  --project=my-project \
  --yes \
  --no-restart
```

`--no-restart` keeps the gateway running while you finish other config; restart yourself when ready.

## Config dir resolution

The CLI resolves the OpenClaw config directory in this order, stopping at the first match:

1. **`--openclaw-dir <path>`** flag (absolute, or relative to cwd).
2. **`OPENCLAW_HOME`** env var (absolute, or relative to cwd).
3. **`./openclaw.json`** in the current working directory → use cwd.
4. **`~/.openclaw`** (default).

The resolved path is printed at install start so it's visible. The CLI passes `OPENCLAW_HOME=<resolved>` to every spawned `openclaw` subprocess so the runtime side resolves to the same dir.

> **Caveat.** OpenClaw's CLI may not honor `OPENCLAW_HOME` directly (we don't see it advertised in upstream docs). When that happens, the runtime side may still write the install record into `~/.openclaw/`, while we wrote `openclaw.json` to the custom dir. The post-install `openclaw config validate --json` step (built into the install flow) catches this — validate fails because the entry is in a different file from the install record, the backup is restored, and we abort with both paths in the error. **No silent two-place writes.**

## Dry run

Use `--dry-run` to preview every change without touching the filesystem or spawning subprocesses:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --dry-run \
  --api-key=lat_xxx --project=my-project
```

Output includes the resolved config dir, the exact `openclaw plugins install` command we'd spawn, and a unified-ish JSON diff between the current `openclaw.json` and the proposed result. Useful for review-before-commit when openclaw.json is checked into a config repo.

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 uninstall
```

The uninstall flow:

1. Confirms with the operator (TTY only — pass `--yes` to skip).
2. Backs up `~/.openclaw/openclaw.json` to `openclaw.json.latitude-bak`.
3. Runs `openclaw plugins uninstall @latitude-data/openclaw-telemetry --force` (removes extension files, the install record, and `plugins.entries[id]`, plus auto-cleans `plugins.allow` / `plugins.deny` / `plugins.load.paths` entries).
4. Defensive cleanup of our state from `openclaw.json` (idempotent — safe to re-run).
5. Restart prompt (same TTY-vs-CI logic as install; `--restart` / `--no-restart` override).

Backup at `~/.openclaw/openclaw.json.latitude-bak` is kept after uninstall — delete it manually if you don't need it.

## Lockstep policy

This CLI installs **exactly** `@latitude-data/openclaw-telemetry@0.0.7` (pinned in source as `RUNTIME_VERSION`). Every CLI release is paired with a runtime release of the same version number. Bumping the runtime requires bumping the CLI in the same commit and re-publishing both.

Why pinning matters:

- **Supply-chain audit.** OpenClaw's `security audit --deep` warns about unpinned plugin install specs. Hardcoding the version satisfies the audit automatically.
- **CLI ↔ runtime contract.** The CLI knows exactly which runtime contract it's installing (config keys, hook names, dispatch gates). Floating tags would let half-released runtimes ship with mismatched CLIs.

If npm doesn't have the exact pinned version (half-published release), the CLI aborts with `Upgrade the CLI: npm install -g @latitude-data/openclaw-telemetry-cli@latest`.

## Why this is a separate package

OpenClaw 2026.4.25+ runs an install-time security scan on `openclaw plugins install` (`plugins.code_safety` checks for `dangerous-exec` / `env-harvesting` patterns). This CLI uses `child_process.spawn` to invoke OpenClaw — that's a `dangerous-exec` flag. By keeping the CLI in a **separate npm package** that's installed via `npx`/`npm install -g` rather than `openclaw plugins install`, the CLI never goes through OpenClaw's scanner. The runtime plugin (`@latitude-data/openclaw-telemetry`) is installed by this CLI on the operator's behalf and is itself scanner-clean (no `child_process`, no `node:fs` runtime reads).

See the [v0.0.7 changelog of the runtime](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/openclaw/CHANGELOG.md) for the wider history of the split.
