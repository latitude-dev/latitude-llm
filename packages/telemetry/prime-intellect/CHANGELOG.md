# Changelog

All notable changes to the Latitude Prime Intellect telemetry package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- Initial release of `latitude-telemetry-prime-intellect`: export Prime Intellect Verifiers
  eval rollouts to Latitude as OTLP traces, with optional custom scores from
  `rewards` / `metrics`.
- Library API: `export_trace`, `export_episode`, `export_episodes`, `make_on_complete`,
  `export_results_dir`, `flush`.
- CLI: `latitude-prime-intellect-export export <results_dir>` (also
  `python -m latitude_telemetry_prime_intellect export …`).
