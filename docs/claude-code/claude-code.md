# Claude Code telemetry

Stream your Claude Code session transcripts: prompts, model responses, tool calls, and tool results into Latitude as OpenTelemetry traces. Once installed, every Claude Code turn shows up in your project's **Traces** view.


## Prerequisites

- A free [Latitude account](https://console.latitude.so/login) with at least one project
- Claude Code installed (CLI, desktop app, or IDE extension)
- Node.js available on your `PATH` (the hook runs via `npx`)

> The package supports the Claude Code CLI, the macOS/Windows desktop app, and the VS Code/JetBrains extensions. It does **not** work with the web app at `claude.ai/code`, since that runs in Anthropic's cloud where local hooks can't execute.

## Step 1: Get your Latitude API key and project slug

You'll need both before running the installer.

**Project slug**: open your project in Latitude. The slug appears in the left sidebar, directly under the project name (for example, `claude-code`). Click it to copy.

**API key**: go to **Settings → API Keys** (top-right of the Latitude app). Use an existing key or click **Create API Key**. Copy the full key value.

## Step 2: Run the installer

In a terminal, run:

```bash
npx -y @latitude-data/claude-code-telemetry install
```

The installer will:

1. Prompt for your API key and project slug (paste the values from Step 1).
2. Edit `~/.claude/settings.json` to (a) store your API key and project slug, and (b) tell Claude Code to run the telemetry script after every turn.
3. On macOS, register the environment variables with `launchctl` so the desktop app and IDE extensions inherit them.

If you'd rather pass values as flags instead of being prompted:

```bash
npx -y @latitude-data/claude-code-telemetry install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

See [Install flags](#install-flags) below for all available flags.

## Step 3: Restart Claude Code

**Fully quit and relaunch** Claude Code.

- **CLI:** close the terminal session and start a new one.
- **Desktop app:** quit from the menu bar (⌘Q on macOS), then reopen.
- **VS Code / JetBrains:** fully quit the IDE, then reopen.

## Step 4: Verify traces are arriving

Run any prompt in Claude Code. Then open your Latitude project and go to **Traces**. Within a few seconds you should see the new trace there.

If nothing shows up, see [Troubleshooting](#troubleshooting) below.

## Disabling temporarily

To pause telemetry without uninstalling, set the environment variable:

```bash
export LATITUDE_CLAUDE_CODE_ENABLED=0
```

Restart Claude Code for the change to take effect. Set it back to `1` (or unset it) to re-enable.

## Uninstalling

To remove the hook and revert all changes the installer made:

```bash
npx -y @latitude-data/claude-code-telemetry uninstall
```

The uninstaller asks for confirmation before reverting `~/.claude/settings.json` and (on macOS) the `launchctl` entries.

## Manual configuration

If you'd rather not run the installer (for example, you manage `~/.claude/settings.json` in a dotfiles repo) you can wire it up by hand.

Add the following to `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "your-project-slug"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @latitude-data/claude-code-telemetry",
            "async": true
          }
        ]
      }
    ]
  }
}
```

Restart Claude Code after saving. Note that the desktop app and IDE extensions on macOS won't inherit shell-level environment variables, so the `env` block above is required (or you'll need to set them via `launchctl` yourself).

## Reference

### CLI commands

The package exposes a single binary, `latitude-claude-code`, invoked via `npx`. It has two subcommands:

- `install` — configures `~/.claude/settings.json` and (on macOS) `launchctl`.
- `uninstall` — reverts every change `install` made, after confirmation.

### Install flags

| Flag | Purpose |
|---|---|
| `--api-key=<key>` | Supply the Latitude API key non-interactively. |
| `--project=<slug>` | Supply the Latitude project slug non-interactively. |
| `--staging` | Point the hook at the Latitude staging environment instead of production. |
| `--dev` | Point the hook at `localhost` (for Latitude internal development). |
| `--no-launchctl` | Skip the macOS `launchctl` setup. Use this if you manage environment variables yourself. |
| `--yes`, `--no-prompt` | Skip all interactive prompts. Useful in CI or scripted setups. |

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LATITUDE_API_KEY` | Yes | — | Bearer token used to authenticate trace uploads to Latitude. |
| `LATITUDE_PROJECT` | Yes | — | Slug of the Latitude project that should receive the traces. |
| `LATITUDE_BASE_URL` | No | `https://ingest.latitude.so` | Override the ingestion endpoint. Set automatically by `--staging` and `--dev`. |
| `LATITUDE_CLAUDE_CODE_ENABLED` | No | `1` | Set to `0` to disable the hook without uninstalling. |
| `LATITUDE_DEBUG` | No | unset | Set to `1` to print diagnostic output to stderr when the hook runs. |
| `BUN_OPTIONS` | Conditional | — | Preload path used by the optional Bun-based request capture. The installer manages this; do not set it by hand. |

> ⚠️ If `BUN_OPTIONS` points to a missing file, Claude Code itself will fail to start. Either keep the file in place or unset the variable.

### Files modified by the installer

- **`~/.claude/settings.json`** — adds an `env` block (or merges into an existing one) and a `Stop` entry under `hooks`. Existing settings are preserved.
- **macOS `launchctl` user environment** — `LATITUDE_API_KEY`, `LATITUDE_PROJECT`, and (when relevant) `BUN_OPTIONS` are registered via `launchctl setenv` so that GUI apps inherit them. Skipped with `--no-launchctl`.

The installer does not modify your shell rc files (`.zshrc`, `.bashrc`).

## How it works

The package is built around a Claude Code **Stop hook**: a shell command that Claude Code runs automatically every time a turn ends (after the assistant finishes responding and any tool calls have completed). When the hook fires, it reads the new portion of the transcript, reconstructs the turn as OpenTelemetry spans, and POSTs them to Latitude's OTLP ingestion endpoint. There's no daemon and no background process — just a short-lived script that runs once per turn.

Each turn produces one trace with three span types:

- **`interaction`** — the user prompt and turn-level timing.
- **`llm_request`** — each call to Anthropic's API, including model parameters, token usage, the full message history, and (when the optional Bun preload is active) the system prompt and tool schemas.
- **`tool_execution`** — each tool invocation: name, arguments, result, and any error.

The package also ships an optional Bun preload script that wraps `fetch` to capture full request bodies sent to Anthropic. This is what makes system prompts and tool schemas available in the trace. It activates only when Claude Code runs under a Bun-based runtime that respects `BUN_OPTIONS`. When inactive, traces still work — they just won't include those two fields.

The hook is **fail-open**. If anything goes wrong (network error, bad API key, parse error), it logs to stderr (visible with `LATITUDE_DEBUG=1`) and exits cleanly. Claude Code is never blocked by a telemetry failure.

## Privacy

You should treat this hook as full-fidelity telemetry. Once installed, Latitude receives the verbatim content of every turn: prompts, responses, tool I/O, system prompts, and tool schemas. Important properties:

- **No per-turn opt-in.** Every turn is captured until the hook is disabled.
- **No redaction.** If you paste a secret into Claude Code, that secret will reach Latitude.
- **Disable globally.** Set `LATITUDE_CLAUDE_CODE_ENABLED=0` to pause capture, or run `uninstall` to remove the hook entirely.

If you're working with sensitive material, disable the hook **before** you start the session.

## Troubleshooting

**No traces appear in Latitude.**
Check that you fully quit and relaunched Claude Code. Then run a turn with `LATITUDE_DEBUG=1` set — the hook will log diagnostic output to stderr explaining why the upload didn't happen (most often a wrong API key, wrong project slug, or unreachable network).

**The hook is failing silently.**
By design. The hook is fail-open: if anything goes wrong (auth failure, network error, parse error), it logs to stderr and exits cleanly so it never blocks Claude Code itself. Set `LATITUDE_DEBUG=1` to see what's happening.

**Claude Code won't start at all after install.**
This usually means a stale `BUN_OPTIONS` environment variable is pointing to a preload file that no longer exists. Either re-run the installer to recreate the file, or unset `BUN_OPTIONS` in your shell and via `launchctl unsetenv BUN_OPTIONS` on macOS.

**Wrong project receives the traces.**
You probably have an old `LATITUDE_PROJECT` value cached in `launchctl`. Re-run the installer with the correct slug, or run `uninstall` then `install` again.

## License

MIT. Source code lives at [`latitude-dev/latitude-llm`](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/claude-code).