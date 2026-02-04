# Changelog

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated

- The `userMessage` parameter in `prompts.run()` is now deprecated. Use the `messages` parameter instead (coming soon). The `userMessage` parameter will be removed in a future version.

## [5.4.1] - 2026-01-30

### Fixed

- Re-exported `LogSources` from shared constants to keep SDK log source values aligned with the API.

## [5.4.0] - 2026-01-28

### Changed

- Replaced `node-fetch` with native `fetch`. This reduces bundle size and improves abort signal handling. Requires Node.js 18+ (which has been the minimum supported version since Node.js 16 and 17 reached EOL).

### Fixed

- Fixed abort signal propagation when cancelling streaming requests. The SDK now properly cancels in-flight requests when the abort signal is triggered.

## [5.3.1] - 2026-01-19

- Quick fix: move constants dependency to dev dependency since it's transpiled at build time and it cannot be required at runtime because we do not publish it.

## [5.3.0] - 2026-01-18

### Added

- Added `mcpHeaders` parameter to `prompts.run()` and `prompts.chat()` methods for passing custom headers to MCP servers at runtime. Headers are keyed by integration name to support multiple MCP integrations per prompt.

Example usage:

```typescript
latitude.prompts.run('my-prompt', {
  parameters: { name: 'John' },
  mcpHeaders: {
    myMcpIntegration: { 'customer-id': 'abc123' },
    anotherMcp: { 'x-tenant-id': 'tenant-456' },
  },
})
```

## [5.2.3] - 2025-12-29

- Removed deprecated span types from internal telemetry.

## [5.2.2] - 2025-11-13

- Fixed `prompts.chat()` method was not including custom tools in the request

## [5.2.1] - 2025-10-15

- Exports MessageRole enum instead of the type only

## [5.2.0] - 2025-10-10

Official release of v5.2.0.

### Added

- Added `runs.attach()` method to TypeScript SDK
- Added `runs.stop()` method to TypeScript SDK
- Added background option when running a prompt

### Changed

- Now `prompts.run()` method, of the TypeScript SDK, returns a `GenerationJob` instead of a `GenerationResponse` when `background` is `true`
- Now `prompts.run()`, `prompts.chat()` and `runs.attach()` methods, of the TypeScript SDK, have `stream` option set to `true` by default

## [5.2.0-beta.6] - 2025-10-09

- Official pre-release of v5.2.0

## [5.2.0-beta.5] - 2025-09-30

### Changed

- Now `prompts.run()`, `prompts.chat()` and `runs.attach()` methods, of the TypeScript SDK, have `stream` option set to `true` by default

## [5.2.0-beta.4] - 2025-09-29

### Fixed

- Fixed `prompts.run()` method return types of the TypeScript SDK

## [5.2.0-beta.3] - 2025-09-29

### Changed

- Now `prompts.run()` method, of the TypeScript SDK, returns a `GenerationJob` instead of a `GenerationResponse` when `background` is `true`

## [5.2.0-beta.2] - 2025-09-25

### Fixed

- Fixed TypeScript SDK build

## [5.2.0-beta.1] - 2025-09-25

### Added

- Added `runs.attach()` method to TypeScript SDK
- Added `runs.stop()` method to TypeScript SDK

## [5.1.0] - 2025-09-19

### Added

- Added background option when running a prompt

## [5.0.1] - 2025-09-09

### Changed

- Throw error if sdk fails to create version

## [5.0.0] - 2025-09-08

Official release of v5. Targets the new agent runtime, which introduces several improvements to agent performance and reliability.

Breaking changes:

- Agents now respond as regular prompts rather than in the custom `agentResponse` key.

## [5.0.0-beta.3] - 2025-09-06

### Added

- Added `versions.getAll()` method to TypeScript SDK for retrieving all versions of a project

## [5.0.0-beta.2] - 2025-08-25

- Add userMessage to `run` method of the Typescript SDK in beta version. In the beta version of the SDK v5 we want to allow to run a prompt with a user message on it. We want this to allow prompts to be run like if in GPT where you can start asking something to a preconfigured AI. In this case could be a Latitude AI agent.

## [4.1.14] - 2025-08-22

- Downgrades to node-fetch v2.x which is compatible with CommonJS environments.

## [4.1.13] - 2025-08-22

- Assert object return types for prompts that return structured outputs.

## [4.1.12] - 2025-07-16

### Fixed

- Default to `HEAD_COMMIT` when in the logs.create method

## [5.0.0-beta.1] - 2025-07-16

### Added

- Initial beta release of the TypeScript SDK
- Support for prompt execution and streaming
- Integration with Latitude's prompt management system
- Type-safe API client with full TypeScript support

### Changed

- Migrated to new SDK architecture

### Fixed

- Various bug fixes and improvements
