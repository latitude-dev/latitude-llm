# Plan: Create Datasets from Traces

## Overview

Allow users to select traces from the traces list, then add them as rows to an existing or new dataset. Each selected trace's materialized `input_messages` and `output_messages` become the dataset row's `input` and `output` fields.

---

## Current State

- **Traces list** (`/projects/$projectId/`): renders a table of traces with no selection/checkboxes.
- **Datasets**: support row selection via `useSelectableRows` hook (checkboxes in header + rows), with bulk delete as the only action.
- **`insertRows` use-case**: accepts `{ organizationId, datasetId, rows: { id?, input, output?, metadata? }[], source? }` — ready to receive rows from any source.
- **Trace messages**: `input_messages` and `output_messages` are materialized at trace level in ClickHouse (`argMinIfMerge`/`argMaxIfMerge`). Available via `TraceRepository.findByTraceId()` which returns `TraceDetail` (includes `inputMessages` and `outputMessages` as `GenAIMessage[]`).
- **No bulk trace detail fetch**: `TraceRepository` only has `findByTraceId` (single trace) and `findByProjectId` (list without messages). A new method or query is needed to fetch messages for multiple traces.

---

## Implementation Plan

### 1. Add `findByTraceIds` to trace repository (batch message fetch)

**Where**: Domain port + ClickHouse adapter

- **`packages/domain/spans/src/ports/trace-repository.ts`**: Add method:
  ```typescript
  findByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<readonly TraceDetail[], RepositoryError>
  ```
- **`packages/platform/db-clickhouse/src/repositories/trace-repository.ts`**: Implement using `DETAIL_SELECT` with `WHERE trace_id IN ({traceIds:Array(String)})`.

This avoids N+1 queries when the user selects multiple traces.

### 2. Add "add to dataset" server function

**Where**: `apps/web/src/domains/datasets/datasets.functions.ts`

New server function: `addTracesToDatasetMutation`

```typescript
export const addTracesToDatasetMutation = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    projectId: z.string(),
    datasetId: z.string(),
    traceIds: z.array(z.string()).min(1),
  }))
  .handler(async ({ data }) => {
    // 1. Fetch trace details (with messages) via findByTraceIds
    // 2. Map each trace to a dataset row:
    //    - input: trace.inputMessages
    //    - output: trace.outputMessages
    //    - metadata: { traceId, rootSpanName, model, ... }
    // 3. Call insertRows use-case with source: "traces"
    // 4. Return { versionId, version, rowIds }
  })
```

Also add a `createDatasetFromTracesMutation` for the "create new dataset + add rows" flow:

```typescript
export const createDatasetFromTracesMutation = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    projectId: z.string(),
    name: z.string().min(1),
    traceIds: z.array(z.string()).min(1),
  }))
  .handler(async ({ data }) => {
    // 1. requireSession → organizationId
    // 2. createDataset use-case
    // 3. Fetch trace details + insertRows (same as above)
    // 4. Return { datasetId, versionId, version, rowIds }
  })
```

### 3. Add checkboxes to the traces table

**Where**: `apps/web/src/routes/_authenticated/projects/$projectId/index.tsx`

- Import and use `useSelectableRows` (same hook used in datasets).
- Add a checkbox column to the table header (select all) and each row.
- Track `traceId` as the row identifier.
- Show an action bar when `selection.selectedCount > 0` with an "Add to Dataset" button.

### 4. Create "Add to Dataset" modal component

**Where**: `apps/web/src/routes/_authenticated/projects/$projectId/components/add-to-dataset-modal.tsx`

Modal with two tabs/modes:

#### A. Add to existing dataset
- Dropdown/select listing datasets in the current project (fetched via `useDatasetsCollection(projectId)`).
- Confirm button → calls `addTracesToDatasetMutation`.

#### B. Create new dataset
- Text input for dataset name.
- Confirm button → calls `createDatasetFromTracesMutation`.

#### Shared behavior
- Shows selected trace count.
- Loading/submitting state on confirm.
- On success: toast/notification, clear selection, invalidate dataset queries.
- On error: show error message in modal.

### 5. Wire the modal into the traces page

**Where**: `apps/web/src/routes/_authenticated/projects/$projectId/index.tsx`

- Add `[modalOpen, setModalOpen]` state.
- Render action bar when traces are selected:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Traces                    [Add to Dataset (N)]  │
  │ ☑ Name | Status | Spans | Models | ...          │
  │ ☑ trace-1 ...                                   │
  │ ☐ trace-2 ...                                   │
  │ ☑ trace-3 ...                                   │
  └─────────────────────────────────────────────────┘
  ```
- Render `<AddToDatasetModal>` with `traceIds={selection.selectedRowIds}`.
- On success callback: `selection.clearSelections()`, close modal.

### 6. Invalidate & navigate

After successful addition:
- Invalidate `["datasets", projectId]` and `["datasetRows", datasetId]` query keys.
- Optionally navigate to the dataset detail page (or stay on traces with a success toast).

---

## Data Mapping: Trace → Dataset Row

Each selected trace becomes one dataset row:

| Dataset Row Field | Source |
|---|---|
| `input` | `{ messages: trace.inputMessages }` |
| `output` | `{ messages: trace.outputMessages }` |
| `metadata` | `{ traceId, rootSpanName, models, status, durationNs, tokensInput, tokensOutput, costTotalMicrocents }` |

The `source` field on `dataset_versions` will be `"traces"` to distinguish from CSV imports and API inserts.

---

## File Changes Summary

| File | Change |
|---|---|
| `packages/domain/spans/src/ports/trace-repository.ts` | Add `findByTraceIds` method |
| `packages/platform/db-clickhouse/src/repositories/trace-repository.ts` | Implement `findByTraceIds` |
| `apps/web/src/domains/datasets/datasets.functions.ts` | Add `addTracesToDatasetMutation`, `createDatasetFromTracesMutation` |
| `apps/web/src/routes/_authenticated/projects/$projectId/index.tsx` | Add checkboxes, selection state, action bar |
| `apps/web/src/routes/_authenticated/projects/$projectId/components/add-to-dataset-modal.tsx` | New modal component |

---

## Questions / Decisions

3. **Duplicate handling**: If a trace is already in the target dataset, should we skip it, upsert, or allow duplicates? The simplest approach is to allow duplicates (each insert is a new row with a new CUID). Deduplication could be a follow-up.
HOW HARD is DE_DUPLICATION?

4. **Max selection limit**: Should we cap the number of traces that can be added at once? The `insertBatch` already batches in groups of 500, so large selections are handled. A reasonable UI cap (e.g. 1000) could prevent accidental bulk operations.
1000 as CAP is fine

