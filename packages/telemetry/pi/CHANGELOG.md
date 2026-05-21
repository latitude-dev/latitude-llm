# Changelog

All notable changes to the Pi Telemetry extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-05-21

### Fixed

- Telemetry export no longer blocks Pi's agent lifecycle at the end of a run. Trace uploads are dispatched asynchronously after span construction so the TUI can leave the working/loading state immediately.
- Failed telemetry uploads are now silent unless debug logging is enabled, avoiding direct stderr writes that can disturb Pi's interactive terminal layout.

## [0.0.1] - 2026-05-21

### Added

- Initial release of the Pi coding agent extension for streaming sessions to Latitude as OTLP traces.
- Interactive `install` / `uninstall` CLI for managing Pi package settings and Latitude configuration.
- Optional `--no-content` mode to keep trace structure and metadata while scrubbing captured prompts, responses, tool inputs, and tool outputs.
