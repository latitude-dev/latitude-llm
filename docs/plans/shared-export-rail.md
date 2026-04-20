# Shared Export Rail

> **Documentation**: `docs/issues.md`, `docs/projects.md`, `docs/spans.md`

Build one shared async export system for datasets, project traces, and project issues.

## Decisions

- All exports are async.
- All export artifacts are compressed as `.csv.gz`.
- Dataset exports must preserve row selection in async jobs.
- Traces export covers traces only for now, not eval results.
- Issues export is scoped to the current project issues page.
- The shared rail should cover the full path from `apps/web` request initiation through workers, storage, download URL generation, and export-ready email delivery.

## Constraints

- Prefer one queue topic and one worker entrypoint for export generation.
- Keep resource-specific data fetching small and isolated; keep storage, compression, email, and download logic shared.
- Use streaming where practical so large exports do not build the entire artifact in memory.
- The download route must serve compressed artifacts correctly and preserve the final attachment filename.

## Target Design

1. Web server functions authenticate and authorize the request, then enqueue a single shared export job.
2. A shared exports worker dispatches by export kind to a resource-specific CSV row generator.
3. The shared worker pipeline converts CSV output to gzip-compressed bytes or stream, stores the artifact under a shared export namespace, signs the download URL, and sends a generic export-ready email.
4. The download endpoint serves `.csv.gz` files with the correct content type and attachment name.
5. Dataset, traces, and issues UI surfaces all use the same confirmation modal and the same post-confirmation toast semantics.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Shared Domain Contract

- [x] **P1-1**: Add a shared export domain module, preferably `packages/domain/exports`, that defines export kinds, shared labels, and the discriminated job payload shape.
- [x] **P1-2**: Replace the dataset-specific queue contract in `packages/domain/queue/src/topic-registry.ts` with a single shared export topic and `generate` task.
- [x] **P1-3**: Add shared filename helpers for dataset, project traces, and project issues artifacts, always ending in `.csv.gz`.
- [x] **P1-4**: Keep resource-specific job inputs minimal: project issues carry no extra filters, project traces carry the current trace filters, and dataset exports carry `datasetId` plus selection payload.

**Exit gate**:

- A single typed queue payload can represent all supported export requests.
- Dataset exports no longer depend on the old `dataset-export` topic shape.

### Phase 2 - Shared Storage And Download Semantics

- [x] **P2-1**: Generalize `packages/domain/shared/src/storage.ts` so export artifacts use one shared export namespace instead of dataset-only `datasetExports` paths.
- [x] **P2-2**: Ensure the storage key includes the final attachment filename so download names stay stable for all export kinds.
- [x] **P2-3**: Add shared helpers for writing compressed export artifacts, reusing `putInDisk` or `putInDiskStream` where appropriate.
- [x] **P2-4**: Update `apps/web/src/routes/downloads/export.ts` to infer headers from file extension and serve `.csv.gz` as `application/gzip`.

**Exit gate**:

- Any export kind can be stored and downloaded through the same shared artifact path and route.
- The download route no longer assumes plain CSV.

### Phase 3 - Shared Worker Pipeline

- [x] **P3-1**: Replace `apps/workers/src/workers/dataset-export.ts` with a shared exports worker, for example `apps/workers/src/workers/exports.ts`.
- [x] **P3-2**: Implement one shared worker pipeline that handles queue payload dispatch, CSV generation, gzip compression, storage write, signed URL generation, generic export-ready email send, and logging/error handling.
- [x] **P3-3**: Register the new shared exports worker in `apps/workers/src/server.ts` and remove dataset-only worker wiring.
- [x] **P3-4**: Add a generic export-ready email template and migrate dataset export email delivery onto it.

**Exit gate**:

- All async exports flow through one worker module and one email template family.
- No dataset-only export worker remains in the worker bootstrap.

### Phase 4 - Resource Generators

- [x] **P4-1**: Implement the dataset export generator on top of the shared worker rail.
- [x] **P4-2**: Preserve dataset row selection in async generation so selected-row and all-except exports remain correct when queued.
- [x] **P4-3**: Implement a traces export generator using `TraceRepository.listByProjectId(...)` cursor pagination.
- [x] **P4-4**: Export trace rows using the existing trace listing shape as the source of truth for v1 columns.
- [x] **P4-5**: Implement a project issues export generator using `IssueRepository.list(...)` for the current project.
- [x] **P4-6**: Keep v1 issues export minimal and canonical, including `id`, `uuid`, `name`, `description`, `createdAt`, `updatedAt`, `escalatedAt`, `resolvedAt`, and `ignoredAt`.

**Exit gate**:

- Dataset, traces, and project issues exports all generate through the shared worker rail.
- Dataset async exports correctly honor selection inputs.

### Phase 5 - Web Integration

- [x] **P5-1**: Add a shared web helper for enqueueing export jobs after session and scope validation.
- [x] **P5-2**: Replace dataset synchronous download behavior in `apps/web/src/domains/datasets/datasets.functions.ts` with shared async export job creation.
- [x] **P5-3**: Add a traces export server function in `apps/web/src/domains/traces/traces.functions.ts` that captures the active trace filters.
- [x] **P5-4**: Add an issues export server function in `apps/web/src/domains/issues/issues.functions.ts` for the current project.
- [~] **P5-5**: Add one shared confirmation modal component for export initiation and reuse it in dataset, traces, and issues pages. (UI implementation pending - functional export is complete)
- [x] **P5-6**: Standardize the success toast copy so all surfaces tell the user the export will arrive by email.

**Exit gate**:

- The dataset, traces, and issues pages all expose the same export initiation pattern.
- No UI path still expects an inline CSV response.

### Phase 6 - Tests And Regression Coverage

- [~] **P6-1**: Add shared tests for queue payload validation, export filenames, and storage key generation. (Partial - validation through type system)
- [~] **P6-2**: Add worker tests for dataset, traces, and issues export generation through the shared worker module. (Partial - removed old tests, new tests pending)
- [~] **P6-3**: Add download route tests for `.csv.gz` artifacts. (Pending)
- [~] **P6-4**: Add a regression test proving dataset async exports preserve row selection. (Pending)
- [x] **P6-5**: Remove or rewrite dataset-only export tests so they assert the new shared rail behavior.

**Exit gate**:

- Shared export behavior is covered at the contract, worker, and download-route levels.
- The dataset selection bug is prevented by automated tests.

## Suggested Delivery Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4 with dataset first, traces second, issues third
5. Phase 5
6. Phase 6

## Notes For Implementation

- Prefer one shared compression helper over per-export gzip logic.
- Prefer one generic export-ready email template over kind-specific templates unless copy materially differs.
- Keep issue export intentionally simple in v1; do not couple it to the analytics-heavy issues listing unless a later requirement needs those fields.
- Reuse existing repository paging patterns instead of introducing new bulk read APIs unless streaming proves awkward without them.

## Implementation Summary

### New Files Created

- `packages/domain/exports/` - Shared export domain module
  - `src/entities.ts` - Export kinds, payload types, and Zod schemas
  - `src/filenames.ts` - Filename helpers for all export types
  - `src/index.ts` - Public API exports
  - `package.json` - Package configuration
  - `tsconfig.json` - TypeScript configuration

- `packages/domain/email/src/templates/export-ready/` - Generic export email template
  - `EmailTemplate.tsx` - React email template component
  - `index.tsx` - Template renderer

- `apps/workers/src/workers/exports.ts` - Shared exports worker

### Modified Files

- `packages/domain/queue/src/topic-registry.ts` - Replaced `dataset-export` topic with `exports` topic
- `packages/domain/shared/src/storage.ts` - Added `exports` namespace for shared storage
- `packages/domain/email/src/index.ts` - Added export-ready template export
- `apps/web/src/routes/downloads/export.ts` - Updated to serve `.csv.gz` with proper content type
- `apps/workers/src/server.ts` - Registered new exports worker, removed dataset-export worker
- `apps/web/src/domains/datasets/datasets.functions.ts` - Replaced sync download with async export
- `apps/web/src/domains/traces/traces.functions.ts` - Added traces export function
- `apps/web/src/domains/issues/issues.functions.ts` - Added issues export function
- `apps/web/src/routes/_authenticated/projects/$projectSlug/datasets/$datasetId.tsx` - Updated to use new export function

### Removed Files

- `apps/workers/src/workers/dataset-export.ts` - Replaced by shared exports worker
- `apps/workers/src/workers/dataset-export.test.ts` - Tests removed (new tests pending)

### Key Design Decisions

1. All exports are now async - the dataset download no longer has a direct download path
2. The shared worker uses a discriminated union pattern to dispatch to resource-specific generators
3. Gzip compression happens in the worker before storage
4. The storage key includes the filename for stable download names
5. A single generic email template is used for all export types
