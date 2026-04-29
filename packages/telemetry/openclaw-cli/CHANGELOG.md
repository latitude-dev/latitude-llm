# Changelog

All notable changes to the `@latitude-data/openclaw-telemetry-cli` installer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.7] - 2026-04-29

Initial release of the standalone installer CLI. The runtime split that landed in `@latitude-data/openclaw-telemetry` 0.0.6 ([PR #2920](https://github.com/latitude-dev/latitude-llm/pull/2920)) deleted the bundled CLI from the runtime package so that runtime would pass OpenClaw 2026.4.25+'s install-time `dangerous-exec` security scan. The 0.0.6 manual install flow asked operators to run six `openclaw config set` commands plus a hand-edited `plugins.allow` array; this package brings the one-shot `npx -y` UX back. By living in a separate npm package, this CLI is installed via `npx`/`npm install -g` rather than `openclaw plugins install`, so it never goes through OpenClaw's install-time scanner.

### Added

- `latitude-openclaw install` — one-shot install: version check, npm-spec install, `plugins.entries[id]` config + hooks layering, `plugins.allow` add, post-write `openclaw config validate --json` check (with backup-restore on failure), TTY-or-flag-driven gateway restart prompt.
- `latitude-openclaw uninstall` — plan-builder confirmation, backup before changes, `openclaw plugins uninstall ... --force`, defensive cleanup of our state from `openclaw.json` (idempotent against partial installs), gateway restart prompt.
- `--openclaw-dir <path>` flag plus `OPENCLAW_HOME` env var plus `./openclaw.json` cwd auto-detection plus `~/.openclaw` default. `OPENCLAW_HOME=<resolved>` is passed to every spawned `openclaw` subprocess; the post-install validate step catches the case where OpenClaw doesn't honor the env var and writes its install record to a different dir from where we wrote the entry (restores backup + aborts with both paths in the error).
- `--dry-run` — render the proposed JSON diff against `openclaw.json` and the exact `openclaw plugins install` command, exit 0 without spawning subprocesses or writing files.
- `--restart` / `--no-restart` — control gateway restart behavior. Default on TTY: prompt; default non-TTY: skip with manual instructions.
- Lockstep version refusal — CLI hardcodes `RUNTIME_VERSION = "0.0.7"` and queries the npm registry to verify that exact runtime version exists; aborts with an upgrade-the-CLI message on 404 (half-published releases).
- Atomic settings writes — `openclaw.json` is written via `<file>.tmp.<pid>` then `rename`'d, so a SIGTERM mid-write can't leave a half-serialized file. Combined with the `.latitude-bak` backup, recovery is always possible.
- Upgrade-detection UX — reads `<configDir>/plugins/installs.json` to render `Upgrading 0.0.6 → 0.0.7` (or `Re-applying 0.0.7 (idempotent)`) before any subprocess spawn.

### Carried forward (from the deleted runtime CLI)

- Interactive vs flag-driven dispatch (`--api-key`, `--project`, `--staging`, `--dev`, `--no-content`, `--allow-conversation`, `--no-trust`, `--yes` / `--no-prompt`).
- `MIN_OPENCLAW_VERSION = "2026.4.25"` version check via `openclaw --version` parser.
- `setPluginEntry` tristate merge logic — `apiKey` / `project` always overwritten, `baseUrl` / `enabled` / `debug` / `allowConversationAccess` preserved when undefined; `allowConversationAccess` mirrored into both `config.*` (payload-content gate) and `hooks.*` (dispatch gate).
- `migrateLegacyEntries` 0.0.1-era top-level `env.LATITUDE_*` sweep.
- `openclaw plugins uninstall ... --force` defensive cleanup pattern.

### Lockstep with the runtime

`RUNTIME_VERSION = "0.0.7"` is hardcoded in `src/setup.ts`. Every CLI release is paired with a runtime release of the same version number — bumping the runtime requires bumping the CLI in the same commit and re-publishing both packages. The `npm view`-style registry check at install start refuses to proceed if the pinned runtime version isn't on npm, so half-published releases fail loudly.
