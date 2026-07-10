# Changelog

## Unreleased

## v0.3.45 - 2026-07-10

### Traces

- Stopped showing the "Waiting for your first trace" onboarding for projects whose traces all predate the default 30-day window. They now open the normal Sessions/Traces view with the time filter available, so the range can be widened to reveal older data (ref: #3961).

### Behaviours

- Removed the breadcrumb row (Back button + topic-path chips) above the behaviours trajectory chart (ref: #3958).

### Models

- Refreshed the bundled models.dev model catalog (ref: #3957).

## v0.3.44 - 2026-07-09

### Agent Dispatch

- Added org-default dispatch configuration with per-project overrides: dispatch repos now resolve from an org-wide default that any project can override or reset, replacing the single flat config (ref: #3952).

### Signals

- Showed freshly created signals immediately even before they have any occurrences (ref: #3945).
- Removed the ghost modal left behind after confirming a mute-signal action (ref: #3946).
- Removed the redundant "Me" option from assignee selectors (ref: #3948).

## v0.3.43 - 2026-07-09

### Monitors

- Gave threshold monitors an open/close incident lifecycle: a sustained breach now opens a single incident and dedups until a 30-minute exit dwell closes it, instead of emailing on every ~5-minute sweep. Editing a monitor with an open incident now evicts the stale incident (ref: #3949).

### Showcase

- Flipped onboarding to the shared read-only showcase: new orgs get only their real empty default project and land on `/projects/lat-demo` when the showcase resolves, with a fallback to their own default project. Retired the old per-signup/claim demo-project seeding machinery (ref: #3940).

## v0.3.42 - 2026-07-09

### Signals

- Generated signals with a research agent instead of a fixed prompt loop, giving richer investigation output (ref: #3922).

### Agent Dispatch

- Skipped agent dispatch for user-created signals on `signal.discovered` so only auto-discovered signals trigger dispatch (ref: #3925).
- Improved the signal dispatch prompt fallback (ref: #3913).

### Notifications

- Enriched signal discovery notification messages (ref: #3937).

### Evaluations

- Surfaced GEPA optimization failures and added support for single-example signals (ref: #3935).

### Showcase

- Added read-only UI variance and org-wide showcase dismissal (S6) (ref: #3918).
- Added a backoffice showcase section for managing the demo project (S7) (ref: #3919).
- Scoped project-section Postgres domains onto `withScopedPostgres` (ref: #3909).

### API

- Restored `getApiKey` as a tool and converted all handler-form operations to execute-form (ref: #3938, #3934).
- Rejected `gtePercentile` on span row filters and fractional values on integer ClickHouse filter fields (ref: #3839, #3924).

### Performance

- Reused instruction extractions across similar system prompts, normalized the instruction-extractor cache key, and raised the verbatim threshold to cut flagger work (ref: #3928, #3926).

### Web

- Optimized the public design system (ref: #3929).

### Telemetry

- Tracked self-hosted deployments in PostHog.

### Infra

- Tuned production ECS memory and autoscaling.

### Maintenance

- Updated bundled models.dev data, refreshed the knip configuration, and bumped `@temporalio/*` to 1.17.5 for a workflow isolation fix (ref: #3895, #3921).

## v0.3.41 - 2026-07-07

### Agent Dispatch

- Enabled dispatching agents directly from monitor incidents, building the dispatch context and prompt from incident data.

### Showcase

- Added a reserved-slug loader and client-collection merge for the showcase project, tightening org-scope resolution across web data domains (ref: #3897).

### API

- Extracted API operation definitions into a transport-neutral `@repo/operations` package shared across HTTP, MCP, SDK, and CLI consumers (ref: #3890).

### Docs

- Documented manual signal creation and aligned the "Issues" terminology to "Signals" across the public docs (ref: #3906).

## v0.3.40 - 2026-07-07

### Search

- Removed the legacy trace-search chunk embedding path and its feature flag, making semantic trace search and highlights use shared message embeddings exclusively (ref: #3904).

### Web

- Kept empty or loading trace lists on the animated connection blank slate so unconnected projects consistently guide users toward instrumentation, even after onboarding has been marked complete (ref: #3905).

### Agent Dispatch

- Updated Cursor dispatch to the v1 agents API payload, deterministic Cursor agent IDs, and immediate config cache updates after connecting a Cursor integration (ref: #3907).

## v0.3.39 - 2026-07-07

### Showcase

- Added automated showcase project regeneration, atomic project swaps, daily cron scheduling, stale-project retirement, and self-healing cleanup so the demo project can refresh safely without leaving old generated projects behind (ref: #3887, #3898).

### Telemetry

- Added Pydantic AI telemetry onboarding, docs, and provider icon support for users instrumenting Python agents with Latitude (ref: #3893).

### Reliability

- Hardened flagger execution so prompt-too-long model failures are treated as no-match results and malformed message parts are skipped instead of crashing flagger runs (ref: #3889, #3874).
- Serialized concurrent claim-token redemption to prevent duplicate organization-claim races (ref: #3899).

### Web

- Fixed searchable selects and rich-text interactions inside modals, including the members role modal, so popovers and editor focus remain usable while dialogs are open (ref: #3901, #3903).
- Removed the agent-dispatch feature flag now that manual dispatch is generally available (ref: #3877).

### Maintenance

- Updated CI, Docker build, npm, Python telemetry, and OpenTelemetry dependency versions used by the workspace and release pipelines (ref: #3775, #3853, #3854, #3856, #3857, #3858, #3859, #3860, #3861, #3862, #3864, #3865).

## v0.3.38 - 2026-07-06

### Signals

- Added a "Send to agent" action on the signal detail page, letting users copy an investigation prompt for local coding agents or manually dispatch the signal to configured cloud integrations such as Cursor Cloud, Claude Code Cloud, Linear, and webhooks (ref: #3845).

### Agent Dispatch

- Added the manual dispatch trigger path for signals, including prompt generation, per-send idempotency keys, dispatch-history labeling, project/config validation, and typed failure results for manual cloud sends (ref: #3845).

### Web

- Polished the integration settings and shared select/modal primitives used by agent-dispatch flows, including searchable selects inside modals, keyboard navigation helpers, provider icons for Cursor/Codex, and copyable dispatch-history errors (ref: #3845).

## v0.3.37 - 2026-07-06

### API and SDK

- **Breaking:** collapsed the four lossy `TraceDetail` message fields (`systemInstructions`, `inputMessages`, `outputMessages`, `allMessages`) into a single `conversation` field on the `getTrace` endpoint. Real multi-turn agent traces showed `inputMessages` only captured the first turn and `outputMessages` only the last, dropping every intermediate turn and tool call, while `allMessages` was already a strict superset; it is now renamed `conversation`. Per-span message fields are unchanged. `openapi.json`, `mcp.json`, the TypeScript SDK (8.0.0), Python SDK (8.0.0), and CLI (6.0.0) were regenerated and bumped as breaking (ref: #3884).

### Signals

- Stopped semantic-similarity live and preview evaluations from persisting permanent false negatives: they now gate on real session embeddings for the active model and skip cleanly (without recording a failure) when vectors are missing, instead of scoring against absent message occurrences (ref: #3872).
- Reworked the describe-signal generation UX around a new WebGL shader-animated `AgentTextarea` — a pulsing brand-color border with a pools-and-tide loading fill that keeps the textarea's own background in both themes, tuned for typing latency. "Generate signal" and "Configure manually" moved to the modal footer, the prompt stretches to full body height, and staged progress is mocked across the ~30s run until the worker streams real step events (ref: #3882).

### Web

- Re-enabled the in-app changelog sidebar and banner, now backed by a static JSON changelog API served from the marketing site; the old `@platform/changelog-framer` was replaced by a new `@platform/changelog-api` reader (ref: #3875).

### Showcase

- Added the showcase resolver chokepoint (S2): a `resolveShowcaseUseCase` and `resolveShowcaseAccess` server helper resolve the pinned showcase org/project from the `latitude.showcase` pointer (Redis-cached) with authz gating on the org's `wantsShowcase` flag. Behavior-neutral — nothing wires it yet (ref: #3881).

### Design system

- Reused the main app's favicon on the public design-system site, which previously served none (ref: #3883).

### Infrastructure

- Added the `design.latitude.so` Vercel CNAME to production DNS (ref: #3888).

## v0.3.36 - 2026-07-06

### Web

- Showed the onboarding illustrations in the account-claim flow by extracting the onboarding right-pane into a shared component reused by both the onboarding and claim screens (ref: #3879).

### Showcase

- Landed the first backend slice of the showcase demo project: a new `@domain/showcase` package with a pointer table, repository, and a guarded create-showcase use-case, plus the Postgres migration. Backend-only groundwork with no user-facing behavior yet (ref: #3830).

## v0.3.35 - 2026-07-06

### Design system

- Launched a standalone public design system site at `design.latitude.so`, extracted from the web app into its own Vite + TanStack Router SPA (`apps/design-system`); the in-app design-system routes were removed (ref: #3834).

### Docs and onboarding

- Published agentic onboarding docs: a new getting-started coding-agent guide covering zero-account and existing-account paths plus the claim flow, a README CLI mention, and in-app coding-agent onboarding copy; the `agentic-experience` spec was retired into `dev-docs/agentic-onboarding.md` (ref: #3876).

### Web

- Showed the billing usage counter in red when a free plan reaches its included credit limit, not only on metered overage (ref: #3878).
- Laid groundwork for the showcase demo project: central mutation-error handling, a read-only write-gate middleware, a `ProjectScope` context, a globally reserved `lat-demo` project slug, and a per-org `wantsShowcase` flag set at org creation. Behavior-neutral today — no new toasts or blocked writes until the showcase scope is enabled (ref: #3822, #3829, #3831, #3828, #3827).

### Reliability

- Guarded trace search formatting against spans whose message parts are missing, preventing formatter crashes (ref: #3873).

### Models

- Updated the bundled `models.dev` data snapshot (ref: #3852).

## v0.3.34 - 2026-07-05

### Reliability

- Resolved `quickjs-emscripten` at API runtime instead of bundling it, so tsdown no longer inlines the emscripten glue and signals script runs no longer die with "require is not a function" (ref: #3840).
- Made Cursor agent-dispatch jobs idempotent and retryable: the Cursor adapter now sends the `agentId` as an idempotency key so retries and 409 conflicts dedupe instead of spawning duplicate agents/PRs, send jobs gained attempts/backoff, and claimed ledger rows are marked failed on final transport exhaustion (ref: #3808).
- Bounded session span-list reads to stop ClickHouse OOMs: `listBySessionId` no longer returns the dynamic attribute maps, the membership coalesce uses bare column equalities so the session/trace bloom-filter skip indexes prune granules, and a 4 GB single-threaded formatting cap is applied to all multi-span reads (ref: #3850).

### Models

- Updated the bundled `models.dev` data snapshot (ref: #3772).

### Infrastructure

- Pointed the `latitude.so` apex and `www` at Vercel and added DNS records for public pages (ref: 26ee482, bd01561).

## v0.3.33 - 2026-07-04

### Web

- Disabled the changelog sidebar UI while the API-backed changelog collection is being updated, preventing the web app from querying or showing the incomplete feature (ref: #3833).

## v0.3.32 - 2026-07-04

### Signals

- Added describe-first agentic signal creation: users describe a behavior in plain language and a worker-backed generator drafts a full signal (detector, judge script, scope) with sandbox validation, preview, and polling-based progress in the Advanced detector tab (ref: #3826).
- Added semantic-similarity conditions to rule detectors so signals can match meaning, not just exact strings; generated evaluation scripts now embed against scoped sessions and score by cosine similarity (ref: #3818).
- Removed the columns toggle and "My signals" controls from the signals list (ref: #3820).

### Onboarding

- Added temporary onboarding accounts: a bootstrap endpoint mints a short-lived account and a `/claim/:token` flow lets users claim it into a permanent org (LAT-704) (ref: #3823).
- Added a global rate limit on the account bootstrap endpoint to guard against abuse (ref: #3825).

### API and MCP

- Improved the MCP query system for dashboard building: span listing gained ordering fields, trace/session/span `p95` metrics became configurable percentile metrics, and agent-dispatch docs and tooling cover building dashboards from agents (ref: #3765).

### Web

- Fixed the setup guide button stretching out of its container in the integration detail section (ref: #3838).

### Reliability

- Retried failed outbox polls so the consumer survives transient DB errors instead of stalling (ref: #3836).
- Externalized `quickjs-emscripten` in the API and workflows bundles so the WASM loader resolves at runtime instead of breaking the build (ref: #3837, #3819).

## v0.3.31 - 2026-07-02

### Signals

- Added AI-authored custom evaluation scripts to the signal builder, including worker-backed generation, sandbox validation against scoped sessions, and polling-based progress in the Advanced detector tab (ref: #3813).
- Refreshed the signal creation flow with detector method selection, clearer explanations of rule, LLM-judge, and custom-script detectors, and more direct edit/test paths (ref: #3813).

### Docs and planning

- Added the LAT-721 observability migration tool spec for self-serve historical imports from Langfuse, LangSmith, and Braintrust (ref: #3805).

### Web

- Declared the web app's `quickjs-emscripten` runtime dependency so QuickJS-backed evaluation script paths resolve reliably in production (ref: 2a89754).

## v0.3.30 - 2026-07-02

### API and SDKs

- Added the `querySpans` API/MCP surface for listing spans across traces, with matching TypeScript and Python SDK support (ref: #3789).

### Traces and spans

- Recovered Vercel AI SDK v6 output when `gen_ai.input.messages` shadowed the Vercel span parser (ref: #3816).

### Web

- Fixed session conversations to scroll to semantic search highlights (ref: #3800).
- Fixed the orphan-session blankslate so it shows when the LLM activity filter hides all rows (ref: #3801).
- Externalized `quickjs-emscripten` so its WASM resolves correctly at runtime (ref: #3785).

### Onboarding

- Optimized onboarding and added in-app support chat help (ref: #3779).

### Docs and tooling

- Added the Latitude CLI reference and made SDK/CLI generation deterministic (ref: #3809).
- Marked SOC 2 as certified across the security compliance pages (ref: #3792).

### Internal

- Repaired the Drizzle snapshot chain after the incidents consolidation (ref: #3811).

## v0.3.29 - 2026-07-01

### Analytics

- Added the composable `queryAnalytics` API/MCP surface for traces, sessions, spans, scores, behaviors, and moments, with metric, breakdown, time-bucket, ordering, and SDK support (ref: #3768, #3778, #3780, #3781).

### Signals and agent dispatch

- Added the signal builder UI for creating, editing, previewing, and renaming signals from the web app, backed by worker-side preview support and rule detector editing (ref: #3773).
- Added signal-to-agent dispatch with integrations for Claude Code, Cursor, Linear, and webhooks, plus settings UI, worker processing, documentation, and idempotent dispatch handling (ref: #3753).
- Returned a validation error instead of crashing when signal list requests ask for more than 100 items (ref: #3786).

### SDKs and CLI

- Upgraded generated TypeScript and Python SDKs to Fern v7, renamed public SDK types to the Latitude namespace, added API-key auth updates, and introduced the generated `latitude` CLI with publishing workflows (ref: #3784).

### Evaluations and sandbox

- Exposed `conversation` as a top-level sandbox global alias for `session.conversation` (ref: #3770).
- Surfaced real GEPA RPC errors in evaluation optimization instead of collapsing them to an unexpected remote RPC error (ref: #3790).

### Docs and UI

- Added voice-agent observability docs for ElevenLabs, LiveKit, and Vercel AI SDK v7 (ref: #3750).
- Fixed GenAI conversation rendering when message parts are missing (ref: #3791).
- Truncated legacy taxonomy observation IDs before domain conversion to avoid ClickHouse-backed observation crashes (ref: #3755).

## v0.3.28 - 2026-07-01

### Signals

- Renamed the public signal impact field `affectedTracesPercent` to `affectedSessionsPercent` (a `[0,1]` fraction) across the list and detail API responses, `openapi.json` / `mcp.json`, and the generated TS and Python SDKs, and aligned the detail path to compute affected sessions / total project sessions so list and detail now report the same metric. Also populated `session_id` in the demo seed scores and spans so the sessions-based impact metric no longer reads 0 (ref: #3767).

## v0.3.27 - 2026-07-01

### Sandbox

- Renamed the sandbox nav section from "Traces" to "Sessions" to match the live project navigation, fixed score filters so they work in the sandbox (reading the current user from a route-independent session hook), and scoped render errors so a filter crash no longer takes down the whole app (ref: #3769).

### Onboarding

- Updated the onboarding flow: deprecated the stack-selection step, refreshed setup instructions, and widened backoffice ActionRow to accept React 19 provider icon components (ref: #3743).

### Signals

- Stopped the signals list priority sections (Urgent → … → No priority) from fragmenting across paginated scroll: sections are now grouped contiguously in a fixed order, the virtualizer keys rows stably across page growth, and loaded pages are deduped by signal id (ref: #3740).

## v0.3.26 - 2026-06-30

### API and MCP

- Added MCP tool annotations (`readOnlyHint`/`destructiveHint`, with optional `idempotentHint`/`openWorldHint`) to all 91 MCP-eligible API endpoints, so MCP clients can tell read-only, additive, and destructive tools apart. Annotations surface only in `mcp.json` and the live MCP transport; `openapi.json` and the generated SDK are unchanged (ref: #3766).

### Evaluations

- Added a use case to generate sandbox evaluation scripts from a freeform prompt: each candidate is smoke-tested against a representative session and regenerated on sandbox failure (up to 3 attempts), with generation telemetry routed to a dedicated dogfood project (ref: #3763).

## v0.3.25 - 2026-06-30

### Telemetry SDKs and docs

- Added a Python Latitude tracer helper with compatibility fixes and updated SDK documentation (ref: 9c8d37e61, 153327065).

### Traces and sessions

- Added in-conversation search and keyboard navigation to session and trace conversation details (ref: #3709).
- Renamed the annotation empty-state copy from issues to signals (ref: 43fd86952).

### Operations

- Retried transient ClickHouse `ECONNRESET` read failures and tuned keep-alive handling to reduce query flakiness (ref: #3745).
- Updated the bundled `models.dev` provider catalog and ignored local `.conductor` agent state (ref: #3752, 15d3a9372).

## v0.3.24 - 2026-06-29

### Signals and evaluations

- Added deterministic rule-based signal evaluations across the API, MCP, TypeScript SDK, and Python SDK, including validated condition schemas and generated pure evaluation scripts (ref: #3739).
- Kept legacy cached clients working by coercing incident `sourceType: "issue"` requests to signals instead of rejecting them (ref: #3741).

### Scores and trace filtering

- Added trace and session filters for human annotation author and "has annotations", backed by ClickHouse `annotator_id` score analytics for new score rows (ref: #3742).

### Telemetry SDKs and docs

- Added telemetry capture lifecycle APIs, simplified AI SDK tracer usage, fixed Python wrapper-mode coroutine context isolation, and documented Cloudflare Think setup paths (ref: 5db2ba85e).

## v0.3.23 - 2026-06-29

### Datasets

- Added dataset custom columns with web, API, MCP, CSV export, and SDK support, including column add, rename, reorder, soft-delete, restore, and custom row cell editing (ref: #3686, #3696).
- Added API, MCP, TypeScript SDK, and Python SDK support for partially editing dataset rows, including custom-column merges that preserve omitted cells (ref: #3687, #3695).

### Evaluations and scores

- Moved evaluation scripts to the session runtime context so judges read the frozen `session` payload, including session-wide conversation, trace rollups, metrics, models, providers, finish reasons, and tool projections (ref: #3734).
- Replaced the Annotations tab in trace and session drawers with a Scores tab that lists annotation, custom, and evaluation scores while preserving annotation editing and legacy tab links (ref: #3737).

### Monitors and telemetry

- Added a cache-hit-rate monitor metric for token analytics so trace monitors can alert when prompt cache reads drop below a threshold (ref: #3654).
- Updated the bundled `models.dev` provider catalog (ref: #3712).

### Operations

- Refreshed CI, workflow, and runtime dependencies including ClickHouse, Turbo, Radix Select, AWS S3 presigning, Python tooling, and GitHub Actions runners (ref: #3718-#3733).

## v0.3.22 - 2026-06-29

### Signals

- Scoped signal score lookup and sort subqueries by organization and project so signal lists, occurrence counts, last-seen ordering, and affected-session counts stay tenant-safe (ref: e3f25cfa2).

## v0.3.21 - 2026-06-28

### Monitors and incidents

- Consolidated monitor alerts into the source-keyed incident and monitor-rule model, including live saved-search targets, normalized API/MCP/SDK responses, incident lifecycle fixes, notification fan-out updates, and a one-open-incident-per-source database guard (ref: #3665).
- Removed the obsolete signal monitors tab and redirected the old route to the main monitors list now that signal escalation is owned by signals (ref: cbea6a3fa).

### Telemetry and ingestion

- Completed an end-to-end telemetry integration QA pass, fixing GenAI/OpenInference parsing, tool-call pairing, OpenRouter metadata, Bedrock cost lookup, Vercel AI SDK v7 system-instruction rollups, and refreshing TypeScript/Python telemetry examples and onboarding snippets (ref: #3711).
- Normalized hyphenated UUID trace IDs during OTLP ingest so non-compliant SDKs no longer break ClickHouse FixedString lookups (ref: #3717).

### Signals and web

- Sped up signal list loading by keeping table rows, counts, and analytics scoped to the visible time range, and defaulted Sessions mode to the last 30 days (ref: #3708).
- Aligned Behaviors/Moments naming across filters and detail views, and restored the Settings entry in sample-project sidebars (ref: #3704, #3706).

### API and operations

- Fixed `listProjects` MCP output validation by stripping internal-only project `settings` fields from API responses (ref: #3703).
- Eagerly initialized QuickJS WASM at worker startup so infrastructure load failures surface immediately instead of being masked as evaluation compile errors (ref: #3714).

## v0.3.20 - 2026-06-26

### Signals and evaluations

- Added API, MCP, and SDK support for creating, updating, and deleting user-authored signals, including evaluation-setting code generation and signal-origin tracking (ref: #3690).
- Fixed signal table filtering to use score activity time instead of signal update time, keeping score-based views aligned with their underlying activity (ref: #3697).

### Datasets and behaviours

- Added dataset export flows for Behaviour sessions and Signal sessions, plus supporting taxonomy and demo-project plumbing for session trace IDs (ref: #3685, #3691).
- Added public dataset documentation, regression-testing guidance, and in-product documentation links, while removing the old simulations docs (ref: #3694, #3700).

### Taxonomy and models

- Made taxonomy retries idempotent and preserved observation identifiers across retry paths (ref: #3698).
- Updated the bundled `models.dev` provider catalog (ref: #3693).

## v0.3.19 - 2026-06-25

### Telemetry

- Shipped the Hermes telemetry connector as a typed Python package with tests, lockfile, docs, changelog, and CI publishing for PyPI releases (ref: #3658, #3677, #3678).
- Added an ElevenLabs Agents telemetry guide and documented Hermes and OpenClaw configuration updates (ref: #3689, #3681, #3672).

### Signals and traces

- Reduced repeated signal analytics fetches by batching list-signal analytics and repository reads across projects, groups, and score counts.
- Fixed signal detail pages so annotation scores list sessions correctly instead of dropping score identifiers (ref: #3682).
- Added an "add to dataset" action from trace and session detail drawers (ref: #3684).
- Expanded the span tree automatically when no span is selected so trace details open with usable context (ref: #3675).

### Web and operations

- Kept expected web 4xx responses out of Datadog Error Tracking while preserving unexpected error reporting (ref: #3671).
- Accepted unknown OAuth error codes in Slack integration routes so integrations can show recoverable failures instead of breaking navigation (ref: #3679).
- Remapped demo-project snapshot trace and session IDs during seeding so seeded demo data stays attached to the target project (ref: #3667).
- Clarified the low-cache-hit-rate flagger description and refreshed public overview and deployment docs (ref: #3664, #3680, #3673).

## v0.3.18 - 2026-06-25

### Spans and ingestion

- Ingested OpenClaw's native `@openclaw/diagnostics-otel` exporter: classified `openclaw.run` and `openclaw.tool.execution` spans into `invoke_agent`/`execute_tool` operations, read per-call tokens and the provider's real cost from `openclaw.content.output_messages`, derived span status from `openclaw.outcome`, and dropped the orphan `openclaw.model.usage` span. The generic transform stays brand-agnostic; OpenClaw specifics live in the resolver layer (ref: #3668).
- Deprecated the hand-rolled `@latitude-data/openclaw-telemetry` plugin and CLI in favor of the native exporter, and rewrote the public OpenClaw docs to recommend it with a production-ingest config example (ref: #3668).

### Models

- Updated the bundled `models.dev` provider catalog (ref: #3669).

## v0.3.17 - 2026-06-23

### Signals

- Standardized generated signal verdicts on `passed=true` meaning the behavior is present, with alignment, discovery, live evaluation, and GEPA prompts updated to use the same convention (ref: #3661).
- Kept failed signal-linked evaluation runs as unowned ClickHouse denominators so absent behavior still contributes to evaluation analytics (ref: #3661).

### Onboarding and demo data

- Sped up sample project seeding by skipping ClickHouse reset mutations for fresh projects and polling asynchronous reset mutations only when retry data exists (ref: #3663).
- Quieted sample-project notification emails and made the behaviours page wait for taxonomy data before rendering empty states (ref: #3666).

### Docs and models

- Reorganized the docs into Observe, Understand, and Refine sections, added spans, tool calls, and behaviours pages, and fixed the introduction image link (ref: #3634).
- Updated the bundled `models.dev` provider catalog (ref: #3632).

## v0.3.16 - 2026-06-23

### Monitors

- Reworked monitor creation to be source-first: create monitors directly from saved searches, tools, users, and sessions through a unified metric alert configuration (ref: #3650).
- Replaced the flat metric dropdown with a dimension-first selector and compact threshold controls, added min/max/median metrics, and simplified thresholds to absolute/relative tabs with capped relative lookbacks (ref: #3650).
- Rendered absolute thresholds and incident markers as overlays on metric charts, and showed duration thresholds in seconds while preserving nanosecond storage (ref: #3650).
- Linked saved-search monitor targets back to sessions with the saved search selected, and made monitor selector rows navigate to monitor details consistently (ref: #3650).
- Classified `listMonitorsForTarget` by target kind so all-users monitors (empty or extra-predicate filter sets) stay in the users dropdown, with null-safe filter containment and a single canonical target-kind decoder across Postgres, the API, and the TS/Python SDKs (ref: #3659).

### Signals and sessions

- Based score analytics on distinct sessions instead of traces, exposed session pages in signal details, and switched signal/monitor/tool-activity views from trace rows to session rows (ref: #3650).
- Moved session monitoring into the sessions action row, matching saved-search-backed monitors and applying their filters to the table (ref: #3650).
- Added a session monitor selector and User ID filter suggestions via the distinct-value combobox (ref: #3650).

### Web and flaggers

- Fixed the settings scroll layout with a per-route `fillHeight` flag so detail routes own their internal scroll while other pages scroll at the viewport edge (ref: #3657).
- Rendered the full flagger strategy catalog by synthesizing disabled records for unprovisioned strategies, creating the row only when a flagger is enabled via a new `findOrCreateFlagger` use case (ref: #3657).

## v0.3.15 - 2026-06-22

### Telemetry

- Landed span-ingestion fixes, upgraded to Vercel AI SDK v7, migrated instrumentors, and ran a full provider e2e audit (ref: #3627).
- Tightened trace and tool-call extraction from ingested spans, updated TypeScript telemetry examples and package metadata, and added a telemetry QA verification tracker (ref: #3655).
- Added telemetry integration documentation and examples for CrewAI, DSPy, Haystack, LiteLLM, Gemini, Groq, Mistral, Ollama, Replicate, SageMaker, Transformers, WatsonX, and Vercel AI SDK v7.

### Analytics and traces

- Aggregated token analytics across the active session and trace filters and added cache hit-rate summaries to trace and session tables (ref: #3652).
- Added cache hit rate as a session and trace field for filtering and table display (ref: #3651).
- Standardized token analytics category labels and tooltip presentation in usage summaries (ref: #3649).

### Signals and flaggers

- Reverted the Phase 2 signal passed-polarity inversion, including historical ClickHouse/Postgres migrations, so scoring polarity stays compatible with existing signal behavior (ref: #3647).
- Added a low-cache-hit-rate flagger preset and API/SDK schema support (ref: #3653).
- Hid behaviour views when fewer than two clusters are available and removed the stale "First seen older" badge from the behaviour drawer (ref: #3642, #3640).

### Sandbox

- Woke archived sandboxes when users enter through the live toggle, reusing or creating an active sandbox as needed (ref: #3645).

### Web and design

- Refined changelog, aggregation, behaviour, signal detail, email, tabs, logo, and trend-bar UI styling (ref: #3644).
- Added a typing animation to the semantic search placeholder (ref: #3643).

### Observability

- Preserved non-Error throw details instead of logging "[object Object]" (ref: #3639).

### Data destinations

- Fixed the destination runs table not scrolling or paginating — bounded the settings scroll container so older runs load within the viewport (follow-up to #3637).

### Dependencies

- Bumped protobufjs, framer-api, the OpenAI Python telemetry dependency, CI actions, and TypeScript telemetry dependencies (ref: #3580, #3452, #3443, #3635, #3636, #3655).

## v0.3.14 - 2026-06-22

### API & MCP

- Added users analytics endpoints exposed over both the public API and MCP, with generated TS SDK types for user overview, activity, usage, behaviours, signals, and cost rollups (ref: #3630).
- Exposed user and tool monitors over MCP, including monitor alert conditions, metrics, targets, and filter sets in the TS SDK (ref: #3631).

### Traces

- Streamed trace conversations in chunks so large conversations load progressively instead of in a single blocking fetch (ref: #3605).

### Data destinations

- Made the destination runs table scroll and paginate within the available viewport (ref: #3637).
- Lowered the destination read page to 2k to keep bull-board responsive during backfill (ref: #3638).

### Web

- Added rotating search placeholder examples to the search input (ref: #3624).

### Terminology

- Updated terminology from OTLP to OTEL across the product.

## v0.3.13 - 2026-06-19

### Data destinations

- Fixed destination backfill/sync stalling under payload-heavy projects: the window read now late-materializes wide payload columns so memory is bounded by the page instead of the whole dedup window (~3.5 GiB peak → ~250 MiB), clearing the ClickHouse 4 GiB cap that tripped the chain, and restores the 5k read page (ref: #3629).

## v0.3.12 - 2026-06-19

### Data destinations

- Simplified the destination data model by dropping the stored max-runs concept, slimming the destination source entity, backfill, and sync use-cases (ref: #3625).
- Lowered the destination runs read page cap to 2k and made the runs table fill the available viewport height (ref: #3628).

### Traces

- Recolored trace and session usage and duration bars for clearer composition of activity tracks, duration breakdowns, and span usage summaries (ref: #3626).

## v0.3.11 - 2026-06-19

### Signals

- Cut over the signals evaluation engine (Phase 2): scoring scripts now decide membership directly with `passed=true` meaning the signal's behavior is present, the host no longer thresholds, and judge/GEPA/flagger/discovery polarity was unified on this convention. A `legacy_polarity` flag normalizes existing judges at the execution boundary and self-drains on re-optimization, and the score `source` field was renamed to `source_type` in Postgres and the domain layer while preserving the ClickHouse column, saved-search filter key, and public `/scores` wire key (ref: #3621).

### Data destinations

- Treated PostHog `429` responses as back-pressure rather than faults: deliveries now honor `Retry-After` and back off instead of quarantining otherwise-healthy destinations, with idle auto-pause and a backfill record cap added (ref: #3618).
- Bounded backfill and live window reads to avoid ClickHouse OOM under wide-payload spans by clamping page size, projecting only needed columns, and adding a per-query memory guardrail so a pathological page fails its own job instead of the whole server (ref: #3623).
- Split the data-destination documentation into separate pages and refined destination status wording.

### Infrastructure

- Increased web service redundancy to 2 replicas.
- Disabled production maintenance mode.

### Models

- Updated the bundled `models.dev` data (ref: #3620).

## v0.3.10 - 2026-06-18

### Infrastructure

- Kept production ALB target groups associated during maintenance redirects so ECS can roll every public service while traffic is redirected to the status page.

## v0.3.9 - 2026-06-18

### Maintenance windows

- Expanded production maintenance redirects to cover every public service hostname, including console, API, ingest, and bull-board, so planned maintenance consistently sends traffic to the status page (ref: 863e46b).

### ClickHouse

- Throttled the `traces` primary-key migration backfill to reduce load while rebuilding trace rollups with `trace_id` in the primary key (ref: 6654694).

## v0.3.8 - 2026-06-18

### Signals

- Renamed Issues to Signals end-to-end across the web UI, API, SDKs, notifications, seeded data, and documentation while preserving the signal lifecycle and analytics flows (ref: #3608, #3610).
- Updated signal scoring, discovery, lifecycle, evaluation alignment, incident, and monitor integrations to use the new signal model and regenerated the TypeScript and Python SDK surfaces (ref: #3608, typescript-sdk-6.1.0, python-sdk-6.1.0).

### Data destinations

- Added destination health tracking, quarantine notifications, per-run metrics, and delivery failure handling so unhealthy destinations are visible and operators are notified (ref: #3606).
- Added destination backfills with historical-boundary support, freshness checks, queued backfill requests, sync-run tracking, and a web backfill modal (ref: #3607).
- Published data-destination documentation, including the PostHog integration guide, and promoted the implementation spec into durable dev docs (ref: #3619).

### Telemetry and SDKs

- Added Flue framework telemetry mapping, filtering, documentation, and a runnable TypeScript example app, plus Eve example app updates (ref: #3617, typescript-telemetry-3.1.1).
- Released agent telemetry redaction updates for Claude Code, OpenClaw, and Pi telemetry packages (ref: e74d119).

### Performance and reliability

- Promoted `trace_id` into the ClickHouse traces primary key for faster trace-specific queries (ref: #3611).
- Reduced trace detail loading work by building conversation span maps client-side and fixed stale span trees when navigating between traces (ref: #3612, #3615).
- Restored the QuickJS Emscripten runtime dependency in worker bundles (ref: #3613).
- Added a production maintenance redirect toggle for planned maintenance windows (ref: #3616).

## v0.3.7 - 2026-06-17

### Workers

- Fixed sandbox evaluation startup in worker bundles by keeping the QuickJS runtime external so its Emscripten loader can resolve the package layout at runtime (ref: 9ebeb71).

### Signals

- Reworked the Signals implementation plan around evaluation-backed sandbox scripts, removed the unbuilt Tracker model, and deferred semantic similarity detectors to a later phase (ref: #3600).

## v0.3.6 - 2026-06-17

### Data destinations

- Added per-source destination configuration with enable/disable status, payload exclusion, max-record limits, atomic source updates, and a delivery preview showing sampled mapped events before saving (ref: #3601).
- Preserved hidden destination and source config fields during updates, showed the source in sync-run history, renamed read counts to records read, and made project-destination cleanup transactional (ref: #3601).

### Telemetry

- Added Eve framework instrumentation support by resolving Eve session and turn ids, preserving `eve.*` spans in the TypeScript SDK smart filter, and publishing the Eve setup guide (ref: #3604).
- Added configurable custom redaction to the Claude Code, OpenClaw, and Pi Coding Agent telemetry packages with exact-name, regex, and mask options plus expanded privacy docs (ref: #3603).

### Web UI

- Grouped the project sidebar into Observe, Understand, and Refine sections, nested traces under sessions, and graduated monitors and behaviours from their feature flags (ref: #3599, #3602, #3597).

## v0.3.5 - 2026-06-17

### Telemetry

- Added Google ADK instrumentation support to the Python telemetry SDK, with example and docs for tracing Agent Development Kit apps (ref: #3595).
- Joined tool calls with their results when mapping OpenInference traces so tool invocations and outputs render together in session and trace views (ref: #3595).

## v0.3.4 - 2026-06-17

### Data destinations

- Added the first data-destinations workflow with encrypted Postgres storage, PostHog delivery, source cursors, sync-run tracking, background sweep/run workers, connection testing, pause/resume/delete flows, project-deletion cleanup, and settings UI for configuring destinations (ref: #3543, #3544, #3545, #3570, #3571, #3574, #3575, #3576, #3577, #3594).

### Monitors and incidents

- Introduced unified monitor targets and metric alerts, including traces and tool-call metric streams, sourceless alert kinds, target-aware monitor creation, in-context tool/user monitor creation, dashboard target columns, matching-trace context, and firing-vertical incident rendering (ref: #3555, #3557, #3558, #3559, #3560, #3561, #3562, #3563, #3564, #3572, #3578).
- Fixed monitor incident table sizing and incident notification formatting (ref: #3585).

### Tools and trace analysis

- Added tool analytics API, MCP, TypeScript SDK, and Python SDK surfaces with summaries, histograms, recent calls, error/context breakdowns, co-occurrence data, parameter statistics, and tool definition details (ref: #3568).
- Persisted defined tools in ClickHouse session and trace rollups, and surfaced where defined-but-never-called tools come from in the Tools UI and trace details (ref: #3541).
- Added the conversation timeline to session and trace detail drawers, with activity tracks, clustered markers, viewport navigation, and highlight-safe annotation selection (ref: #3596, c34339f).

### Onboarding and demo data

- Improved onboarding with seeded sample projects backed by derived demo snapshots and added tooling/workflows to export and seed the demo project dataset (ref: #3584, #3587).

### OSS self-hosting and infrastructure

- Improved the Helm chart with wait-for-dependencies init containers, clearer install notes, Temporal configuration helpers, and Railway one-click deployment docs (ref: #3542, #3573).
- Re-enabled Latitude self-telemetry and tuned production API capacity, Node heap limits, and Datadog sidecar memory for production stability (ref: #3569, 65c99ad, 579e8ea, 62f0eb5).
- Added Temporal worker configuration safety checks and increased taxonomy workflow spreading to reduce burst load (ref: #3592).

### Performance and fixes

- Rebuilt the ClickHouse `sessions` primary key to include `session_id` for faster session-specific reads (ref: #3593).
- Fixed annotation queries without trace ids, conversation timeline marker navigation, settings card text colors, hidden taxonomy clusters in backoffice, and unit formatting when rounded values roll into the next unit (ref: #3591, #3589, #3588, #3551).
- Refreshed bundled models.dev data and bumped CI/dependency tooling, including protobufjs, Claude Code action, and Docker QEMU setup (ref: #3552, #3565, #3566, #3567, #3598).

## v0.3.3 - 2026-06-14

### Trace search

- Fixed Redis Cluster slotting for per-organization trace-search embedding budget counters so daily, weekly, and monthly windows can be read and incremented together without CROSSSLOT errors (ref: #3553).
- Allowed Voyage to truncate oversized embedding and reranking inputs instead of rejecting long trace-search and conversation-intelligence messages with 400 errors (ref: #3554).

## v0.3.2 - 2026-06-13

### Trace search

- Added shared message embeddings for trace search and conversation intelligence, backed by new ClickHouse `message_embeddings` and `trace_message_occurrences` tables with ANN search, occurrence fanout, and a sharded backfill script (ref: #3496).
- Improved semantic trace-search ranking by excluding high-frequency boilerplate messages, raising the relevance floor, defaulting active searches to relevance sort, and clearing stale sort params when filters are reset (ref: #3496).
- Fixed Voyage SDK resolution in bundled API, worker, and web images so semantic embeddings load instead of silently falling back to lexical-only search (ref: #3550).

### Conversation intelligence

- Reused the shared embedding store for session analysis, made workflow warm-up best-effort and replay-safe, and anchored moment labels to the rendered conversation so badges land on the correct turns (ref: #3496, 9e24587).

### Evaluations

- Allowed `zod` and `zod/v4` imports inside the QuickJS sandbox while continuing to block other CommonJS requires (ref: 67e6488).

### Web UI

- Polished the traces filter sidebar and refreshed bundled models.dev data (ref: #3548, 06e7440).

### Dependencies

- Bumped esbuild to 0.28.1 and actions/checkout to 6.0.2 (ref: #3547, #3439).

## v0.3.1 - 2026-06-12

### End-user profiles

- Added user profiles across the platform: end-user telemetry attributes (`user.email` is now a first-class span attribute with its own ClickHouse column and trace/session aggregation), a Users project section with unique/new-users stats, an active-users histogram with drag-to-filter, and per-row activity sparklines and cost rollups, plus a user detail page showing profile, activity, affected issues, observed behaviours, model/provider/tool usage, and sessions (ref: #3531).
- Telemetry SDKs (TypeScript and Python 3.1.0) gained a `userEmail` / `user_email` capture option, and `enduser.id` is now accepted as a user id attribute (ref: #3531).

### Monitors

- Ongoing alert incidents can now be resolved manually: hovering an ongoing incident pill on the monitors dashboard or monitor details reveals a Resolve action, and a new `POST /v1/projects/{projectSlug}/incidents/{incidentId}` endpoint exposes the same flow over HTTP, MCP, and the SDK (ref: #3533).
- Added bulk actions to the monitors dashboard (resolve last incident, mute, remove) with all/all-except server-side selection, a "Resolve last incident" palette command on monitor details, and fixed the issues archived-tab bulk bar to offer Unignore/Unresolve instead of Ignore/Resolve (ref: #3535).

### SDKs

- TypeScript SDK 6.0.0 is now stable (out of alpha), and a new Fern-generated Python SDK ships as `latitude-sdk` 6.0.0 on PyPI — a clean rewrite of the legacy 5.x line targeting the V2 platform (ref: #3534).

### OSS self-hosting

- Added Tier 3 cluster deployment via a cloud-agnostic Helm chart (ref: #3536).

### Web UI

- Session trace sub-rows now show newest-first, matching the sessions table ordering, while keeping "Trace N" labels chronological (ref: #3537).
- Moved the saved-search Save/Update button inside the search bar at its right edge (ref: #3540).
- The sandbox project sidebar now renders the Sandbox toggle, so flipping it off returns to the linked live project (ref: #3528).

### Dependencies

- Bumped hono from 4.12.16 to 4.12.21 (ref: #3484) and refreshed the bundled models.dev data (ref: #3527).

## v0.3.0 - 2026-06-12

### Evaluations

- Added a QuickJS sandbox script runtime for evaluation scripts behind the `evaluation-sandbox-runtime` feature flag: scripts run fully sandboxed with CPU, memory, and wall-clock budgets, `llm()` host calls require an explicit schema, and per-owner detector health is tracked with degraded events (ref: #3524).

### OSS self-hosting

- Made internal AI features pluggable via `LAT_AI_*` env configuration: per-feature generation overrides resolve to OpenAI, Google, custom OpenAI-compatible, Anthropic, or the default Amazon Bedrock provider, with global embedding and reranking configuration to match (ref: #3521).
- Renamed app-consumed `CLICKHOUSE_*` env vars to `LAT_CLICKHOUSE_*`; infra injects both names during the transition (ref: #3521).
- Fixed issue discovery failing on non-default embedding models by making the issue centroid consistency check model-agnostic (ref: #3529).

### Telemetry

- Added a LiveKit Agents content resolver so prompts, responses, tool calls/results, and tool definitions carried on `lk.*` span attributes render in trace details, plus a LiveKit integration guide for Python and Node.js (ref: #3526).

### Conversation intelligence

- Split taxonomy gardening build writes into separate activities, moved clustering into a worker thread, and added adaptive sample sizing with run-level sample metrics (ref: #3519).
- Gardening runs now fail fast when staged plan artifacts are lost from Redis, instead of retrying for days, so the next cron sweep rebuilds from scratch (ref: #3523).

### Background jobs

- Limited default Temporal activity retries to roughly one hour and made validation failures non-retryable (ref: 8b99c5c).

### Web UI

- Reordered the project sidebar to traces, behaviours, tools, issues, monitors, datasets (ref: #3525).
- Removed the resolution behaviour trajectory filter from the behaviours page (ref: bd340db).

## v0.2.9 - 2026-06-11

### Monitors

- Improved monitor discoverability with separate Search and Issue monitor tabs, a Watching column that links back to trace searches, and a save-search flow that can create a monitor in one step (ref: #3509).
- Added monitored-state chips and monitor picker details to saved-search controls, including severity dots and muted-monitor badges so muted monitors remain visible while notifications stay suppressed (ref: #3509, #3522).
- Added shared severity threshold controls for email and Slack notifications, backed by a unified severity palette used across web charts, Slack blocks, email badges, and pickers (ref: #3509).
- Hardened saved-search monitor sweeps by isolating per-alert defects and resolving percentile filters consistently with the traces page (ref: #3509).

### Tools

- Added a Common errors breakdown to tool detail error view, clustering similar failed-call outputs with counts, shares, samples, and error-type badges (ref: #3514).
- Improved tool dashboards with absolute failed-call counts in the error-rate column, clamped long descriptions behind a Show more modal, and preserved search/time params when navigating between tools or opening filtered traces (ref: #3514).

### Traces

- Added span filtering and navigation from session metadata into trace details, including model filter links and a spans filter bar (ref: c05d32f).

### Web UI

- Improved narrow-width usability across navigation, listing headers, toolbars, popovers, settings pages, filters panels, and trace/session drawers so dense pages wrap or overlay instead of clipping or crushing content (ref: #3520).

### Conversation intelligence

- Reduced taxonomy gardening memory pressure by capping clustering samples, using slim clustering rows, and reassigning observations inside ClickHouse instead of round-tripping full rows through workers (ref: #3517).
- Skipped trace-search embeddings for Latitude telemetry projects to avoid indexing Latitude's own dogfood telemetry (ref: #3436).

## v0.2.8 - 2026-06-11

### Issues

- Added a Related issues section on the issue page that combines semantic similarity with session co-occurrence, showing linked issue cards with lifecycle badges, descriptions, activity, and reason chips (ref: #3503).
- Added issue assignee and priority across the issues list and issue page: priority-grouped rows, assignee column/filter, My issues counts, CSV/export filter support, and command-palette actions to assign issues or set priority (ref: #3505).

### Notifications

- Added issue-assigned notifications in a new personal notification group, delivered in-app and by email with per-assignment idempotency, while incident notifications now snapshot and display issue assignee and priority context (ref: #3505).

### Tools

- Added the Tools dashboard and tool detail pages, backed by ClickHouse tool analytics for defined and called tools, usage/failure/latency trends, parameters, context breakdowns, co-occurrence, recent calls, and tool-based trace/session filters (ref: #3508).

### Conversation intelligence

- Added Temporal workflows and activities to backfill recent session intelligence by project and recent sessions (ref: #3506).
- Routed internal AI generations into separate dogfood telemetry projects per feature, improving issue clustering and product-feedback attribution (ref: #3390).

### Telemetry

- Fixed Claude Code telemetry exports for very large traces by chunking OTLP uploads, truncating oversized span attributes with metadata, advancing transcript offsets only after successful export, and hardening Stop-hook state locks (ref: #3511).

### OSS self-hosting

- Added single-host production self-hosting: published multi-arch Docker Hub images, a pull-only `docker-stack.yml`, production-focused `.env.example` values, S3 path-style storage support, deployment docs, and fork guards for deployment workflows (ref: #3513).

### Models

- Updated the bundled models.dev catalog (ref: #3510).

## v0.2.7 - 2026-06-10

### Auth

- Fixed "Session is not fresh" errors when disconnecting a provider in Settings → Account: disabled Better Auth's 24h session-freshness gate (`freshAge: 0`), which blocked unlinking for any session older than a day and guarded no other endpoint we use (ref: e6aa1fb).

### Issues

- Replaced the issue drawer with a full-page Issue view: lifetime impact metrics (occurrences, affected traces/sessions/users, cost and tokens), new assignee and priority triage fields, plus patterns and examples (ref: #3494).

### Spans

- Rendered non-JSON tool input/output (e.g. plain-text errors) as a code block in the span detail panel, matching the JSON path's styling and controls (ref: #3500).

## v0.2.6 - 2026-06-10

### Auth

- Surfaced OAuth login errors on the login page (previously Google sign-in failures bounced back with no feedback) and added a "Connected accounts" section in Settings → Account to link/unlink Google and GitHub, including unlinking the only connected provider since magic link remains a sign-in path (ref: #3497).

### MCP

- Issued refreshable OAuth tokens for MCP clients so sessions can renew instead of expiring, while keeping offline access out of the RFC 9728 protected-resource metadata (ref: #3373).

### Telemetry

- Promoted the Python (`latitude-telemetry`) and TypeScript (`@latitude-data/telemetry`) SDKs out of alpha to stable 3.0.1, so default installs resolve to the 3.x API instead of the legacy 2.0.4 (ref: #3495).

### OSS self-hosting

- Replaced AGPL-licensed `ua-parser-js` with MIT-licensed `bowser`, namespaced all Redis cache and BullMQ keys under a `latitude:` prefix so Latitude can share a Redis instance, and removed deployment URLs baked into the web bundle so one public image serves any domain (ref: #3491).
- Documented the key-free local development path with a new Development docs group and refreshed contributing guide (ref: #3498).

### Models

- Updated the bundled models.dev model catalog (ref: #3493).

## v0.2.5 - 2026-06-10

### Test mode

- Treated Test Mode as a single sandbox per org: capped all plans to one active sandbox and replaced the sidebar dropdown with a context-aware toggle that find-or-creates the org's sandbox and a mirror of the live project you're in (ref: #3492).
- Reworked archived sandboxes to surface an inline "Activate" affordance with the rest of the interface inert, threading sandbox status through route context to avoid an active→archived flash on first paint (ref: #3492).
- Removed the settings Sandboxes list and create modal, and refreshed the public docs to describe the single-sandbox toggle (ref: #3492).

## v0.2.4 - 2026-06-09

### Enterprise SSO

- Added enterprise SSO with SAML 2.0 and OIDC via `@better-auth/sso`, including provider repository and Better Auth schema support (ref: #3434).
- Ordered `tanstackStartCookies` last in the Better Auth plugin chain so SSO sign-in cookies are set correctly (ref: #3485).

### Test mode

- Added the test-mode sandbox layout and traces UI (ref: #3456).
- Lowered the per-key rate limit for sandbox keys (ref: #3462).
- Added user-facing sandbox documentation (ref: #3490).

### Conversation intelligence

- Added filtering of behaviour sessions by trajectory turns (ref: #3479).
- Added a Hungarian lineage continuity matcher with dead-path purge to keep taxonomy topic identity stable across rebuilds (ref: #3476).
- Aggregated metadata in the session search rollup so search results carry merged metadata (ref: #3482).

### Platform

- Removed always-on feature flag gates, simplifying code paths that were permanently enabled (ref: #3454).
- Dropped the deprecated ClickHouse behavior observations table (ref: #3487).

### Telemetry

- Dropped the required `apiKey`/`project` fields from the OpenClaw plugin config schema (v0.0.8, ref: #3458).

### Docs

- Added a Monitors overview page (ref: #3472).

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
