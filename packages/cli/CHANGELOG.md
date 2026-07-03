# Changelog

All notable changes to the Latitude CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-02

### Added

- `latitude account bootstrap` — create a temporary organization (with an API key and a project) and get a link to claim ownership of it. Unauthenticated; the terminal entry point for the agentic zero-account onboarding flow.

## [0.2.0] - 2026-07-02

### Added

- `latitude spans query` — list spans across all traces in a project, filtered by a span-field filter set and an optional time range. The row-level, span-grain complement to `latitude analytics query` with `stream=spans`.

## [0.1.0] - 2026-07-01

Initial release of the `latitude` CLI — a single, statically linked binary generated from the Latitude OpenAPI spec by [Fern](https://buildwithfern.com/).

### Added

- A command surface mapping every public API resource to a typed subcommand (`latitude projects list`, `latitude traces get`, `latitude analytics query`, …), with `--help` and a machine-readable `--schema` for each scope.
- Organization API-key auth: reads `LATITUDE_API_KEY`, or store a key in the OS keyring with `latitude auth login` (`auth status` / `auth logout`).
- Output formats for humans and agents: `--format json|table|yaml|csv|jsonl|raw|http`, a `--query` JMESPath filter, shell completions (`latitude completion`), and a man page (`latitude man`).
- Prebuilt binaries for macOS (arm64/x86_64), Linux (arm64/x86_64), and Windows (x86_64), attached to each GitHub release.
