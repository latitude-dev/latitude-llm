import { Badge, CodeBlock, MasterDetail, type MasterDetailItem, Text } from "@repo/ui"
import { RecordPaneHeader } from "../../../../memory-changes/record-pane-header.tsx"
import { RecordsHeader } from "../../../../memory-changes/records-header.tsx"
import { SpanRecordChangeDiff } from "../../../../memory-changes/span-record-change-diff.tsx"
import { JsonBlock } from "./helpers.tsx"
import type { MemoryRecord } from "./memory-records-parse.ts"

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2)
}

function RecordDetail({ record }: { readonly record: MemoryRecord }) {
  const hasMetadata = !!record.metadata && Object.keys(record.metadata).length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {typeof record.content === "string" ? (
          <CodeBlock value={record.content} fillHeight className="h-full rounded-none bg-secondary" />
        ) : (
          <JsonBlock value={record.content} fillHeight className="h-full rounded-none bg-secondary" />
        )}
      </div>
      {(record.score != null || hasMetadata) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
          {record.score != null && (
            <div className="flex flex-row items-center gap-2">
              <Text.H6 color="foregroundMuted">Score</Text.H6>
              <Text.H6 color="foreground">{formatScore(record.score)}</Text.H6>
            </div>
          )}
          {hasMetadata && (
            <div className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">Metadata</Text.H6>
              <JsonBlock value={record.metadata} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MemoryRecordsView({
  records,
  isSearch,
  storeId,
  projectId,
  spanId,
  diffable,
  fallbackRecordId,
}: {
  readonly records: readonly MemoryRecord[]
  readonly isSearch: boolean
  readonly storeId?: string
  readonly projectId: string
  readonly spanId: string
  readonly diffable: boolean
  readonly fallbackRecordId?: string
}) {
  const ordered =
    isSearch && records.some((record) => record.score != null)
      ? [...records].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
      : records

  const items: MasterDetailItem[] = ordered.map((record, index) => ({
    key: String(index),
    label: record.id ?? `Record ${index + 1}`,
    ...(isSearch && record.score != null
      ? {
          trailing: (
            <Badge variant="secondary" size="small">
              {formatScore(record.score)}
            </Badge>
          ),
        }
      : {}),
  }))

  return (
    <MasterDetail
      className="h-72"
      items={items}
      renderDetail={(key) => {
        const record = ordered[Number(key)]
        if (!record) return null
        const recordId = record.id ?? fallbackRecordId ?? ""
        return (
          <div className="flex h-full flex-col">
            <RecordPaneHeader
              storeId={storeId ?? ""}
              recordId={recordId}
              {...(diffable ? { changeSpanId: spanId } : {})}
            />
            <div className="min-h-0 flex-1">
              {diffable ? (
                <SpanRecordChangeDiff
                  projectId={projectId}
                  spanId={spanId}
                  storeId={storeId ?? ""}
                  recordId={recordId}
                  fallback={<RecordDetail record={record} />}
                />
              ) : (
                <RecordDetail record={record} />
              )}
            </div>
          </div>
        )
      }}
      header={<RecordsHeader count={ordered.length} {...(storeId ? { storeId } : {})} />}
    />
  )
}
