# Changelog

## Unreleased

## v0.3.92 - 2026-09-04

### Signals

- Signals with no mapped Agent Score dimension are left untagged instead of being labelled "Diagnostic". The badge read as a classification of its own, while an empty set only means no dimension applies (ref: #4553).

### Maintenance

- The signal score evidence backfill job resolves the production workers service by listing and matching the generated ECS service name, so the confirmation-gated dispatch stops failing on the exact-name lookup (ref: #4550).
- Bumped `fflate` to 0.8.3 (ref: #4551).

## v0.3.91 - 2026-09-03

### Signals

- Signals promoted before dimension classification shipped can be backfilled. A one-off worker script selects promoted, system-discovered signals that still have no score evidence and at least one published occurrence in the last month, reuses the deterministic flagger mapping when a dominant mapped flagger exists and otherwise classifies the canonical name and description with the LLM. It defaults to a read-only routing preview, takes an advisory lock, and is launched from a confirmation-gated `workflow_dispatch` job so a production run is deliberate (ref: #4549).

## v0.3.90 - 2026-09-03

### Monitors

- Monitor windows now evaluate on the activity axis instead of the run's start. A check asked "did any matching trace happen in the last 5 minutes?" but answered it against the trace's earliest span, so a run longer than the window was already outside it by the time trace-end triggered the check and could never alert. Rows now qualify when their latest ingested span ended inside the window; `queryAnalytics`, experiment metrics and every dashboard keep plotting by start time, and incidents still backdate `startedAt` to the run's start so the alert points at the right run (ref: #4548).
- Match monitors alert once per matching run rather than on every check while the run is live, with Redis markers recording what has already been alerted, and monitored predicates drop absolute time conditions that would otherwise silence a monitor for good once a saved search's date range aged out (ref: #4548).
- Monitor targets created through the API, MCP, SDK or CLI never persisted their filters, so every one of them evaluated against the whole project; the target's filters are now folded into the persisted predicate. The publish throttle also matched the window exactly and raced the previous marker's expiry, leaving roughly half the windows unevaluated; it is now strictly shorter than the window (ref: #4548).
- The monitor surfaces were realigned with the new axis: the list ranks by when the last incident was raised in SQL as well as on the client, point incidents report when they matched instead of claiming to have closed at a backdated instant, chart markers follow the axis of the bars they sit on, and the matching-sessions panel, its "View all" link, the chart and the incidents now describe the same set. A single-value `eq` filter renders in the filters sidebar instead of appearing blank (ref: #4548).

### Signals

- Signals are classified by Agent Score dimension. Evidence is mapped from flaggers, latched at promotion and exposed through the API, with dimension badges on the signals list, detail view and session rows, and a dimension filter on the list. Only a strict-majority mapped flagger writes dimensions; unmapped and ignored signals show as Diagnostic so a model guess cannot freeze the wrong roles (ref: #4543).

### Imports

- Resuming a capped import no longer inflates rollup counts. Already-stored traces were admitted as billing-free but still re-inserted, and while ReplacingMergeTree dedupes spans, `traces_mv` does not; imports now check existing identities before insert, matching live ingest (ref: 155edd9f1).

## v0.3.89 - 2026-09-02

### Flaggers and taxonomy

- The Refusal flagger now considers tools declared across the session before marking a refusal as inappropriate. Requests requiring unavailable external actions or unsupported modalities, such as attaching or exporting a document, are treated as capability limitations, while native model work such as summarizing supplied text remains eligible for annotation (ref: #4517).

## v0.3.88 - 2026-09-02

### Security

- Revoking an API key now actually stops it from authenticating. The token-hash lookup ignored `deleted_at`, so a revoked key kept working on both the API and ingest and re-armed its 5-minute positive cache on every use. The lookup now returns active keys only, the shared validator drops a non-active key as a second guard, and a key whose organization has since been deleted is rejected the same way instead of authenticating against a missing org (the API returned a 404 there, ingest accepted it). Deleting an organization, from the settings danger zone, sandbox deletion, account deletion or the temporary-org reaper, now revokes every one of its API keys and OAuth keys and busts their validation caches before the row goes. OAuth cache hits re-verify that the application is still enabled and bound to the org, not only that the user is still a member. Better Auth's `GET /api/auth/mcp/get-session`, which handed the raw token row including the refresh token to any access-token holder, is blocked at the web auth catch-all (ref: #4538).
- Webhook agent dispatch connects to the address it validated instead of letting `fetch` re-resolve the hostname at connect time, which left a DNS-rebinding window to internal addresses. Host and SNI stay on the original hostname, redirects are rejected as transport errors, and the 64 KiB and 1s ack limits apply while the response streams (ref: #4500).

### Billing

- Billing usage inserts had been failing since 2026-09-01T00:00:01Z: the partition migration only created partitions through August and the maintenance function was never scheduled. Workers and workflows now run it on boot and a daily billing job keeps the current month plus the next three, so partitions exist before inserts need them. A partition race during concurrent replica boot is logged instead of taking the process down (ref: #4540).
- Hard-capped imports admit at most the remaining plan credits, rootless trace groups included, and finish as capped with the plan-cap reason when that budget is what stops the page. Already-stored traces stay free so children-then-root pagination or a re-import cannot consume the budget twice, and a plan-truncated page keeps its cursor so Continue import refetches the omitted traces (ref: #4537).

### Signals

- Ignore, resolve and mute no longer reach unpromoted candidates through the public lifecycle; those writes are treated as not found, and a later promotion of a candidate carrying such a stamp does not emit `signal.discovered` (ref: #4530).
- Promotion re-checks its gate before stamping `promoted_at`. A delayed qualification job re-reads the distinct-session count against the volume-scaled threshold while locking the matching score rows, so evidence removed in the meantime cannot still promote the candidate (ref: #4531).
- Consolidation's ClickHouse reconciliation retries after a transient failure. The job was published with a bare dedupe key, so an exhausted retry shadowed outbox redelivery and left occurrence counts permanently short after a merge; the marker now expires with a throttle, matching promotion and flagger fan-out (ref: #4495).

### Flaggers and taxonomy

- Reflag classifiers discard matches anchored on non-assistant lines, which had been matching evidence quoted inside user prompts (ref: #4229). User-centric flaggers skip the signal-details dogfood traces, whose user prompt quotes end-user complaints and raised a false frustration signal (LAT-TUA1). The jailbreaking hint extractor now catches safety-rule-override and bulk memory-dump phrasing while ignoring ordinary refund, policy and database-export wording (ORA-RROJ).
- Topic naming caps the conversation digests it samples. Concatenating up to twelve roughly 24 KB digests made the model follow instructions nested inside the samples and return malformed structured JSON (LAT-XLQ3).

### Traces and memories

- Span ingestion retries are safe for the `traces_mv` rollups: identities already in ClickHouse are skipped before insert so a post-insert retry cannot double counts, tokens, cost or duration. Ingestion jobs retry ten times with exponential backoff on transient storage failures, and a redaction error is terminal rather than retried (ref: d4734266d).
- A memory store wiped at the same timestamp it was created no longer reads as a net add. Ledger reads and materialization order by end time, start time, ingest time and span id, so create-then-wipe and wipe-then-create resolve deterministically (ref: 76e8f2f4a).

### Telemetry

- Hermes plugin fixes: unfinalized sessions survive the 256-session LRU cap so auxiliary usage reconciliation is not skipped silently (ref: #4511); session finalize waits for the hook-visible ledger flush within the existing 10s teardown budget before deciding to skip auxiliary usage, so approval, compression and title-generation usage is no longer dropped (ref: #4510); a memory tool reporting zero entries while a sister session repopulated the store no longer tombstones or overwrites live records (ref: #4505).

### GitHub integration

- Reference actions apply when an already-merged PR is edited, which never took the closed-and-merged path, and the applied marker clears when the stored action changes so revert and unresolve can run after a push-first absorb (ref: dba91e438).

### Infrastructure

- CloudWatch Logs ingest is cut to stay under the 5 GB cap: Datadog agent and CloudTrail events no longer ship there, RDS Postgres log export is off, and only warn and error application output goes to awslogs. The API access logger writes the incoming line before the handler returns so long requests stay visible in flight (ref: #4539).

### Docs

- Added agent-facing UI design guidance in `design.md`, referenced from the web-frontend skill (ref: #4542), and synced dev-docs for signal terminology, shareable score anchors and the OSS telemetry heartbeat (ref: #4518).

## v0.3.87 - 2026-09-01

### Telemetry

- A second agent running in its own Cloudflare Durable Object now joins the caller's trace instead of starting one of its own, published as `@latitude-data/telemetry` 4.1.0. A Durable Object gets a fresh isolate with no shared memory and no ambient OpenTelemetry context, so the planner a turn delegated to, often the most useful part of the trace, landed orphaned; the object is also evicted whenever it goes idle with no hook that runs first, so anything still buffered was lost. `injectTraceContext()`, `extractTraceContext()` and `withTraceContext()` carry the active span and Latitude context across the boundary in a carrier keyed by HTTP header names, so one object serves both an RPC argument and `fetch` headers, and injecting from inside a tool's `execute` parents the callee on that tool call, which is what makes it render as a subagent rather than something that merely ran during the same turn. `withParentContext()` covers frameworks that take a tracer instead of a callback, attaching only the first span to the remote parent so the framework's own nesting survives. `createDurableObjectTelemetry()` makes flushing cheap enough to do at every unit of work, the only reliable point on a runtime that evicts without warning: exports are serialized and coalesced, a caller arriving mid-export gets a later one, in-flight exports register with `ctx.waitUntil()`, and a failed export is reported instead of failing the turn. A missing or malformed carrier leaves the callee a root and never throws. Ingest needed no changes (ref: #4529).
- The Python telemetry dev extra installs on `openai` 3.x again: `openai-agents` moves to 0.21.0, the first release that accepts it, `openinference-semantic-conventions` is pinned to the version the 0.1.56 OpenAI instrumentor requires, and LiteLLM is no longer co-installed because every published version still requires `openai<3`. Install LiteLLM separately for its examples (ref: #4527).
- Corrected the Claude Code hook docs on why `SessionEnd` was added. A backgrounded `Stop` hook outlives an interactive quit, measured at 11.2s past process exit, so that path was never losing anything: `SessionEnd` is a backstop there and the actual fix on the headless path, where the hook is registered and never spawned (ref: afe2e8855).

### Cost

- The Cost page's All-time view now reports over full history. The chart header already said All-time, but the KPIs, per-session decomposition, cache economics, breakdown table and model impact panel were still reading the roughly 30-day chart window, so the totals disagreed with the label. The KPI window is now separate from the trend slice, matching Tools, and the full-history reads wait for the project's first trace to settle rather than fetching the fallback window and immediately refetching (ref: #4316).

### Traces

- Fixed the Traces page returning a 500 for a percentile filter over All time. `findLastTraceAt` and `countAnnotatedByProjectId` passed `gtePercentile` filters straight to the clause builder without the resolution step every other trace query runs, so a valid filter such as duration >= p99 failed with an unsupported-operator error (ref: #4090).

### Evaluations

- Signals archived by the muted-to-ignored backfill no longer keep running, and billing for, live evaluations. That migration stamped `ignored_at` without archiving the linked evaluations; a follow-up migration soft-deletes them, and live evaluation execution now skips an ignored signal, including jobs already in flight (ref: #4224).

### Models

- Updated the bundled models.dev data (ref: #4444).

### Docs

- Product links now point at `console.latitude.so`. `app.latitude.so` is v1, so the OAuth endpoints documented in the partners guide, the webhook deep-link example and the quick-start signup links were all sending people to the wrong app; the PII redaction curl also moves off the v1 `gateway.latitude.so` host to `api.latitude.so` (ref: #4528).
- Added the Agent Score benchmark spec: one project-level score computed from telemetry Latitude already collects, needing no per-trace judge and no customer-configured evaluation. It scores five dimensions a user already knows how to reach in the app (Outcome, Reliability, Cost, Speed, Safety), where Cost and Speed measure waste rather than how cheap or fast the agent is, safety acts as a ceiling instead of a weighted term, and every lost point decomposes into named causes each carrying its share of the loss and the points recovered by fixing it alone (ref: #4526).

## v0.3.86 - 2026-09-01

### Partners

- Added a private partner API so a third-party platform can offer "install Latitude" from inside its own product. A staff-registered partner holds an HMAC secret and calls one signed endpoint to create a user, an organization and its own OAuth grant, receiving the same token pair the interactive consent flow would have produced. The registry is a global staff-managed table with no tenant scope, carrying the partner's scopes, an optional IP allowlist and the redirect URLs stamped onto every grant, so a provisioned account can re-authorize later through its own `client_id` instead of accumulating a second entry in the user's Keys settings. Requests are signed Stripe-style with the nonce inside the signed string, claimed only after the signature verifies; every pre-scope refusal returns an identical 401 so the surface cannot be used to enumerate partner ids. Provisioning never touches an existing account: a taken email is a 409 and the partner falls back to the interactive flow. Staff manage partners at `/backoffice/partners` (ref: #4508).

### Billing and self-hosting

- Billing enforcement is now opt-in behind `LAT_BILLING_ENABLED`, default off, so a self-hosted deployment is never rejected at ingest or aged out by a plan's retention. An organization with no override resolves to a new unenforced `self-hosted` plan whose retention comes from `LAT_TELEMETRY_RETENTION_DAYS`; usage events are still recorded, they just gate nothing. A malformed value dies as a configuration defect rather than falling back, because both silent outcomes, metering a self-hoster and not metering Cloud, are worse than a crash. Latitude Cloud sets the flag on every service (ref: #4515, #4516).
- Hardened the OSS deployment heartbeat: the whole path is wrapped so a Redis failure cannot reject startup, the PostHog project key ships with the build so a production self-host reports without extra configuration, and `LAT_IMAGE_TAG` is passed through the Docker stack so heartbeats carry the compose image tag (ref: #4513).

### Telemetry

- Hermes and Claude Code traces now correlate across processes, published as `latitude-telemetry-hermes` 0.3.0 and the Claude Code hook 0.0.15. Both emitters minted their own trace ids, so a Claude Code session launched by a Hermes turn appeared as an unrelated trace and a shared session id could group them but never show that one launched the other. Both now read a W3C traceparent from the environment and parent their root span on the supplied span, with `LATITUDE_SESSION_ID` joining the parent's session and `LATITUDE_PROJECT` keeping both halves in one project, since ingest is project-scoped and a mismatch splits the trace silently. Hermes publishes its active tool span through `child_env()`, or onto `os.environ` around each tool call behind an opt-in flag so any subprocess inherits it. Joining is capped per session, and a session launched on its own is unaffected (ref: #4524, #4525).
- Fixed headless Claude Code runs emitting nothing at all, which the correlation feature depends on. The hook was registered only on an async `Stop`, and Claude Code exits before spawning an async Stop hook in headless mode, so `claude -p` was invisible even though headless is how another harness drives it. The installer now also registers a synchronous `SessionEnd`, which additionally catches interactive quit and Ctrl-C; the two never double-count, and both hand their work to a detached worker so session teardown is not delayed. Existing installs need `install` re-run to pick up the entry (ref: #4524).
- Fixed the Claude Code hook proceeding without its state lock when another hook held it, and the stale-payload sweep deleting files it had not written in a user-configured directory (ref: #4523).
- Rewrote the Hermes docs around upgrading the plugin, including that a running Hermes must be restarted to pick up a new version (ref: #4504).

### Traces

- Bumped `rosetta-ai` to 2.3.0, adding server tool call request and response parts, a compaction part, the `document` content type and the `compaction` finish reason to the conversation vocabulary. The change is additive (ref: #4501).

## v0.3.85 - 2026-08-26

### Signals

- Near-duplicate candidates now merge into one promotable signal. Discovery could split a real problem across several one-session candidates, none of which reached the promotion gate alone; a pass runs whenever a candidate's centroid moves, merges the neighbours above the similarity floor, and re-qualifies the survivor, so the union faces the gate its fragments could not. A promoted signal is never absorbed nor picked as survivor, and each pass is capped, because there is no demerge (ref: #4482).
- Candidates that stop accumulating evidence are now swept. Every signal row carries a 2048-dimension centroid that hybrid search scans exactly, so this is the first mechanism that lets the corpus shrink rather than only grow; a candidate idle past the promotion window is provably something nobody has seen. Their scores stay attached, which is what keeps the sweep from feeding the same annotations back into discovery (ref: #4482).
- An absorbed candidate now records the signal that took it over, and the ClickHouse pass that moves its scores resolves the sweep set from Postgres at execution time. Two merges in a chain publish independent jobs with no ordering between them, which could strand rows on a soft-deleted signal and leave the survivor's occurrence count permanently short (ref: #4482).

### Web

- A score's conversation anchor is now shareable. Clicking an anchored score already scrolled the Conversation tab to the message it points at, but the position was wiped from the URL the moment it landed; the focus now lives in a `scoreId` search param that survives, so the link reproduces the scroll and highlight on load. Opening a session from a signal lands on the anchor of the score that signal recorded there, and that first scroll now actually reaches it, waiting for the conversation to render and its layout to settle (ref: #4478, #4483).

### Telemetry

- The Hermes telemetry plugin now recovers the conversation, memory, tools, and usage a session was losing, published as `latitude-telemetry-hermes` 0.2.0. It normalized only the OpenAI Chat Completions message shape, so on Hermes's Codex/Responses path every tool call and result was dropped from the conversation and assistant text arrived as a JSON blob. Everything else in the hook payloads is now read too: system instructions, tool definitions, tool error status and duration, the real response model, time to first token, end-user identity, and the delegating subagent. Added alongside it are memory telemetry for the built-in stores, derived and user-defined tags and metadata, `config.yaml` as a second configuration surface, secret and attribute redaction, and accounting for the auxiliary calls Hermes makes through a client that fires no hooks at all. The export path was rebuilt so every span id ships exactly once, and the per-turn flush budget dropped from 10s to 2s (ref: #4499).
- Ingest now normalizes OpenAI Responses items into the GenAI vocabulary, so `output_text`, `function_call`, and `function_call_output` from any Responses-dialect instrumentation pair and render like every other conversation instead of reaching storage as unknown part types (ref: #4499).

### Docs

- Rewrote the Hermes telemetry page around the settings that changed: every option is now readable from the profile's `config.yaml` as well as the environment, time to first token requires `plugins.stream_reasoning_deltas`, and secret redaction is on by default. Added sections for running several agents in one project, memory, usage and cost, and privacy, and fixed the troubleshooting step that told you to confirm the plugin with `hermes plugins list`, which never works for a pip plugin (ref: #4499).

## v0.3.84 - 2026-08-19

### Web

- List pages that sit under a chart or summary panel no longer scroll the table inside its own short box. `InfiniteTable` gained an opt-in external scroll mode where rows virtualize against a scroll container the page owns, so the panel and the table scroll as one section and the table header pins to the top once it reaches it. Rolled out to Sessions, Traces, Behaviors topics, Monitor incidents, and the Tools and Users lists, with the panel above pinned in place when the table scrolls sideways (ref: #4476).
- Reworked the project detail page headers and controls into a shared section header, and cleaned up the surrounding chrome: the bordered `Tabs` variant no longer overflows its container at the small size, behavior view chips and hotkey badges follow the same sizing, and each key of a shortcut renders in its own square (ref: #4476).
- Fixed the project switcher staying open, and painting over the modal, after clicking `Create new` (ref: #4476).

### Signals

- Flagger feedback now recovers from a transient job failure. Submitting a verdict published its fan-out with a permanent dedupe key, so one failed job silently shadowed every later publish and flaggers stopped being graded even though customer verdicts were stored. The fan-out and per-trace review jobs now use an expiring throttle, letting outbox redelivery retry them (ref: #4477).

### Documentation

- Rewrote the flagger documentation to match what ships: the four flagger groups, which ones use an LLM and which are deterministic, what each one does and does not flag, and that detection reads the whole session while the annotation lands on the trace where the problem appears. Refreshed the annotation overview, the effective-annotation guide, sampling, and the PM quick start alongside it (ref: #4481).

## v0.3.83 - 2026-08-18

### Signals

- Signals that a flagger detected can now be graded. The detail header carries a one-shot thumbs-up/thumbs-down control; a thumbs-down requires a reason and offers `Save and ignore` to archive the signal in the same click. The verdict is recorded once and cannot be changed afterwards, and the control only appears on Latitude's own detections — a hand-written signal has no decision of ours behind it to grade (ref: #4472).
- That verdict now travels back to the generations that produced the detection. Flagger scores record the trace of the classify call behind them, so submitting feedback annotates those exact generations inside the `latitude-flaggers` project, which then cluster into signals about a flagger that keeps mis-firing. Deterministic detections and cached generations carry no trace and are skipped (ref: #4472).
- Discovered signals are no longer named by a model at creation. A candidate carries a deterministic placeholder built from its first occurrence's own words, and the real name and description are generated once at promotion, over the whole cluster. This fixes signals reaching production titled `description`, or described as the model explaining that one occurrence is not enough to identify a shared pattern (ref: #4471).
- Promotion is now two steps: passing the evidence gate records the qualification, and promotion itself generates the summary before the signal becomes visible. A signal is therefore never visible carrying the raw sentence it was created from, and everything downstream, agent dispatch and Slack included, sees a fully named signal. A failed generation still promotes under the placeholder rather than leaving the signal invisible with nothing to retry it (ref: #4471).

### Notifications

- Raising a signal's priority now notifies the organization in-app, by email, and over Slack, with the person who made the edit excluded. Setting a priority for the first time counts as an increase; downgrades and clears never notify. The topic ships opt-in, because it fires on routine triage activity, so enable it under the Signals group to receive it (ref: #4474).
- Notification topics can now declare their own default, which is what lets an opt-in topic stay silent across both email and Slack until it is enabled. Existing topics keep delivering by default (ref: #4474).

### API and SDKs

- Added `submitSignalFeedback` across the REST API, MCP, the TypeScript and Python SDKs, and the CLI (`latitude signals submit-feedback`), and `signals.get` now returns the submitted verdict. Published as SDK 9.10.0 and CLI 7.10.0 (ref: #4472).

## v0.3.82 - 2026-08-17

### Signals

- Discovered signals now have to earn their place before anyone sees them. A signal opened by discovery stays hidden until distinct sessions back it up, against a threshold that scales with the project's session volume (floor of 2, capped at 15). Until it is promoted it stays out of lists, search, analytics and escalation, sends no notification and dispatches no agent. Promotion is one-way and every signal that already existed was backfilled as promoted, so nothing currently visible disappears (ref: #4407, #4465).
- The `signal.discovered` notification and agent dispatch moved from creation to promotion, and the dispatch is now idempotent for the lifetime of the signal rather than per day, so a discovery can no longer open a second pull request (ref: #4465).

### Notifications

- Split the Monitors notification group into separate Signals and Monitors groups. Signals carries a checkbox per lifecycle event (discovered, escalating, regressed), Monitors stays a single switch, and both now offer the minimum-severity selector in email and Slack. Existing preferences and Slack routes were copied into both new groups, so delivery is unchanged until you edit them (ref: #4466).
- Fixed Slack route topic checkboxes silently saving nothing, unsubscribe links in already-delivered emails failing on the retired `incidents` group, and two quick preference toggles landing out of order (ref: #4466).

### Behaviors

- Facet lenses now accumulate coverage across gardening passes instead of labelling only the sampled window. Each pass routes the facet's cached projections against its staged leaf centroids, so widening the date range on a facet view keeps adding sessions, with no extra LLM calls per pass (ref: #4419).

### Scores

- Hid failed live evaluations that matched no condition from the Scores tab and the negative Indicators count, where they were showing up as unlabeled thumbs-down. A failed evaluation that already owns a signal stays visible (ref: #4443).

## v0.3.81 - 2026-08-14

### Traces

- Fixed the latest-output preview picking up spans that carry no assistant message, so trace and span lists now show the real last output (ref: #4439).
- Stopped OpenInference reasoning items from rendering as empty message bubbles in the span detail view (ref: #4438).

### Sessions

- The Indicators column now counts every score source instead of only human and flagger annotations, so the badge matches the total shown in the Scores tab. Evaluation score cards drop the evaluation name and always link to their parent signal (ref: #4440).

### Settings

- Extended the organization-vs-project integration split to Slack and GitHub, which previously had no organization page. All six integrations now follow one rule: the organization tab owns the shared connection and the default projects inherit, and a project's tab owns that project's override (ref: #4442).

### Models

- Updated the bundled model and pricing catalog (ref: #4436).

### Docs

- Added a Status link to the docs header pointing at status.latitude.so (ref: #4441).

## v0.3.80 - 2026-08-13

### Settings

- Split integration management into an org-vs-project model. Connecting, disconnecting and editing the organization default for Cursor, Claude Code, Linear and Webhook now lives under Settings > Organization > Global integrations, while a project's integration page shows a "Using default" / "Differs from default" badge with override and reset. Defaults keeps PII redaction and GitHub monitoring. Editing the org default stays owner-gated; disconnecting is unchanged (ref: #4433).

### Filters

- Grouped the session and trace filters by function instead of by control type. The sidebar now renders headings for Identity, Status, Models & tools, Performance & cost, Conversation, Scores and Custom, with a search box that narrows by filter or group label. Half-typed values in debounced text and range controls survive a search, and expand/collapse state does too (ref: #4361).

### Docs

- Added a guide for running agent simulations locally (ref: #4435).

## v0.3.79 - 2026-08-13

### Cost

- Added cost-per-session analysis. It compares equal time periods and shows how traces per session, LLM calls per trace, tokens per call, model selection, token mix, and prices changed the result. It requires at least 20 sessions in each period and shows the comparison window and pricing coverage (ref: #4324).
- Improved the Cost dashboard with clearer panels, better empty states, model links, and pricing coverage indicators. Fixed cost lookup for model versions that use different version punctuation, and updated the bundled model and pricing catalog (ref: #4389, #4383, #4315, #4412, #4422).

### Behaviors

- Ended adaptive taxonomy shadow builds. Each organization now uses the adaptive builder only when its `adaptiveTaxonomyClustering` flag is active; other organizations use the static builder. Removed the environment-wide `LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE` setting (ref: #4388).
- Improved behavior trees by removing empty grouping levels, preserving session totals, and naming sibling groups together so labels are easier to distinguish (ref: #4408, #4410).
- Limited custom behavior counts and charts to the time range that has assignment data. The catalog now shows the data scope and start date for each behavior group (ref: #4411, #4414).

### Signals and monitors

- Unified signal priorities and monitor severities on one scale. Monitors and incidents now support `urgent` in the app, API, SDKs, and CLI. This is an additive API enum change, so strict clients must accept the new value (ref: #4362).
- Fixed urgent signal escalation notifications for urgent-only Slack and email routes. Also stopped recovered tool errors from creating tool-error signals (ref: #4404, #4362).

### Agent dispatch

- Allowed agent-dispatch webhooks to return external agent IDs, run IDs, and a link to the external run (ref: #4369).

### Sessions

- Fixed session duration when instrumentation refers to root spans that were not exported. These sessions now use their wall-clock duration instead of zero (ref: #4429).

### Telemetry

- Fixed smart export filters that dropped the parent spans of retained spans. The TypeScript and Python telemetry SDKs now export the required ancestors so Latitude receives a connected span tree (ref: #4428).

### Flaggers

- Removed profanity from extracted agent context before Latitude stores it or sends it to downstream classifier prompts (ref: #4406).

### Experiments

- Fixed baseline filter menus that appeared behind sticky experiment table columns (ref: #4430).

## v0.3.78 - 2026-08-05

### Imports

- Added historical trace imports from Langfuse, LangSmith and Braintrust, so a team evaluating Latitude backfills its own history instead of starting from an empty project. Each source sits behind one adapter port and walks time windows newest-first, so a capped run keeps the most recent traces and can resume from its cursor; credentials live on the job row and are cleared when it finishes. Imports meter through the existing credit gate at a trace apiece, with plan-aware limits shown before the run starts, and a `ProjectDeleted` consumer cleans up job state. An imported span resolves through the same resolvers as a live one, which fixed four things on the live path too: a span carrying only `exception.type` now records an error type, a `gen_ai.tool.definitions` value wrapped in a `{tools: […]}` object yields its tools, an Anthropic-dialect tool definition keeps its `input_schema` parameters, and a TTFT longer than the span that measured it reads as unknown rather than as fact. Docs in `dev-docs/imports.md` (ref: #3849).
- Reworked the import wizard into Platform → Preview, gated on a live connection test, with a searchable source-project selector, a 10-trace sample and a size slider capped at the 100k hard maximum that warns when the range holds more. The wizard is shared between the imports settings modal and a new Import tab in the telemetry instructions, so onboarding and the traces empty state offer imports too. The settings list became a jobs table with status, progress, duration and counts, plus per-row cancel, retry and continue (ref: #3849).
- Fixed a succeeded import reading 1% forever when it drained a source smaller than the requested cap, so the cap is no longer used as the denominator once a run completes. Also fixed the wizard's date-range picker being unclickable inside the modal: its popover portaled to `document.body`, where an open dialog leaves `pointer-events: none`, and two bundled copies of `@radix-ui/react-dismissable-layer` meant the popover never learned to re-enable them (ref: #4350).

### Cost

- Added the reference the cache panel was missing: an achievable ceiling per model, the share of cache-eligible volume whose gap to the preceding call falls inside the provider's documented cache lifetime. It is measured across an agent's whole traffic and never within a session, because a cache read does not care which conversation wrote the entry; measuring within-session gaps would score a high-volume single-turn workload at 0% and call the ideal caching case unfixable. Lifetimes enter the registry keyed by provider and model prefix with every entry citing its doc page, and an unlisted pair returns null rather than guessing. Cadence comes back as one cumulative gap histogram over the offered lifetimes, so the lifetime selector is a lookup rather than a refetch and no pricing crosses into the browser (ref: #4323).
- Added estimated savings and the recommendation cards on top of that judgment, modelled from tokens times registry prices and labelled as estimates. The counterfactual follows the recommendation, so "stop caching" is priced against caching switched off rather than against the ceiling it was told to abandon. Cards are gated on a weekly spend floor and always read documented lifetimes, so a lifetime the reader is exploring never becomes our recommendation (ref: #4323).

### Privacy

- Added custom redaction rules for project-specific identifiers, in three kinds: drop a named span attribute, match a literal term list, or match a regular expression. Detection no longer keys off the closed entity enum, so a pattern can ship without widening it, and rules cascade by replacement like entities. An omitted `rules` field preserves stored rules while an explicit empty array clears them, and the rule editor now waits for a verdict on the current draft before Save goes live, with a failed check distinguished from an unfinished one (ref: #4341).
- Hardened the pattern scanner: overlap is judged under the rule's own `ignoreCase` flag, so `[a-z]+[A-Z]+x` compiled with `i` is refused at the source instead of passing every gate, which is precisely the polynomial shape the scanner exists to catch. Rule-draft validation is now gated on organization admin, and a corpus of roughly 175 coding-agent strings (package specifiers, semver, git SHAs, UUIDs, paths, diff hunks, SQL, stack traces, plus redaction's own output) is asserted against the whole default entity set, so a detector that broadens and starts eating another entity's negatives fails loudly (ref: #4341).

### Behaviors

- Kept the last good taxonomy when a rebuild collapses to a bare root. A garden run whose sample clears the gardening minimum but cannot split produced a root-only tree, and publishing then retired every active cluster and activated a tree with no behaviour under it, so a project whose traffic thinned for a week lost all its behaviours even though a healthy tree existed the day before. The publish sequence is now gated on the built tree's top-level count for the static and adaptive paths alike: a degenerate rebuild completes the run empty and leaves the prior tree serving (ref: #4347).

### Billing

- Fixed the usage counter double-counting overage in the sidebar and on the billing settings page. `consumedCredits` already includes overage, so 133k plus 33k displayed as 166k. Remaining, included-used, progress and limit state are now derived server-side in the billing overview DTO, leaving the UI to format and render (ref: #4345).

### Spans

- Stopped clamping uncached input tokens to zero when reported cache exceeds reported input. An inclusive input count contains its cache sub-categories by definition, so it can never be smaller than them, but the resolver had no such check and the "always inclusive" convention still fired, subtracting real input down to zero. Our own Claude Code telemetry hits this on every span, which zeroed `tokens_input` on 100% of priced Claude Code spans in production. Genuinely inclusive emitters keep subtracting as before (ref: #4346).

## v0.3.77 - 2026-08-04

### Cost

- Added the cost breakdown table and model usage over time, below the spend trend. One ClickHouse projection is read twice in parallel — grouped for the rows and ungrouped for the window totals — so a row is never divided by a differently-filtered denominator, and each row reports its unpriced usage so an understated total says so. The model series is ranked by spend with everything past the top six collapsed into one "Other" group (ref: #4313).
- Added cache economics: exact hit rates per model and a break-even derived from each model's own registry prices, `(input - cacheWrite) / (cacheRead - cacheWrite)`, rather than a threshold we pick. A pure classifier turns the two into one of six states, shown as a comparison table with actual and break-even on one shared track (ref: #4317).
- Recovered 4.15B unpriced tokens by aliasing the `fireworks` provider to its catalog id and matching bare model ids within their own provider's list, so an OpenRouter call for `grok-4.5` prices against `x-ai/grok-4.5`. A single match is the whole condition, so two vendors sharing a bare name stay unpriced rather than borrowing a rate. The unpriced-span alert now fires only on zeros a catalog entry could fix, and backoffice gained a triage view (ref: #4321).

### Privacy

- Raised deterministic PII detector accuracy from 60% to 91% against a labelled corpus of 118 occurrences, pinned case by case so an improvement shows in the diff as clearly as a regression. Headline fixes: a trailing period no longer disables card, phone and IP detection; internationally formatted phone numbers are matched; DSN and assignment-key credentials (`POSTGRES_PASSWORD=`, `Authorization: Bearer`) are detected; missing vendor token prefixes and Slack webhook URLs are covered; and false positives on `max_tokens`, `cache_key`, `logo@2x.png` and NANP-shaped metrics are gone. Known limits are now published on the PII redaction docs page (ref: #4318).
- Retired the `crypto_wallet` redaction entity. An all-lowercase 40-character hex string is both an Ethereum address and a SHA-1 digest, so that half was never safe to enable. Stored policies and in-flight queue jobs naming it are dropped rather than failed, while an unknown entity still fails closed. **Breaking for API clients** that send `crypto_wallet` in `settings.redaction.entities`; both SDKs and the CLI are regenerated (ref: #4318).
- Fixed ingest redaction deleting content-carrying span attributes instead of redacting them, which showed an `enforce` project a span the exporter never sent. Every key is kept with its value replaced: string maps get the same structural JSON walk as parsed columns, and a match on a numeric attribute relocates the key into `attr_string` as a whole-value placeholder (ref: #4333).

### Settings

- Unified organization defaults and project overrides behind one "Set by" control. Privacy, agent dispatch and GitHub monitoring each now show which scope owns the setting, how many projects inherit versus override it, and the selector itself is the override/reset action. Scope switches are staged with an explicit Apply, so flipping the dropdown no longer deletes a project's policy on click. Added an Organization Defaults page for setting a default before any project cares, moved Integrations and Data destinations under Project, split connected integrations from the catalog with per-integration status, and put Disconnect behind a confirmation (ref: #4331).

### Behaviors

- Restored adaptive taxonomy clustering on the pilot project, which had fallen back to static on every run since Jul 28. The near-gate re-search was exceeding the clustering worker's deadline and being terminated: it now spends its budget on the root only, over just the best-scoring K values from the first pass, and an unaffordable re-search is declined up front from a projected operation count rather than started and killed. Failed builds now report their elapsed time and reason instead of `0ms` with no message (ref: #4334).
- Fixed changing a view's cohort filter while its scoped garden was running. The replacement run was dropped as already-started, so the in-flight run wrote clusters for the old cohort against the new filter. The run is now terminated before the purge and re-garden (ref: #4332).

### API and MCP

- Restricted `/v1/mcp` to OAuth bearers. As a route inside the protected ring it also accepted an organization API key, which let a client skip consent, org binding and per-client revocation by pasting a long-lived key into its MCP config. Rejecting with 401 makes such a client fall back to discovery and complete the OAuth flow (ref: #4335).
- Send `WWW-Authenticate` on bearer-auth 401s so MCP clients can discover the authorization server per RFC 9728, instead of relying on guessing the conventional metadata path (ref: #4336).
- Throttled the public `exportTraces` endpoint, the only export operation that enqueued export jobs and emails without a rate limit. It now shares the 10/hour cap its siblings use, with the 429 documented in the OpenAPI contract and regenerated into both SDKs and the CLI (ref: #4228).

### AI

- Fixed a Bedrock generate that falls back from MiniMax M2.5 being priced at the requested model's rates, which cost and billed every fallback-served call at exactly 2x. Results now carry the model that actually served them, round-tripped through the AI cache, and both the evaluation-cost and credit-metering paths read it (ref: #4340).
- Fixed a fallback generate reporting only the fallback's latency under the primary model's name with no record that it degraded. The clock starts before the primary attempt and the primary failure is recorded on the `ai.generate` span (ref: #4339).

## v0.3.76 - 2026-07-30

### Sessions

- Made the statistics panel actually follow the sessions/traces toggle. The histogram was pinned to sessions, four of the seven cards are sums that read identically either way, and the Sessions card ignored the mode. The panel now resolves its metric per mode, shows the per-trace average under each sum card, and drops the Sessions card in traces mode (ref: #4312).

### Backoffice

- Ranked the Organizations table by credit spend for the current billing period and surfaced it as a column, still enriched with 30-day trace activity. Listing is pinned to an `asOf` cursor so a period boundary crossed mid-scroll cannot reshuffle pages (ref: #4306).

## v0.3.75 - 2026-07-30

### Cost

- Added a project-scoped Cost section behind the `costDashboard` organization flag: a KPI row, a cost-over-time chart with Total/Average/p95, and the data-confidence strip later cost panels build on. Every figure is gated to billable operations so wrapper and tool spans cannot double-count spend, per-trace denominators count only traces with at least one billable span, buckets and labels are UTC, and the still-filling bucket is drawn hatched or dashed so the last point is not read as spend falling (ref: #4290).

### Behaviors

- Fixed Behaviours going blank on every rebuild. Publication activated the new tree while its clusters were still named "Pending", so the read filtered out every node for the whole naming phase, and until the next garden run if naming failed. A fresh tree is now saved as staging, named, then reassigned and swapped in one step, so the previous tree keeps serving until the new one is displayable (ref: #4305).

### Annotations

- Fixed annotating reasoning blocks. The anchor resolver accepted only text parts, and in a coding-agent trace every turn before the final answer is reasoning plus tool calls, so annotating anything but the last message failed (ref: #4304).
- Fixed annotating user messages written with soft line breaks or raw HTML. Those text runs lost their source offsets, so the selection popover opened and then closed without resolving an anchor (ref: #4302).

### Integrations

- Fixed integration dispatch targets being stored per project. Connecting an integration wrote a project override only, so "Send to agent" reported "Finish setting up <kind>" from signals in every other project and auto-dispatch never fired there. Connect now seeds the organization default and the repo picker updates it; existing override targets are backfilled to the default with triggers left off, so the current auto-dispatch scope is unchanged (ref: #4308).

### Email

- Restored the logo image in notification email headers, which broke when the app switched to an inline SVG wordmark and the PNG was removed (ref: #4309).

### Models

- Updated the bundled models.dev catalog data (ref: #4287).

## v0.3.74 - 2026-07-30

### Traces

- Recorded why a span's cost is zero. A stored 0 could mean a provider reporting a free call, a model we could not price, or a span with no tokens, and all three read identically. Spans now carry `cost_source` (`provider_reported`, `estimated`, `unpriced`, `no_tokens`, `unknown`), and traces and sessions carry an unpriced span count so a rollup total can say when it is a floor rather than an answer. Spans stored before this keep their cost and read back as `unknown` where a zero is genuinely ambiguous (ref: #4293).
- Priced gateway-routed models. A gateway names itself as the provider and carries the real vendor in the model slug, so those spans matched no pricing entry and priced at zero. Spans now also record which catalog entry an estimate came from, in `cost_priced_provider` and `cost_priced_model`, which makes a partial model match a plain query (ref: #4293).

### Behaviors

- Stopped coding-agent harness context from firing jailbreak flags. Claude Code `<system-reminder>` blocks and Conductor `<system_instruction>` blocks are product-injected session context rather than user prompt injection, so they no longer count as jailbreak evidence and harness-only turns are skipped (ref: #4286).
- Fixed deleting a behavior or filtered view while it was still generating. The in-flight garden workflow was not terminated first, so it kept writing clusters and assignments for a deleted view. Deleting a whole-project behavior now cascades to its filtered views, and the UI blocks delete while the target view is generating (ref: #4252).

### Onboarding

- Added a required "How did you hear about us?" question, with optional free text when "Other" is picked so it never blocks completing onboarding. Answers are stored as stable slugs, so the options can be re-worded without breaking historical segments, and they sync to Loops alongside job title and phone number (ref: #4282).
- Added country-code selection to the onboarding phone field, including the invite-claim flow, which had its own copy of the form (ref: #4294).

### Web

- Added command palette entries for MCP setup and for each integration (Slack, GitHub, Cursor, Claude Code, Linear, Webhook). None of them previously answered a Cmd+K search for the tool's own name, and the MCP guide was reachable only from the signal detail page (ref: #4296).
- Fixed the organization switcher hiding every other organization after a switch, caused by a stale internal filter query persisting between opens (ref: #4295).
- Fixed the Store Home dashboard failing for projects older than about 30 days, where the all-time range produced trend buckets larger than the one-day cap the server functions accept (ref: #4252).

### Analytics

- Added Microsoft Clarity session recording across the app, gated on `VITE_LAT_CLARITY_PROJECT_ID`. It is absent when the variable is unset, so local development and the public self-host images load no third-party recorder, and it is kept out of staff and impersonated sessions (ref: #4279).

## v0.3.73 - 2026-07-29

### Privacy

- Added a Privacy page under Project settings that turns PII redaction on. It holds both layers of the cascade: the organization policy (owner only, with a lock that stops admins from weakening it) and the project policy, which shows the effective values the ingest pipeline resolves. Redaction was already wired end to end but had no control surface, so every project resolved to `off`. Enabling it invalidates the ingest cache so it applies immediately, and policy changes emit audit events with before/after snapshots (ref: #4257).
- Exposed the redaction policy on the public projects API: `settings.redaction` (mode, entity categories, metadata scope, identity handling) is now readable and patchable (ref: #4257).
- Rendered redaction placeholders such as `[REDACTED_EMAIL]` as inline chips in conversation content, so a placeholder reads as something the platform did rather than as model output or corrupted text (ref: #4257).
- Fixed settings writes clobbering each other. Every writer sent the whole settings object to a use case that replaced it, so renaming an organization wiped the spending limit and the showcase flag, and the project Signals toggle and sampling slider each dropped the keys they do not render. Writers now patch only the keys they own, merged inside the same transaction (ref: #4257).

### Traces

- Fixed $0 cost on Claude Agent SDK spans. Mastra reports the SDK's npm package name in `gen_ai.provider.name`, which never matched a pricing entry, so spans carrying millions of tokens priced at zero. Added aliases for the agent SDK package names and corrected the `anthropic_vertex` alias, which pointed at a provider id that does not exist and silently zeroed Vertex Anthropic span cost and credit metering. Cost is computed at ingest, so existing spans keep their stored value (ref: #4278, #4284).
- Reported spans that cannot be priced instead of failing silently. Ingest aggregates them per project, provider and model and reports them on a dedicated error span, throttled to one report per hour per combination. The batch still succeeds, since the spans themselves are valid (ref: #4278, #4284).

### Web

- Redesigned the subagent chat view: tool calls render as labeled Input/Output disclosures, subagent cards collapse to a single-line preview, and nested subagent conversations are navigable through a breadcrumb trail that collapses past four levels (ref: #4281).

## v0.3.72 - 2026-07-28

### Conversation intelligence

- Stabilized adaptive taxonomy root splits. When the best root candidate lands just below the separation gate, the build now re-searches with a larger restart budget instead of collapsing, so top-level topic counts stop swinging run to run as the window turns over. Corpora comfortably above or below the gate behave exactly as before (ref: #4274).

### Web

- Fixed the "Linear API settings" link in the agent dispatch setup modal, which pointed at a hardcoded Linear workspace instead of the reader's own (ref: #4256).

## v0.3.71 - 2026-07-28

### Traces

- Added inline PDF previews to conversation attachments: a first-page thumbnail inside the file card that expands into a scrollable viewer with zoom, page navigation, and keyboard control. Cross-origin PDFs keep the open-in-new-tab card. Assets are self-hosted so air-gapped deployments render correctly (ref: #4246).

### Behaviors

- Reshaped Behaviours into a catalog: `/behaviours` lists behavior cards (Topics plus curated presets or a custom one), each behavior has its own page with a tree and its saved views under `/behaviours/:slug/views/:view`, old flat view links redirect, and creating a behavior streams a cold-start analysis with a health read and refine/stop. Behind the `customBehaviors` flag; orgs without it keep the current page (ref: #4204).
- Documented behaviors, views, and facets in the public docs and moved the page under Understand, with a redirect from `/search/behaviours` to `/behaviours/overview` (ref: #4247).

### Web

- Fixed PostHog session stitching so anonymous latitude.so visitors merge into the signed-up user, and the first authenticated pageview carries its organization group (ref: #4205).

### Conversation intelligence

- Prevented lone UTF-16 surrogates from truncated transcripts and moment evidence, which broke ClickHouse writes and Bedrock prompts (ref: #4225).
- Skipped user-centric flaggers on taxonomy nested samples so wording quoted inside cluster samples no longer triggers frustration flags (ref: #4226).

### Models

- Refreshed the bundled model catalog with updated providers, capabilities, limits, and pricing (ref: #4227, #4232, #4251).

### Internal

- Landed the span ingestion PII redaction core (detectors, JSON and text redaction, policy cascade) plus its spec. Not wired into ingestion yet, so behavior is unchanged (ref: #4245).
- Wired PII redaction into the ingest pipeline. The organization/project policy cascade resolves at ingest time and redaction runs before spans are written, failing the batch rather than writing plaintext if a policy is malformed. There is no configuration surface yet, so organizations that have not opted in are unaffected. New optional `LAT_REDACTION_PSEUDONYM_SECRET` keys identity pseudonymization (ref: #4248).

## v0.3.70 - 2026-07-26

### Traces

- Fixed PDF conversation attachments mislabeled as images so they render as document cards, with previews for linked files and downloads for inline files (ref: #4231).

### Models

- Refreshed the bundled model catalog with new providers and models, including Claude Opus 5 availability, plus updated capabilities, limits, and pricing (ref: #4223).

## v0.3.69 - 2026-07-24

### Memory

- Fixed an empty Memory page by pinning store activity trends to 30 one-day buckets (ref: #4221).

### Web

- Rewrote AI-sounding UI and email copy across the app so it reads more naturally (ref: #4219).
- Used `HotkeyBadge` for the sidebar search shortcut for consistent shortcut styling (ref: #4217).

## v0.3.68 - 2026-07-24

### GitHub

- Added a least-privilege GitHub App integration that turns merged code into signal lifecycle transitions: when a PR or commit referencing a signal slug lands on a configured branch, Latitude links it and applies the matched action (resolve, unresolve, or reference), surfacing the referencing PRs and commits on the signal detail page. Includes an install/claim/disconnect flow, per-project sync-config overrides, a magic-words editor, a deliveries audit table, and org-unique signal slugs, with zero write permissions on the customer's repo (ref: #4213).

### Billing

- Notified organization owners and admins, once per billing period, when a hard limit is first crossed — free included credits exhausted, an uncapped Pro plan entering overage, or a configured Pro spend cap — via email, in-app, and Slack, with org-scoped idempotency (ref: #4214).

### Web

- Silenced stale server-fn hash errors after deploys: TanStack server-fn IDs from a prior deploy are now treated as expected deploy skew, mapped to a 404 client error that skips Datadog Error Tracking and reloads the page instead of surfacing a new issue after every release (ref: #4215).

## v0.3.67 - 2026-07-24

### Memory

- Added a per-store Home dashboard with store-scoped overview tiles, an activity chart, and insight cards for most-read and cold records, top and zero-hit queries, largest records, token-size distribution, and net token growth, plus a sortable write-health table surfacing rewrites, thrashing, content reverts, and duplicate records (ref: #4209).

### Flaggers

- Soft-failed Bedrock grammar compilation timeouts so the session classifier recovers with an unmatched result instead of failing the Temporal activity (ref: #4216).

## v0.3.66 - 2026-07-24

### Telemetry

- Added Cloudflare AI Gateway onboarding and documentation, with OTLP ingestion support for model, token, cost, conversation, and embedding data (ref: #4179).

### Memory

- Added time-filtered activity charts and per-store analytics to the Memory page, including sortable usage, access, and health metrics (ref: #4202).

### Taxonomy

- Enabled gardening and facet-aware cluster naming for facet-backed custom behavior taxonomies (ref: #4199).

### Sessions

- Improved long-session rendering and navigation with paged trace loading, incremental conversation attribution, and bounded timeline handling (ref: #4200).

### Billing

- Metered hosted AI generations and query embeddings at estimated provider cost, with 4-credit generation and 1-credit embedding fallbacks; live evaluations now also record a 1-credit baseline scan (refs: #3915, #4211).

### Exports

- Rate-limited asynchronous dataset and signal exports to 10 requests per hour per organization, project, and recipient, and exposed typed HTTP 429 responses in API clients (refs: #4137, #4212).

### Operations

- Reduced CloudWatch volume by disabling ECS Container Insights, suppressing successful API health-check access logs, and lowering Datadog agent log verbosity (ref: 155a34b0a).
- Refreshed the bundled model catalog, including newly recognized models and the Ofox provider (refs: #4194, #4201, #4208).

## v0.3.65 - 2026-07-23

### Ingestion

- Protected trace ingestion memory by rejecting payloads over 32 MiB and limiting each ingest process to 64 MiB across 16 in-flight payloads; capacity exhaustion now returns a retryable response (ref: #4195).

## v0.3.64 - 2026-07-22

### Taxonomy

- Added storage and a lazy extraction engine for custom taxonomy facets, caching one-sentence session projections and embedding clear answers. Facets remain unavailable in the app and are not yet connected to taxonomy gardening (refs: #4186, #4192).

### Flaggers

- Stopped frustration, jailbreaking, and NSFW flaggers from running on first-level flagger-generated sessions, and rejected annotation matches based only on nested source material to prevent false signals in Latitude's own flagger telemetry (ref: #4149).

### Traces

- Validated trace and span IDs before affected ClickHouse reads so malformed values return validation errors instead of 500s (ref: #4151).

### Signals

- Restored signal links from email, Slack, and in-app notifications after signal detail pages moved to slugs, including compatibility with previously delivered links that used signal IDs (ref: #4193).

## v0.3.63 - 2026-07-22

### App

- Refreshed authenticated navigation with a collapsible sidebar, reorganized search and usage controls, and improved organization and project switchers. Project switches no longer reload the page, and project slugs can be copied from the header (ref: #4185).

### Telemetry

- Released TypeScript Telemetry 4.0.0 with opt-in provider instrumentation subpaths so consumers only bundle the integrations they import. This breaking release replaced the `instrumentations` object map with an array of factory-created instances and made registration failures observable through `latitude.ready` (refs: #4178, #4189).

### Session intelligence

- Made session-intelligence backfills continue after individual session failures, report completed and failed counts with bounded failed-session IDs, and keep new analysis payloads out of Temporal history (ref: #4190).

## v0.3.62 - 2026-07-22

### Memory

- Shipped Memory observability to every organization by removing the `memoryObservability` feature flag; the Memory page and its surfaces are now public (ref: #4180).
- Exposed memory observability reads across the public API, MCP, TypeScript/Python SDKs (9.6.0), and CLI (7.6.0): store roll-ups and snapshots (point-in-time and diff), per-record bodies with version history and change diffs, record read/user listings, and per-session and per-trace memory footprints (ref: #4157).

### Signals

- Added agent-dispatch history to the signal detail page (ref: #4182).

### Sessions

- Validated session moment labels with a contextual MiniMax classification pass, with tenant-safe classifier retries (ref: #4167).

### Telemetry

- Added a Prime Intellect telemetry export package for shipping Prime Intellect traces to Latitude (ref: #4164).
- Fixed Claude Code memory-directory resolution when running inside a git worktree so auto-memory spans still attribute to the right project (ref: #4176).

### Traces

- Added drag-to-resize to the span detail panel in the Spans tab (ref: #4165).

### Chore

- Refreshed the bundled models.dev catalog data (ref: #4087).
- Added a DNS record for the `jobs` subdomain (ref: #4177).

## v0.3.61 - 2026-07-22

### Signals

- Restored the manual resolve/ignore lifecycle that the monitors-incidents consolidation had collapsed into mute, with regression detection: a new occurrence on a resolved signal reopens it and emits a `signal.regressed` notification (assignee-first, in-app + email + Slack). Mute now only gates notification fan-out and agent dispatch, ignoring auto-mutes, and the Archived tab lists resolved-or-ignored signals (ref: #4132).
- Switched signal slugs to short JIRA-style `LAT-XY9Z` codes with slug-addressed detail pages (`/signals/$signalSlug`); slugs are assigned once at creation and never regenerated. Experiment top-signals now expose the slug as their `key` across the public API, MCP, and web so an agent can feed it straight into the signal tools (ref: #4154).
- Used occurrence timestamps in the signals seen column (ref: #4145).

### Flaggers

- Fixed the `process deterministic-flaggers` job failing for every project in production: a forward-incompatible flagger row (from the new-slug backfill migration running ahead of the app deploy) made the whole batch throw. Unrecognized rows are now skipped with a warning, making staged rollouts of new flagger strategies safe regardless of migration/deploy ordering (ref: #4129).
- Stopped undeclared-tool false positives from truncated Claude Code toolsets: all tool names are preserved when capping oversized schemas, and a call whose response succeeded no longer flags as undeclared (ref: #4141).

### Telemetry

- Added memory-operation spans for Claude Code's own persistent auto memory: Read/Write/Edit tools targeting the auto-memory directory now emit `gen_ai.memory.*` spans (search/upsert/update) into the same ledger and Memory-page surfaces as the SDK memory helper, gated by `LATITUDE_CLAUDE_CODE_MEMORY` (default on) (ref: #4140).

### Traces

- Classified nested Vercel AI SDK wrappers as `agent_step` (excluded from the cost/token rollup, not an agent-graph candidate) while a trace-root wrapper stays `invoke_agent`, fixing false subagent detection and overstated single-response spans (ref: #4147).

### Memory

- Added an onboarding empty state to the Memory page (ref: #4152).

### Taxonomy

- Averaged `crossSampleAri` over all 45 leave-one-tenth-out fold pairs for a reproducible, order-robust metric and re-derived the stability floor (0.8 → 0.75); calibration/offline only, the production shadow path is unaffected (ref: #4156).
- Fixed the shadow-span Datadog config to target `resource_name` (ref: #4148).

## v0.3.60 - 2026-07-21

### API

- Added a `sessions` endpoint group mirroring `traces`, mounted under `/v1/projects/{projectSlug}/sessions`: list sessions (filters + semantic query, cursor-paginated), session analytics (per-metric totals/medians with a 12h bucket series), session detail, the session's traces, and session-scoped signals (list and by-slug). Session `filters` match the web session UI via a new `SessionFilterSet` that adds the session-only `moments`/`topics` fields with taxonomy topic-subtree expansion. Exposed across HTTP, MCP, and the TypeScript/Python SDKs (9.4.0) and CLI (7.4.0) (ref: #4133).

## v0.3.59 - 2026-07-20

### Memory observability

- Added memory-operation spans to the TypeScript and Python SDKs (both bumped to 3.7.0): OTEL GenAI memory operations (create/update/upsert/delete/search and store create/delete) with `gen_ai.memory.*` attributes, latency/error capture, and opt-in record-content capture (ref: #4128).
- Added record change diffs to memory spans and a collapsible "Memory changes" section on session and trace detail: per-record before/after diffs grouped by store, with GitHub-style context folding and an "Open in Memory" deep link to the full record (ref: #4127).

### Taxonomy

- Added adaptive taxonomy clustering with `off`/`shadow`/`enforced` modes and a per-org `adaptiveTaxonomyClustering` flag; shadow mode computes the adaptive tree alongside static for comparison without changing persisted taxonomy, with bounded APM telemetry for a fleet-wide static-vs-adaptive view. Enabled in shadow mode on production; a no-op for staging and self-hosted deployments (ref: #4123).

### Ingestion

- Fixed a malformed or missing `traceId` crashing an entire span batch: invalid spans are now rejected individually via the existing partial-success path, both on transform and on the sampling-key fallback (ref: #4101).

### Flaggers

- Removed the old per-trace flagger pipeline, drained since the move to session-level flagging (ref: #4126).

## v0.3.58 - 2026-07-20

### Flaggers

- Moved automatic issue detection from per-trace to per-session: flaggers now judge the full conversation once a session settles and its semantic analysis has run, in two passes — free deterministic screening on every session, LLM classification only for session×flagger pairs that earn it (ref: #4078).
- Added a shared hint catalog (tool errors, tool loops, cost/latency/token outliers vs the project baseline, semantic moment labels, and tuned text patterns): sessions with fired hints skip sampling and go straight to the LLM under per-flagger rate budgets, and all hints are shown to the classifier as leads. Positive signals (user satisfaction, resolution) never trigger and only shrink the sampled budget.
- Added three flaggers: Bluffing (assistant proceeds past a failed tool call as if it succeeded), PII leakage (assistant output exposes personal data), and Incompletion (a task objectively not delivered, judged only on responses the user has reacted to). Tool call errors now also flags calls to tools missing from the declared toolset. New flagger rows are backfilled for existing projects, and the flagger enums are exposed through the public API and SDKs.
- Deduplicated flags by anchored-message content hash so session re-screens, model re-wording, and context compaction never duplicate a flag or a charge; one flagger can still flag several distinct parts of a long conversation.
- The old per-trace flagger pipeline remains registered drain-only and is removed in a follow-up once production has drained it.

### Conversation intelligence

- Added `user_correction` and `stalling` moment kinds; sessions re-analyze on their next trace after the detector version bump (ref: #4078).

## v0.3.57 - 2026-07-20

### Memory observability

- Added memory record history and JSON diff views so changes to a record can be reviewed directly from the Memory page (ref: #4120).

### Taxonomy

- Added adaptive taxonomy gardening with staged observation swaps, full-window reassignment, and lineage updates to keep generated taxonomy clusters current (ref: #4121).

### Telemetry

- Rejected oversized OTLP trace and span IDs before ClickHouse insertion so invalid telemetry is handled cleanly at ingestion (ref: #4020).

### Traces

- Deduped ClickHouse reads for memory ledger rows and latest output trace IDs when duplicate span rows exist (refs: #4100, #4122).

### Agent dispatch

- Skipped dispatch work gracefully when the related organization or incident has already been deleted (ref: #4099).

## v0.3.56 - 2026-07-20

### Memory observability

- Added the project Memory page with store lists, record detail views, access views, and per-user memory store visibility (ref: #4083).

### Experiments

- Improved experiment creation and analysis with expanded presets, autofilled filter builders, metric tooltips, and updated experiment metric schemas in the API and SDKs (ref: #4085).

### Monitors

- Fixed recommended tool failure monitor creation by sharing preset and alert-form handling between tool and user monitor flows (ref: #4088).

### Taxonomy

- Reworked taxonomy clustering around a pure relative divisive builder for more consistent hierarchical taxonomy generation (ref: #4084).

### Telemetry

- Stripped orphan tool responses after input message truncation so telemetry exports do not retain invalid tool-only context (ref: #4044).
- Updated the Hermes telemetry plugin to stop exporting empty conversation placeholders while preserving tool-only assistant turns (ref: #4089).

### Traces

- Rejected `gtePercentile` on every trace filter field except `duration`, `ttft`, and `cost`, so invalid filters return 400 instead of 500 (ref: #4086).

### Security

- Patched dependency advisories for Hono CORS, protobufjs denial of service, Next.js, Undici, ws, shell-quote, tmp, and form-data (refs: #4091, #4092, #4093, #4094, #4095, #4096, #4097, #4098).

### Documentation

- Added the self-healing agents documentation overview page (ref: #3951).

## v0.3.55 - 2026-07-17

### Evaluations

- Truncated live-evaluation judge prompts to fit the model's context window so large sessions no longer fail both primary and Bedrock fallback calls (ref: #4081).

### Signals

- Prevented late signal-generation progress writes from overwriting the terminal done/error result and leaving the UI stuck pending (ref: #3943).

### Agent dispatch

- Scoped Cursor/Claude/Linear/Webhook connect from a project's integrations page to project overrides instead of org-wide dispatch defaults (ref: #3984).

### Organizations

- Stopped claimed temporary organizations from being reaped after claim failed to clear `expires_at` on upsert (ref: #3841).

### Traces

- Deduped span rows in session conversation and trace message queries, and stopped false onboarding gates when spans were duplicated (refs: #4005, #3986).

### Memory observability

- Re-keyed memory tables and APIs on `store_id` alone, dropping the derived `scope` field and the SDK `latitude.memory.scope` attribute (ref: #4074).

## v0.3.54 - 2026-07-16

### Navigation

- Preserved project and organization names beginning with digits, `#`, or `*` instead of rendering their first character as an emoji in navigation and command palettes (ref: #4063).

## v0.3.53 - 2026-07-16

### Memory observability

- Added per-record memory footprints to session and trace details, showing read, added, and removed tokens with a hover breakdown grouped by memory store (ref: #4053).

### Billing

- Charged deterministic live-evaluation scans at 1 credit instead of 30; evaluations that call `llm()` remain at 30 credits (ref: #4055).

## v0.3.52 - 2026-07-16

### Custom Behaviors

- Unified global and custom-behavior taxonomy gardening into one workflow: scoped gardening with global-parity trends, auto-gardening on create, and custom behaviors merged into the Behaviours view (refs: #4037, #4052).

### Traces

- Validated trace filter fields at the API boundary and added an `endTime` filter (ref: #4021).

### Signals

- Skipped markdown links when validating flagger output schemas (ref: #4038).

### Claude Code telemetry

- Installed the Stop hook with `@latest` so it self-updates (ref: #4049).

### Reliability

- Raised the production web service minimum capacity (ref: #4045).

### Documentation

- Fixed the Detection Methods documentation page.

## v0.3.51 - 2026-07-15

### Experiments

- Added project-scoped Experiments: a container that compares up to 10 variants (each a filter set, search query, and time range) against a baseline across every session, user, tool, signal, and behaviour metric Latitude computes, with a variant-comparison table, shared population editors, and list/create/rename/delete/import flows (ref: #4017).
- Let users create experiments straight from a saved search, added a "Compare this search" toggle and Monitor/Compare row actions to the saved-search UI, and added creation presets (A/B test, versions, seasonal, failures, outliers) to the experiment create modal (ref: #4034).

### Signals

- Introduced a session-end trigger so signal matching and conversation analysis run once per session after it settles, collapsing a session's trace-ends into a single firing against its latest trace instead of dispatching per trace (ref: #4040).
- Moved the signal edit button beside the signal title (ref: #4039).

### Custom Behaviors

- Wired up the Generate flow for custom behaviors and the per-behavior scoped taxonomy tree, added a generation status indicator, and added entry points to create a custom behavior from the Sessions view or a saved search (ref: #4027).

### Memory observability

- Added ingest support for GenAI memory operation spans and a git-style, content-addressed memory ledger that materializes memory events into ClickHouse at the settled trace boundary, with point-in-time snapshot reconstruction (groundwork, refs: #4035, #4041).

### Claude Code telemetry

- Recovered subagent spans that were previously lost for parallel subagents and on the final llm_request of a turn (ref: #4028).
- Made the Hermes plugin flush on session end and split its api_request and llm_call hooks (refs: #4029, #4030).

### Authentication

- Protected magic links from being consumed by email link scanners (ref: #4026).

### Reliability

- Tolerated non-array OTLP span attributes during ingest instead of failing (ref: #4031).

## v0.3.50 - 2026-07-14

### Subagent visibility

- Detected Claude Code subagents by classifying interaction spans as agent invocations, so the agent graph roots each turn on a real boundary and surfaces Task subagents with proper names (ref: #4022).

### Spans

- Colored the span-tree waterfall bars by operation: agent invocations use the accent color, chat spans a muted accent, and successful tool calls green, with errored spans still red (ref: #4023).

### Custom Behaviors

- Added the project custom-behaviors authoring UI (list, create/edit modal, live eligible-session preview, active-filter summaries), gated behind a feature flag and hidden by default until the Generate flow ships (ref: #4018).

### Reliability

- Bounded ClickHouse memory usage for project span queries to prevent out-of-memory failures (ref: #4019).

## v0.3.49 - 2026-07-14

### Subagent visibility

- Added agent breakdowns and nested conversation cards that show subagent handoffs, activity, costs, duration, models, and runs, with in-place navigation between parent and subagent conversations (ref: #4014).

### Organization members

- Let owners and admins choose whether an invited organization member joins as a member or admin (ref: #4013).

### Custom Behaviors

- Added scoped taxonomy gardening for custom behaviors, building and refreshing behavior-specific trees from matching session samples without changing the global taxonomy (ref: #4010).

### Reliability

- Prevented annotation formatting from failing when malformed GenAI messages are missing their parts (ref: #4011).

## v0.3.48 - 2026-07-13

### Monitors

- Made monitor targets and incident conditions immutable after creation across the web, API, CLI, and SDKs. Existing monitors can still update their name, description, and severity (ref: #3947).

### Notifications

- Routed signal notifications to the assigned user when present and kept targeted notifications out of shared Slack channels (ref: #4009).

### Claude Code Wrapped

- Added skill usage totals, top skills, and per-workspace skill breakdowns to Claude Code Wrapped reports and emails (ref: #3978).

### Reliability

- Fixed classifier flaggers producing truncated structured output that could fail JSON parsing (ref: #3910).
- Fixed trace, session, and session-intelligence time filters for timestamps containing timezone offsets (ref: #4007).
- Fixed newly created datasets temporarily hiding their imported rows (ref: #4006).

### API and ingestion

- Raised public API and trace-ingestion rate limits to support higher normal throughput (ref: 1deab1b9f, ebff4940f).
- Rejected OAuth access tokens as soon as their user no longer belongs to the authorized organization (ref: #3917).

### Models

- Refreshed the bundled models.dev model catalog (ref: #3987).

## v0.3.47 - 2026-07-13

### Traces

- Defaulted Sessions/Traces and Tools/Signals/Users time filters to All time, with bounded chart windows so older project data is visible without expensive trend scans (ref: #3955).
- Fixed "Clear dates" so it removes date bounds instead of restoring the previous default window, and stopped showing false onboarding states for projects that only have older traces (ref: #3955).
- Added session-wide span links in the Conversation tab so messages and tool calls can jump to spans from earlier traces in the same session (ref: #3965).
- Reduced ClickHouse memory usage for trace detail reads by loading trace summaries separately from source-span message content (ref: ad54c4154).

### Telemetry

- Released `@latitude-data/telemetry` 3.6.0 with `createCodemodeTelemetry()` for Cloudflare Think Codemode tracing, including nested tool-call spans, capture/redaction options, and error recording (ref: #3956).
- Updated the Cloudflare Think telemetry guide and example app for Codemode tracing and local verification (ref: #3956).

### Models

- Refreshed the bundled models.dev model catalog (ref: #3983).

## v0.3.46 - 2026-07-10

### Traces

- Added a session-wide grouped Spans tab in the session detail drawer (ref: #3962).
- Fixed the "Waiting for your first trace" screen getting stuck on projects that have only older traces (or a backfilled `first_trace_at`): the onboarding now confirms emptiness with an unwindowed trace count instead of trusting the best-effort `first_trace_at` flag (ref: #3964).

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
