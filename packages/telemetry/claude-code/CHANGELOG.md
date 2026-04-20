# Changelog

All notable changes to the Claude Code Telemetry hook will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-04-20

### Added

- **Workspace and git context on every span** — the hook now reads the Claude Code session's `cwd` and derives `workspace.name` / `workspace.path`, `git.branch` / `git.commit` / `git.repo`, `claude_code.version`, `host.user`, and `hook.event`. The workspace name is attached as a span tag (`latitude.tags`); the full set is attached as shared trace metadata (`latitude.metadata`) on every emitted span so traces can be sliced by repo, branch, or CLI version in the Latitude UI.
- **Full conversation history on `llm_request` input messages** — `gen_ai.input.messages` now contains every prior user/assistant turn plus the current user prompt, matching the context actually sent to the model. The interaction span still carries only the current user prompt. Subagent turns accumulate their own isolated history from prior turns within the same Agent invocation.
