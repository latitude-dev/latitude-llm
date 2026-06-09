# Changelog

## Unreleased

## v0.2.3 - 2026-06-09

### Conversation intelligence

- Rebuilt taxonomy gardening around a top-down divisive clustering pass with depth-aware naming, producing hierarchical topic trees in one bounded run instead of the previous sweep/recurse/merge flow (ref: 70579ffc1).
- Made taxonomy clustering samples day-stratified and deterministic across the lookback window, preventing high-volume recent traffic from dominating rebuilds (ref: #3473).
- Serialized taxonomy naming and added collision guards so sibling topics receive distinct labels before the quality gate runs (ref: #3473).
- Hid the all-encompassing taxonomy root from behaviours tables and topic filters, promoting the first meaningful category level while still showing a single root for tiny corpora (ref: #3473).

### Models

- Updated the bundled models.dev model catalog (ref: #3474).

## v0.2.2 - 2026-06-08

### Test mode

- Added a daily idle-sandbox sweep that archives inactive test-mode sandboxes from the workers service (ref: #3460).

### Demo project seeding

- Made demo-project seeding more resilient on remote ClickHouse by batching large span inserts, moving the fixed-traces sentinel to the end of the seed, parallelizing trace-search embedding, and adding Temporal heartbeats for faster retry detection (ref: #3471).

### Conversation intelligence

- Capped taxonomy gardening sample windows at 10k observations to keep clustering work bounded (ref: deff1fc5b).

### Infrastructure

- Increased workflow task memory and rounded ECS task sizing to valid Fargate increments after adding sidecars, reducing Temporal worker OOM risk (ref: 159a3c2b).

## v0.2.1 - 2026-06-08

### Conversation intelligence

- Fixed backoffice session-intelligence backfills to use isolated child workflow IDs, avoiding collisions with live trace-triggered analysis runs already waiting on debounce timers (ref: 00a186be).

### Test mode

- Added the `lat_sandbox_` token prefix for API keys minted in Test Mode sandbox organizations while keeping live organization keys unprefixed (ref: #3457).

## v0.2.0 - 2026-06-08

### Conversation intelligence

- Added conversation intelligence: a backend pipeline that classifies conversations against a topic taxonomy (with bounded observation sampling and calibration profiles) plus in-product behaviours that surface the resulting signals in the web app (ref: #3422).

### Test mode

- Added the sandbox ingest pipeline for test-mode organizations: an LLM-off gate that skips trace-end fan-out, archived-sandbox ingest refusal (403), a per-period span quota, debounced last-activity stamping, and realtime id-only trace-upsert pulses; introduced the `@domain/sandboxes` package with Postgres/Redis adapters (ref: #3412).
- Added sandbox lifecycle use-cases and an active-sandbox cap per organization (ref: #3411).
- Shortened span retention for sandbox organizations to 7 days via a dedicated TTL rule, leaving live-org retention unchanged (ref: #3409).

### Monitors

- Reworked `savedSearch.escalating` alerts to open on a sustained, bucketed threshold (filtering one-shot spikes) and close dwell-free once activity subsides, removing the old close lag of roughly the window length (ref: #3459).
- Backtraced the close timestamp (`ended_at`) on sustained incidents so it reflects when activity actually subsided (ref: #3467).
- Polished saved-search UI: shorter literal/phrase search chips, clearer "Save search" / "Update search" button copy, and opening the Conversation tab (with match highlight) when a session or trace is opened from a dashboard search (ref: #3468).

### Fixes

- Fixed taxonomy embedding and ClickHouse inserts failing on text containing lone UTF-16 surrogates by sanitizing them first (ref: #3466).
- Fixed a billing deadlock by ordering usage-event inserts by their conflict key (ref: #3463).
- Made the in-app "what's new" changelog popover dismissable with a cleaner collapse button (ref: #3461).
- Hid archived issues from command palette search results.

### Models

- Updated the bundled models.dev model catalog (ref: #3389).

## v0.1.51 - 2026-06-05

### Monitors and API

- Added the full monitor and monitor-alert REST surface under `/v1/projects/{projectSlug}/monitors` (list/create/get/update/delete monitors and alerts, list incidents, mute/unmute), surfaced `monitorAlertId` and `condition` on the `Incident` entity, and regenerated the OpenAPI/MCP specs and TS SDK (new `client.monitors` resource, SDK `6.0.0-alpha.6`) (ref: #3431).
- Fixed saved-search monitor checks missing a discrete burst into an idle project by switching to a leading-edge throttle, so the trailing evaluation window now covers the triggering activity (ref: #3433).
- Fixed `savedSearch.threshold` sustained-incident alerts falling through to the "Unsupported notification" fallback in the in-app bell (ref: #3433).

### Search

- Folded the standalone `/search` page into the project page (Sessions/Traces tabs) with query and saved-search deep-link params, retired the `/search` route, and dropped saved-search user assignment (removed the assign use-case and endpoint) (ref: #3427).

### Test mode

- Blocked all outbound notification channels (email, Slack) for sandbox organizations; in-app notification rows are unaffected (ref: #3408).

### Analytics

- Added the browser's PostHog `$session_id` (plus referrer/UTM) to the server-side `UserSignedUp` event for magic-link signups, so PostHog can bind it to the originating session (ref: #3428).

### Docs

- Polished the README with status/social badges, free-tier and MCP-server callouts, inline provider/framework links, a contributors wall, and reliable npm/PyPI download badges backed by a daily workflow (ref: #3379).

## v0.1.50 - 2026-06-05

### Datasets

- Fixed `listDatasetRows` (API and MCP) failing with an output validation error when a row cell held a JSON array, number, or boolean; dataset cells now accept and round-trip all JSON value types on both read and insert (ref: #3420).

### Test mode

- Added the initial sandbox routing and middleware scaffold for test-mode organizations (ref: #3410).

## v0.1.49 - 2026-06-04

### Monitors

- Fixed "last incident" and "detected at" timestamps to align with the values shown in the incidents table (ref: #3418).
- Fixed throttled saved-search monitor checks not re-firing after the throttle window expired (ref: #3416).

### Notifications

- Aligned the incident-trend chart in email notifications with the layout used in the issue-detail drawer (ref: #3406).

### Traces and sessions

- Fixed the Spans tab not appearing for sessions that contain only a single trace (ref: #3407).
- Added an in-product connect experience on empty Traces pages to guide users through sending their first traces (ref: #3413).

### UI

- Fixed markdown annotation rendering in the genai-conversation component (ref: #3419).

## v0.1.48 - 2026-06-04

### Monitors

- Wired saved-search alert sources into the monitor firing pipeline so monitors alert on saved-search-matched sessions (ref: #3392).
- Connected issue events to monitors with mute-aware notifications, so muted monitors suppress incident alerts correctly (ref: #3387).
- Polished monitor dashboard, detail panel, and alert forms UX (ref: #3381).

### Issues

- Closed escalation automatically when an issue is resolved or ignored, and added a cold-start exit to prevent stale escalation loops (ref: #3396).

### Traces

- Added a duration composition bar to trace and session drawers showing the proportional time breakdown across spans (ref: #3382).

### Command palette

- Added org-wide search across all projects so users can jump to sessions, traces, and monitors without switching project context first (ref: #3378).

### Search

- Split session search into a candidate-fetch and literal-IN rollup for a significant query performance improvement (ref: #3380).
- Fixed the session panel sliding left on the first-hit scroll (ref: #3388).

### Analytics

- Fixed PostHog org-group attribution so organization-level analytics are correctly attributed end to end (ref: #3391).

### Claude Code telemetry

- Fixed silent hook failure on Node.js < 20.12 by adding a version check in a thin entry-point wrapper that prints a clear error instead of crashing invisibly (ref: #3405).
- Fixed `BUN_OPTIONS` not reaching the Claude binary on Linux when launched from VS Code by adding a systemd user environment path during install (ref: #3405).

### UI

- Kept Button text visible when using `asChild` with default, destructive, and secondary variants (ref: 805502e).

## v0.1.47 - 2026-06-03

### Traces and sessions

- Switched trace and session outlier baselines to project-wide cohorts so percentile badges appear reliably on low-volume or heavily tagged projects, with matching UI copy and repository/use-case updates (ref: #3371).

### Flaggers

- Requested classifier message indexes as quoted strings and recovered no-output structured generation failures as no-match classifications to avoid Bedrock/Claude runaway numeric literals (ref: #3377).

### Models and observability

- Refreshed bundled `models.dev` metadata used by model selection and pricing data (ref: #3376).
- Temporarily disabled Latitude telemetry span export while keeping the setup ready for re-enablement (ref: fd4b8e7).

## v0.1.46 - 2026-06-02

### Monitors and incidents

- Added user-created monitors, monitor rename/delete flows, alert add/edit/delete controls, saved-search alert sources, sensitivity editing for system issue monitors, and supporting domain/repository use-cases (ref: #3367).
- Tuned incident popover timing and spacing, and showed the incident issue name consistently (ref: 78e3a07).

### Issues and flaggers

- Kept ignored issues from regressing or escalating during score assignment while still clearing resolved issues when they re-enter escalation (ref: #3366).
- Prevented malformed flagger message-index output and added regression coverage for false-positive and malformed JSON paths (ref: #3369).
- Anchored trashing detections to consecutive repeated tool calls and attached deterministic matches to the offending message index (ref: #3363).

### Changelog and docs

- Added an authenticated changelog banner/sidebar entry flow with fallback cover imagery and stronger changelog item handling (ref: #3372).
- Added contributing and code-of-conduct documentation plus GitHub issue and pull-request templates for open-source contributions (ref: #3374).
- Replaced the getting-started overview demo GIF with a video embed (ref: #3360).

### Datasets

- Moved the dataset `expected_output` column directly after `output` in the dataset table (ref: #3370).

## v0.1.45 - 2026-06-02

### Datasets

- Returned small dataset CSV exports synchronously while queuing and emailing only exports above 5,000 rows, and surfaced typed ready/queued/too-large API and SDK responses (ref: #3344).
- Added `expected_output` to dataset rows across CSV import/export, row editing, ClickHouse storage, API schemas, and the TypeScript SDK (ref: #3358).

### Monitors and incidents

- Added the monitor detail panel with incident history, mute confirmation, refreshed kind naming, and updated incident notification copy (ref: #3365).
- Added a backoffice action to reset system monitors for an organization (ref: #3365).

### Backoffice and taxonomy

- Added project taxonomy visibility in backoffice, including domain read models and the Postgres taxonomy repository (ref: #3348).

### Flaggers and AI generation

- Displayed the thrashing flagger as "Thrashing" in docs and UI-facing metadata (ref: #3362).
- Added custom OpenTelemetry tagging for system-instruction summarizer AI generation and avoided importing `node:crypto` into the client bundle (refs: 53b77b6, b05a506).

### Platform

- Refreshed bundled model metadata and upgraded deployment, workflow, CI action, PGlite, Pulumi, and CLI dependencies used by the platform (refs: #3335, #3349, #3350, #3351, #3352, #3353, #3354, #3355, #3356, #3357).

## v0.1.44 - 2026-06-01

### Flaggers

- Reduced NSFW and jailbreak false-positive annotations by making deterministic keyword/prompt-injection matches require the LLM confirmation pass instead of directly marking traces as matched (refs: 0cc592a, 1cfe25a).
- Tightened jailbreak evidence collection to user prompts only and required extracted evaluated-agent context before running LLM-capable flagger judgments, avoiding matches on system, assistant, or tool content quoted for analysis (refs: 5eb45a, 0cc592a).
- Switched evaluated-agent context extraction to the dedicated MiniMax extractor model and stricter structured-output validation so missing context falls back safely instead of producing misleading evaluator input (ref: dcc019c).

## v0.1.43 - 2026-06-01

### Monitors

- Added the feature-flagged Monitors surface and backend foundation, including Postgres schema, domain/repository read paths, incident hydration and pagination, and OpenAPI/MCP incident enum updates (refs: #3330, #3339).
- Provisioned system issue monitors for all projects on creation and via backfill, then added monitor metadata, mute/delete, and alert-update use-cases for the upcoming detail panel (refs: #3342, #3345).

### Navigation and onboarding

- Added a global Cmd+K command palette with project, organization, navigation, issue, dataset, saved-search, trace, page, and monitor search/actions, plus a searchable project switcher (ref: #3343).
- Reworked onboarding right-pane previews with an animated product tour, mock issues, Slack notifications, and live trace-tail states (ref: #3331).

### Integrations

- Refreshed rotated Slack bot tokens on demand under an org-scoped single-flight lock and showed a reconnect-required banner when a refresh chain is broken (ref: #3334).

### Search, sessions, and tables

- Aligned aggregation cards and histograms with the active Traces/Sessions rollup so session filters and metrics use session-level repositories consistently (ref: #3332).
- Right-aligned string values in end-aligned infinite-table columns (ref: #3341).

### Flagger and taxonomy

- Reduced nested-evaluator false positives by extracting evaluated-agent context, ignoring system-role evidence, and scoping assistant-only prompt guidance to assistant-centric flaggers so user/input detectors still fire (refs: #3333, #3346).
- Retried taxonomy clustering lock acquisition with capped exponential backoff and full jitter to avoid prematurely assigning observations to noise during contention (ref: #3325).

### API

- Raised dataset trace imports from the critical to the high rate-limit tier for higher-volume API imports (ref: 5ab4cb5).

## v0.1.42 - 2026-05-29

### Search

- Promoted the session-rollup view to the primary `/search` route, porting saved searches and the Export Traces / Add to Dataset bulk actions, and retired the legacy trace-flat search and the Live Taxonomy panel (ref: #3320).
- Applied session defaults to bulk-action filters on `/search` and the project Sessions tab so trace counts and Select-All exports match the visible list (ref: #3320).
- Opened orphan session search hits as their underlying trace instead of "Session not found" (ref: #3320).

### Traces and ingest

- Added project-level trace sampling at the OTLP ingest boundary, deterministic on session id, so sampled-out batches skip object storage, the queue, ClickHouse insert, and the downstream `TracesIngested` fan-out (ref: #3324).
- Unified project general settings under a single Apply/Discard flow with Cmd/Ctrl+S, Escape, and a navigation guard for unsaved changes (ref: #3324).

### Issues

- Moved Ignore/Resolve lifecycle buttons back into the drawer top toolbar for both the standalone issue drawer and the session drawer (ref: #3327).

### Workers

- Recorded BullMQ job failures with Datadog-compatible exception attributes on worker spans so errors can be searched and grouped by type (ref: 3c9d0b2).

### Docs

- Added documentation for AWS Strands agents (ref: #3326).

## v0.1.40 - 2026-05-29

### Onboarding and integrations

- Added an optional Slack onboarding step and channel-routing flow so teams can connect Slack during setup or manage routing from integrations settings (ref: #3319).

### Sessions, traces, and issues

- Brought filter parity between sessions and traces, including additional filter fields, status and percentile filtering, aggregation support, and ClickHouse repository coverage (ref: #3316).
- Kept the issue list populated when projects only have archived issues, avoiding an empty-state regression for archived issue views (ref: 30f2457).

### Wrapped reports and data

- Added a feature-flagged 41st merch promo banner to Claude Code Wrapped emails and notification rendering (ref: #3322).
- Refreshed bundled models.dev provider/model data (ref: #3323).

### Docs

- Updated README setup guidance (ref: #3321).

## v0.1.39 - 2026-05-28

### Sessions and issues

- Added issue drill-down inside the session drawer, including sortable issue rows and trace overlays that return users to the issue context on close (ref: #3314).
- Restored flagger-sourced issue metadata in issue drawers and allowed signal-only annotations with empty feedback text (ref: #3314).

### Flagger workflows

- Reworked flagger configuration in onboarding and project settings with shared presets, grouped settings rows, buffered apply/discard behavior, dirty-state guards, and accessible sampling sliders (ref: #3318).
- Anchored deterministic jailbreak and NSFW matches to the triggering message so generated annotations point to the exact conversation turn (ref: #3317).

### Product experience

- Improved the in-app changelog popover interactions and switched the unread news affordance to a dot indicator (ref: #3315).

### Infrastructure

- Fixed production release tagging so tags are created from the latest `origin/development` commit after the changelog release commit is pushed, and improved release-script safety checks (refs: c5d2841, 0307b56).

## v0.1.38 - 2026-05-28

### Sessions, traces, and search

- Added a session detail drawer with metadata, conversation, traces, annotations, and issues tabs, plus slide-to-trace navigation from session rows (ref: #3295).
- Polished live taxonomy recommendations with clearer loading, trend, tooltip, and keyboard-focus behavior (ref: #3306).
- Improved click-triggered navigation across tables and badges by rendering real links for new-tab, copy-link, and pre-hydration support (ref: #3312).

### Flagger and issue workflows

- Bounded flagger-on-flagger recursion with a no-reflag telemetry marker while preserving one level of production flagger monitoring (ref: #3304).
- Sanitized truncated flagger snippets so partial emoji or malformed UTF-16 cannot break Bedrock prompt payloads (ref: #3310).
- Showed flagger badges on automatically monitored issue drawers and aligned score repository sampling with production behavior (ref: #3311).

### Demo data, analytics, and reporting

- Seeded demo-project derived data for taxonomy, scores, and embeddings with resilient failure handling and workflow coverage (ref: #3308).
- Added onboarding type identification to PostHog analytics events (ref: #3313).
- Fixed Wrapped social previews by using an absolute `og:image` URL (ref: #3307).

### Infrastructure and docs

- Added production-only Hex read-only database access through an SSH-tunneled Aurora reader path, including Pulumi config and runbook documentation (ref: b2b4ec6).
- Refreshed telemetry quick-start documentation and pnpm workspace install configuration (refs: 35eb022, 473fa5f).

## v0.1.37 - 2026-05-27

### Search and traces

- Improved session and trace search relevance sorting, tie-breaking, and saved-search/API sort options (refs: #3301, aac69e1).
- Added literal, token, reasoning, tool-response, and semantic-region highlighting in trace conversations, including first-match scrolling and large-message QA coverage (refs: #3282, #3292).
- Added live taxonomy-backed search recommendations and the underlying behavior taxonomy pipeline, workers, repositories, migrations, tuning scripts, and documentation (refs: #3280, #3287).

### Product experience

- Added an in-app “What’s new” popover backed by Framer CMS changelog entries (ref: #3300).
- Added a flagger onboarding step so new projects can choose enabled automatic flaggers before telemetry setup (ref: #3297).
- Improved chat conversation rendering for media loading/error states, file cards, and design-system coverage (ref: #3303).

### Flagger and notifications

- Bound classifier feedback to saved flagger annotations and added AI review gating so annotations stay coherent with match decisions (ref: #3302).
- Replaced the incident email annotation-card monogram with the Latitude icon (ref: #3290).

### Wrapped reports and analytics

- Added Claude Code Wrapped V2 with token totals, week-over-week comparisons, leaderboard position, V2 email/OG rendering, seeded V2 reports, and redesigned backoffice analytics (ref: #3299).

### Infrastructure and reliability

- Fixed SqlClient transaction isolation so concurrent Effect fibers use separate Postgres transactions while nested calls reuse the current transaction (ref: #3294).
- Added Framer secrets to infrastructure and web runtime configuration (ref: 6782d44).
- Updated bundled models.dev data and removed MCP plugin docs for now (refs: #3293, #3298).

