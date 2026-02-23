# Changelog

All notable changes to the Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.8.0] - 2026-02-23

### Added

- Added `prompts.delete(path, options?)` method to soft-delete a document/prompt from a project version. Supports `force` option to allow deletions on the live (merged) commit.

## [5.7.0] - 2026-02-17

### Added

- Added `messages` parameter to `prompts.run()` method. This allows appending any kind of messages to the conversation after the compiled prompt. Note: This is not compatible with the `<step>` feature of PromptL.

## [5.6.1] - 2026-01-30

### Fixed

- Aligned chain response models with streaming payloads, including optional tool calls and model metadata fields.
- Removed the obsolete `providerLogUuid` field from provider-completed events.

## [5.6.0] - 2026-01-27

### Added

- Python 3.14 support

## [5.5.0] - 2026-01-19

### Added

- Added `mcp_headers` parameter to `prompts.run()` and `prompts.chat()` methods for passing custom headers to MCP integrations at runtime

## [5.4.0] - 2026-01-09

### Added

- Bump PromptL to 1.2.0

## [5.3.0] - 2025-10-10

Official release of v5.3.0.

### Added

- Added `runs.attach()` method
- Added `runs.stop()` method
- Added background option when running a prompt
- Bump PromptL to 0.8.0

### Changed

- Now `prompts.run()` method returns a `BackgroundResult` instead of a `FinishedResult` when `background` is `true`
- Now `prompts.run()`, `prompts.chat()` and `runs.attach()` methods have `stream` option set to `true` by default

## [5.3.0-beta.2] - 2025-10-09

- Official pre-release of v5.3.0

## [5.3.0-beta.1] - 2025-09-30

### Added

- Added `runs.attach()` method
- Added `runs.stop()` method
- Added background option when running a prompt
- Bump PromptL to 0.8.0

### Changed

- Now `prompts.run()` method returns a `BackgroundResult` instead of a `FinishedResult` when `background` is `true`
- Now `prompts.run()`, `prompts.chat()` and `runs.attach()` methods have `stream` option set to `true` by default

## [5.2.0] - 2025-17-09

### Added

- Python 3.13 support
- Bump PromptL to 0.7.5

## [5.1.0] - 2025-11-09

### Added

- Started the changelog

### Changed

- Stream callbacks are now asynchronous, following the consistency of the on_step and on_tool_call callbacks

### Fixed

- Correctly handle exceptions when they are raised in the middle of an streaming request

## [5.0.0] - 2025-09-08

Official release of v5. Targets the new agent runtime, which introduces several improvements to agent performance and reliability.

Breaking changes:

- Agents now respond as regular prompts rather than in the custom `agent_response` key.
