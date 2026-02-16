# Changelog

All notable changes to the Python Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-02-16

### Changed

- Added `telemetry.context.set_attributes()` to set baggage attributes once and propagate trace metadata to child spans.

### Removed

- Removed manual instrumentation option aliases for prompt/chat/external/completion spans (including `documentLogUuid`, `promptUuid`, `versionUuid`, and related fields). Pass trace metadata with `attributes` or context baggage instead.

## [2.0.3] - 2026-01-29

### Fixed

- Fixed `@telemetry.capture()` decorator not working correctly with generator functions. The span now stays open until all items are yielded, enabling proper tracing for streaming LLM responses.
