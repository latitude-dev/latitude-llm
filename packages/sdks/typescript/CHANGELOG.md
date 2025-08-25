# Changelog

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0-beta.2] - 2025-08-25

- Add userMessage to `run` method of the Typescript SDK in beta version. In the beta version of the SDK v5 we want to allow to run a prompt with a user message on it. We want this to allow prompts to be run like if in GPT where you can start asking something to a preconfigured AI. In this case could be a Latitude AI agent.

## [4.1.14] - 2025-08-22

- Downgrades to node-fetch v2.x which is compatible with CommonJS environments.

## [4.1.13] - 2025-08-22

- Assert object return types for prompts that return structured outputs.

## [4.1.12] - 2025-07-16

### Fixed

- Default to `HEAD_COMMIT` when in the logs.create method

## [5.0.0-beta.1] - 2025-01-16

### Added

- Initial beta release of the TypeScript SDK
- Support for prompt execution and streaming
- Integration with Latitude's prompt management system
- Type-safe API client with full TypeScript support

### Changed

- Migrated to new SDK architecture

### Fixed

- Various bug fixes and improvements
