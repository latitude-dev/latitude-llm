import { cn, DetailSection, MasterDetail, type MasterDetailItem, Skeleton, Text } from "@repo/ui"
import { DatabaseIcon, type LucideIcon, MinusIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useMemorySummary, useSessionMemoryDiff } from "../../../../../../domains/memories/memories.collection.ts"
import type { SessionMemoryDiffRecord } from "../../../../../../domains/memories/memories.functions.ts"
import { MemoryRecordDiff } from "./memory-record-diff.tsx"
import { RecordPaneHeader } from "./record-pane-header.tsx"
import { RecordsHeader } from "./records-header.tsx"

type RecordDiff = SessionMemoryDiffRecord["records"][number]

const KIND_META: Record<RecordDiff["kind"], { readonly icon: LucideIcon; readonly className: string }> = {
  added: { icon: PlusIcon, className: "text-success" },
  updated: { icon: PencilIcon, className: "text-muted-foreground" },
  removed: { icon: MinusIcon, className: "text-destructive" },
}

function StoreChangesBlock({
  storeId,
  records,
}: {
  readonly storeId: string
  readonly records: readonly RecordDiff[]
}) {
  const items: MasterDetailItem[] = records.map((record, index) => {
    const meta = KIND_META[record.kind]
    return {
      key: String(index),
      label: record.recordId || `Record ${index + 1}`,
      trailing: <meta.icon className={cn("h-3.5 w-3.5", meta.className)} />,
    }
  })

  return (
    <MasterDetail
      className="h-72"
      items={items}
      header={<RecordsHeader count={records.length} {...(storeId ? { storeId } : {})} />}
      renderDetail={(key) => {
        const record = records[Number(key)]
        if (!record) return null
        return (
          <div className="flex h-full flex-col">
            <RecordPaneHeader
              storeId={storeId}
              recordId={record.recordId}
              {...(record.lastChangeSpanId ? { changeSpanId: record.lastChangeSpanId } : {})}
            />
            <div className="min-h-0 flex-1">
              <MemoryRecordDiff before={record.beforeBody} after={record.afterBody} degraded={record.degraded} />
            </div>
          </div>
        )
      }}
    />
  )
}

function MemoryChangesBody({
  projectId,
  sessionId,
  traceId,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceId?: string
}) {
  const { data, isLoading } = useSessionMemoryDiff({ projectId, sessionId, ...(traceId ? { traceId } : {}) })

  if (isLoading) return <Skeleton className="h-7 w-48" />
  if (!data || data.records.length === 0)
    return (
      <Text.H6 color="foregroundMuted" italic>
        No memory changes
      </Text.H6>
    )

  const groups: { storeId: string; records: RecordDiff[] }[] = []
  for (const record of data.records) {
    const group = groups.find((candidate) => candidate.storeId === record.storeId)
    if (group) group.records.push(record)
    else groups.push({ storeId: record.storeId, records: [record] })
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <StoreChangesBlock key={group.storeId} storeId={group.storeId} records={group.records} />
      ))}
    </div>
  )
}

/**
 * A collapsible "Memory changes" section for the session/trace detail body,
 * sitting under Tools: the aggregated per-record before/after diffs a session (or
 * one trace) made to memory, grouped by store. Visibility rides the already-cached
 * `useMemorySummary` (renders only when there were writes); the heavier body-diff
 * read fires only when the section is expanded. Pass `traceId` for the trace view.
 */
export function MemoryChangesSection({
  projectId,
  sessionId,
  traceId,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceId?: string
}) {
  const { data: summary } = useMemorySummary({ projectId, sessionId, ...(traceId ? { traceId } : {}) })
  const hasChanges = !!summary && (summary.total.tokensAdded > 0 || summary.total.tokensRemoved > 0)
  if (!hasChanges) return null

  return (
    <DetailSection
      icon={<DatabaseIcon className="h-4 w-4" />}
      label="Memory changes"
      defaultOpen={false}
      contentClassName="max-h-none overflow-visible"
    >
      {() => <MemoryChangesBody projectId={projectId} sessionId={sessionId} {...(traceId ? { traceId } : {})} />}
    </DetailSection>
  )
}
