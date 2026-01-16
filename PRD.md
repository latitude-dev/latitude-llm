# PRD: Async Span Download for ALL/ALL_EXCEPT Selection Modes

## Problem Statement

Currently, the span download feature only supports immediate downloads for small selections (≤25 spans in PARTIAL mode). When users select ALL or ALL_EXCEPT modes, they see an error message: "Downloading all spans is not yet supported."

Users need the ability to download large numbers of spans (potentially millions) with applied filters for data analysis and export purposes.

## Goals

1. Enable async download for ALL and ALL_EXCEPT selection modes
2. Support current filter context (commitUuids, experimentUuids, testDeploymentIds, createdAt)
3. Handle millions of spans without memory issues
4. Notify users via email when export is ready

## Non-Goals

- Real-time progress tracking in the UI
- Resumable downloads
- Multiple export formats (only CSV for now)

## User Experience

1. User applies filters to the traces view
2. User selects spans using ALL or ALL_EXCEPT mode (or selects >25 spans in PARTIAL mode)
3. User clicks "Download X spans"
4. Confirmation modal appears
5. User confirms → Toast shows "Export started. You will receive an email when ready."
6. Background job processes the export
7. User receives email with download link
8. User clicks link → CSV file downloads

## Technical Design

### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│DownloadSpans   │────▶│downloadSpansAction│────▶│ findOrCreate    │
│Button (UI)      │     │ (Server Action)   │     │ Export          │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │ defaultQueue     │────▶│ exports table   │
                        │ (BullMQ)         │     │ (PostgreSQL)    │
                        └──────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │ exportSpansJob   │
                        │ (Worker)         │
                        └──────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌──────────────┐       ┌──────────────────┐
            │ SpansRepo    │       │ Private Disk     │
            │ (Streaming)  │       │ (S3/Local)       │
            └──────────────┘       └──────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ markExportReady  │
                                  └──────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ exportReady      │
                                  │ (Event)          │
                                  └──────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ExportReadyMailer │
                                  │ (Email)          │
                                  └──────────────────┘
```

### Files to Modify

#### 1. Pass filters through the component tree

**`apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/traces/_components/DocumentTracesPage.tsx`**
- Pass `filters` prop to `SelectionTracesBanner` (line 133-136)

**`apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/traces/_components/SelectionTracesBanner/index.tsx`**
- Accept `filters: SpansFilters` prop
- Pass filters to `DownloadSpansButton`

**`apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/traces/_components/SelectionTracesBanner/DownloadSpansButton/index.tsx`**
- Accept `filters: SpansFilters` prop
- Replace toast error with async download handling for ALL/ALL_EXCEPT modes

#### 2. Create server action for async span downloads

**`apps/web/src/actions/spans/downloadSpans.ts`** (new file)
- Create `downloadSpansAction` using `withDocument` procedure
- Input schema:
  - `selectionMode`: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  - `selectedSpanIdentifiers`: array of {traceId, spanId}
  - `excludedSpanIdentifiers`: array of {traceId, spanId}
  - `filters`: SpansFilters (optional)
- For small PARTIAL (≤25): return immediate download mode
- For ALL/ALL_EXCEPT/large PARTIAL:
  - Generate export UUID via `crypto.randomUUID()`
  - Create export record via `findOrCreateExport`
  - Enqueue `exportSpansJob` to defaultQueue
  - Return async mode with export UUID

#### 3. Create background job definition

**`packages/core/src/jobs/job-definitions/exports/exportSpansJob.ts`** (new file)

**Job Data Type:**
```typescript
export type ExportSpansJobData = {
  exportUuid: string
  workspaceId: number
  userId: string
  projectId: number
  commitUuid: string
  documentUuid: string
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  excludedSpanIdentifiers: Array<{ traceId: string; spanId: string }>
  filters: SpansFilters
}
```

**Job Implementation Strategy (for millions of spans):**

**Phase 1: Setup**
1. Create workspace instance from workspaceId
2. Initialize SpansRepository with workspace
3. Create excludedSpanIds Set for O(1) lookup (for ALL_EXCEPT mode)
4. Initialize streaming CSV writer using `csv-stringify` (not sync)
5. Create a PassThrough stream to pipe CSV data to disk

**Phase 2: Streaming Data Processing**

Use cursor-based pagination to iterate through ALL spans without loading them into memory:

```typescript
async function* iterateSpans(repo, filters, excludedIds, batchSize = 500) {
  let cursor: { startedAt: string; id: string } | undefined

  while (true) {
    const { items, next } = await repo.findByDocumentAndCommitLimited({
      documentUuid: filters.documentUuid,
      commitUuids: filters.commitUuids,
      experimentUuids: filters.experimentUuids,
      testDeploymentIds: filters.testDeploymentIds,
      createdAt: filters.createdAt,
      types: [SpanType.Prompt], // Only export prompt spans
      limit: batchSize,
      from: cursor,
    })

    // Filter out excluded spans (for ALL_EXCEPT mode)
    const filteredItems = items.filter(span => !excludedIds.has(span.id))

    for (const span of filteredItems) {
      yield span
    }

    if (!next) break
    cursor = next
  }
}
```

**Phase 3: CSV Row Building (streaming)**

For each span batch:
1. Fetch completion spans in batch (not N+1)
2. Fetch metadata in batch
3. Build CSV rows and write to stream immediately
4. Don't accumulate in memory

```typescript
const csvStringifier = stringify({ header: true, columns: csvColumns })
const passThrough = new PassThrough()
csvStringifier.pipe(passThrough)

// Start disk upload in parallel (streaming)
const uploadPromise = disk.putStream(`exports/${exportUuid}.csv`, passThrough)

// Process spans in batches
const BATCH_SIZE = 500
let batch: Span[] = []

for await (const span of iterateSpans(repo, filters, excludedIds)) {
  batch.push(span)

  if (batch.length >= BATCH_SIZE) {
    const rows = await buildRowsForBatch(batch) // Batch DB queries
    for (const row of rows) {
      csvStringifier.write(row)
    }
    batch = []
  }
}

// Process remaining batch
if (batch.length > 0) {
  const rows = await buildRowsForBatch(batch)
  for (const row of rows) {
    csvStringifier.write(row)
  }
}

csvStringifier.end()
await uploadPromise
```

**Phase 4: Completion**
1. Call `markExportReady({ export: exportRecord })`
2. This automatically publishes `exportReady` event
3. Event handler `notifyClientOfExportReady` sends email with download link

**Batch DB Query Helper:**
```typescript
async function buildRowsForBatch(spans: Span[]) {
  // Batch fetch completions (single query with IN clause)
  const completions = await repo.findCompletionsByParentIds(
    spans.map(s => ({ traceId: s.traceId, spanId: s.id }))
  )

  // Batch fetch metadata (single query)
  const metadataKeys = completions.map(c => `span:${c.id}:metadata`)
  const metadata = await metadataRepo.getBatch(metadataKeys)

  // Build rows without additional DB calls
  return spans.map(span => buildRow(span, completions, metadata))
}
```

#### 4. Add repository methods for batch operations

**`packages/core/src/repositories/spansRepository.ts`**
- Add `findCompletionsByParentIds(parentIds: Array<{traceId, spanId}>)` for batch completion lookup

**`packages/core/src/repositories/spanMetadataRepository.ts`**
- Add `getBatch(keys: string[])` for batch metadata retrieval

#### 5. Email notification (already exists)

The email flow is already implemented:
- `markExportReady` → publishes `exportReady` event
- `notifyClientOfExportReady` handler → sends `ExportReadyMailer` email
- Email contains link: `/api/exports/{uuid}?download=true`
- Download API at `apps/web/src/app/api/exports/[uuid]/route.ts` streams the file

#### 6. Register job in worker

**`packages/core/src/jobs/job-definitions/index.ts`**
- Export the new `exportSpansJob`

**`apps/workers/src/workers/worker-definitions/defaultWorker.ts`**
- Add `exportSpansJob` to job mappings

## Performance Considerations

| Concern | Solution |
|---------|----------|
| Memory: Loading all spans | Cursor-based iteration, never hold more than 500 spans |
| Memory: CSV generation | Streaming CSV writer, pipe directly to disk |
| N+1 queries | Batch fetch completions and metadata per 500-span batch |
| Disk storage | Stream upload, no temp file needed |
| Large excludedIds set | Use Set for O(1) lookup, passed as array in job data |

## Implementation Order

1. **Pass filters through components** - Wire up the filters prop ✅
2. **Add batch repository methods** - `findCompletionsByParentIds`, `getBatch` ✅
3. **Create exportSpansJob** - Streaming job with batch processing ✅
4. **Create downloadSpansAction** - Server action routing sync/async ✅
5. **Update DownloadSpansButton** - Handle async response with toast ✅

## Testing Plan

| Test Case | Expected Result |
|-----------|-----------------|
| Select < 25 spans with PARTIAL mode | Immediate download (existing behavior) |
| Select all spans with ALL mode | Toast shows "export started", email received when ready |
| Apply filters, select ALL mode | Only filtered spans in downloaded CSV |
| Select ALL mode, then exclude some spans | Excluded spans not in CSV |
| Large dataset test: export 10k+ spans | Completes without memory issues |

## Rollout Plan

1. Deploy job definition and worker registration
2. Deploy server action
3. Deploy UI changes
4. Monitor job queue and export completion times
5. Iterate on batch size if needed based on performance metrics
