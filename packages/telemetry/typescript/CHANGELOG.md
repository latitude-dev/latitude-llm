# Changelog

All notable changes to the TypeScript Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.4] - 2026-02-26

### Changed

- `capture()` now propagates `path`, `project`, `commit`, and `conversation` references through baggage so child spans inherit the same metadata.

## [2.0.2] - 2026-02-09

### Fixed

- Bump Rosetta AI version

## [2.0.1] - 2026-02-09

### Fixed

- Move Rosetta AI to dependencies

## [2.0.0] - 2026-02-04

### Added

- Manually instrumented completions now support any provider messages
- The manual instrumentation now exports compliant GenAI messages

## [1.1.1] - 2026-02-02

### Fixed

- Disabled `enrichTokens` for OpenAI and TogetherAI instrumentations to fix failures when using `stream: true`

## [1.1.0] - 2026-01-29

### Added

- Initial changelog for TypeScript Telemetry SDK
