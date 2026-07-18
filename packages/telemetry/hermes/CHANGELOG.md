# Changelog

All notable changes to the Latitude Hermes telemetry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2]

### Fixed

- Stop exporting empty conversation placeholders. Blank or whitespace-only user/assistant turns no longer become `{ type: "text", content: "" }` parts that render as empty bubbles in Latitude. Tool-only assistant turns still export as `tool_call` parts. Content-list `tool_use` blocks now count toward keeping the interaction open so following `tool_execution` spans are not dropped. The interaction root only attaches `user_prompt` / `gen_ai.input.messages` when the current turn has real user text (blank trailing user turns are omitted, not backfilled from an earlier prompt).

## [0.1.1]

### Fixed

- Flush telemetry on session end so short/one-shot runs (`hermes -z "…"`) no longer drop their trace. The plugin now registers `on_session_end` and `on_session_finalize`, ships the ending session's still-open run, and joins the export threads so the HTTP delivery completes before the process exits. Finalization is scoped to the ending session, so a gateway teardown of one session never disturbs runs still live in a concurrent session. Previously the background export thread was killed at interpreter exit before the request finished; only long-lived interactive sessions emitted.

### Changed

- Split the `pre_api_request`/`post_api_request` callbacks from `pre_llm_call`/`post_llm_call`. They fire at different times with different payloads, so binding one callback to both created duplicate/mislabeled spans. The `*_api_request` pair is now the LLM-call span boundary (request/response/usage/provider/model/api_request_id); the `*_llm_call` pair frames the turn. The exported OTLP span shape is unchanged.

## [0.1.0]

### Added

- Initial release of `latitude-telemetry-hermes`, a Hermes Agent plugin that streams sessions to Latitude as OTLP traces.
