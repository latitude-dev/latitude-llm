# Trace deletion

> **Documentation**: `dev-docs/trace-deletion.md`, `dev-docs/spans.md`, `dev-docs/filters.md`

Customers with strict DPAs must erase a specific end-client's traces (for example, within 30 days of off-boarding) while keeping everything else. There is no delete path for telemetry today, and plan retention keeps rows for `retention_days + 30`. This spec builds an auditable, project-scoped deletion request, selected by the trace list's `FilterSet` or by explicit trace ids, that hard-deletes the traces and every store derived from them. The design lives in `dev-docs/trace-deletion.md`. Linear project: "Trace deletion (DPA / right-to-erasure)".

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Deletion engine (staff-operated)

- [x] **P1-1** (LAT-905): design doc and data inventory.
- [x] **P1-2** (LAT-906): `TraceDeletionRequest` entity, Postgres table (RLS, no FKs), repository, create and dry-run use cases, `TraceDeletionRequestCreated` event.
- [x] **P1-3** (LAT-907): `TracePurgeRepository` port and ClickHouse adapter (effective session ids, trace-keyed purge, session purge and drift-free rebuild), plus the migration allowing lightweight deletes on `trace_message_occurrences`.
- [x] **P1-4** (LAT-908): Postgres purge of `scores` and `annotation_queue_items`; `TracesPurged` removes deleted scores from signal centroids.
- [x] **P1-5** (LAT-909): `trace-deletion:${requestId}` Temporal workflow (drain loop with a creation-time cutoff, batch purge, session rebuild, receipt, `TraceDeletionRequestFinished`).
- [x] **P1-6** (LAT-910): backoffice screen to dry-run, start and inspect deletions.

**Exit gate**: staff can delete an organization's traces by tag in staging, and the receipt's counts match the rows that disappeared from every store in the inventory.

### Phase 2 - Public API

- [x] **P2-1** (LAT-911): `defineOperation` create, preview (dry run), get and list, propagated to the SDKs, CLI and MCP.
- [x] **P2-2** (LAT-912): public docs page `docs/security/trace-deletion.mdx`, linked from GDPR.

**Exit gate**: a customer can run and verify a deletion end to end from the TypeScript SDK.

### Phase 3 - Product UI

- [x] **P3-1** (LAT-913): bulk delete from the trace list, with dry-run count and typed confirmation.
- [x] **P3-2** (LAT-914): deletion history and downloadable receipt in project settings; completion notification.

**Exit gate**: an org admin can delete and audit deletions without the API.

### Phase 4 - Compliance hardening

- [x] **P4-1** (LAT-915): `dataset_rows` provenance and opt-in cascade.
- [x] **P4-2** (LAT-916): orphan sweep for `message_embeddings` and `memory_blobs`.
- [x] **P4-3** (LAT-917): ingest tombstone for late spans of purged traces.
- [x] **P4-4** (LAT-918): retention grace and object-store version review.

**Exit gate**: every row in the `dev-docs/trace-deletion.md` inventory is either purged or explicitly documented as kept.
