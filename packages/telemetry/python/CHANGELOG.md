# Changelog

All notable changes to the Python Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.3] - 2026-01-29

### Fixed

- Fixed `@telemetry.capture()` decorator not working correctly with generator functions. The span now stays open until all items are yielded, enabling proper tracing for streaming LLM responses.
