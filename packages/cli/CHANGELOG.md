# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [3.0.0] - 2025-09-16

### Removed

- Dropped CommonJS prompt support; CLI now writes `.js` default exports for npm projects.

## [2.0.5] - 2025-09-09

### Changed

- Prompts are default exports instead of named in js/ts projects to avoid name conflicts.

## [2.0.4] - 2025-09-08

### Added

- Adds `login` command to change the stored API key.

## [2.0.3] - 2025-09-08

### Changed

- Fixes escaping of special characters in prompts when pulled into JS/TS projects.

[Unreleased]: https://github.com/latitude-dev/latitude-llm/compare/cli-3.0.0...HEAD
[3.0.0]: https://github.com/latitude-dev/latitude-llm/releases/tag/cli-3.0.0
[2.0.5]: https://github.com/latitude-dev/latitude-llm/releases/tag/cli-2.0.5
[2.0.4]: https://github.com/latitude-dev/latitude-llm/releases/tag/cli-2.0.4
[2.0.3]: https://github.com/latitude-dev/latitude-llm/releases/tag/cli-2.0.3
