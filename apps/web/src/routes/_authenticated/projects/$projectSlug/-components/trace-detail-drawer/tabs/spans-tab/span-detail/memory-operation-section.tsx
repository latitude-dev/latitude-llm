import { CodeBlock, DetailSection, DetailSummary, Text } from "@repo/ui"
import { DatabaseIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { SpanRecordChangeDiff } from "../../../../memory-changes/span-record-change-diff.tsx"
import { isMemoryOperation, isMutatingMemoryOperation } from "../memory-operations.ts"
import { MemoryRecordsView } from "./memory-records.tsx"
import { parseMemoryRecords } from "./memory-records-parse.ts"

const STORE_ID_ATTR = "gen_ai.memory.store.id"
const RECORD_ID_ATTR = "gen_ai.memory.record.id"
const RECORD_COUNT_ATTR = "gen_ai.memory.record.count"
const QUERY_TEXT_ATTR = "gen_ai.memory.query.text"
const RECORDS_ATTR = "gen_ai.memory.records"

export function isMemoryOperationSpan(span: SpanDetailRecord): boolean {
  return (
    isMemoryOperation(span.operation) ||
    !!span.attrString[STORE_ID_ATTR] ||
    !!span.attrString[RECORD_ID_ATTR] ||
    !!span.attrString[RECORDS_ATTR]
  )
}

function Subsection({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

export function MemoryOperationSection({ span }: { readonly span: SpanDetailRecord }) {
  const storeId = span.attrString[STORE_ID_ATTR]
  const recordId = span.attrString[RECORD_ID_ATTR]
  const queryText = span.attrString[QUERY_TEXT_ATTR]
  const recordCount = span.attrInt[RECORD_COUNT_ATTR] ?? span.attrString[RECORD_COUNT_ATTR]
  const recordsRaw = span.attrString[RECORDS_ATTR] ?? ""
  const records = parseMemoryRecords(recordsRaw)
  const isSearch = span.operation === "search_memory"
  const isMutating = isMutatingMemoryOperation(span.operation)
  const recordsLabel = isSearch ? "Results" : "Records"

  // Store and count ride the records header; the identity fields only surface as
  // summary fields when there's no records table to carry them.
  const items = records
    ? []
    : [
        ...(storeId ? [{ label: "Store", value: storeId, copyable: true }] : []),
        ...(recordId ? [{ label: "Record", value: recordId, copyable: true }] : []),
        ...(recordCount !== undefined ? [{ label: "Records", value: String(recordCount) }] : []),
      ]

  return (
    <DetailSection
      icon={<DatabaseIcon className="w-4 h-4" />}
      label="Memory"
      contentClassName="max-h-none overflow-visible"
    >
      <div className="flex flex-col gap-3">
        {items.length > 0 && <DetailSummary items={items} />}
        {queryText && (
          <Subsection label="Query">
            <CodeBlock value={queryText} className="bg-secondary" />
          </Subsection>
        )}
        <Subsection label={recordsLabel}>
          {records ? (
            <MemoryRecordsView
              records={records}
              isSearch={isSearch}
              projectId={span.projectId}
              spanId={span.spanId}
              diffable={isMutating}
              {...(storeId ? { storeId } : {})}
              {...(recordId ? { fallbackRecordId: recordId } : {})}
            />
          ) : isMutating && recordId ? (
            <div className="h-72 overflow-hidden rounded-md border border-border">
              <SpanRecordChangeDiff
                projectId={span.projectId}
                spanId={span.spanId}
                storeId={storeId ?? ""}
                recordId={recordId}
                fallback={
                  recordsRaw ? (
                    <CodeBlock value={recordsRaw} className="bg-secondary" />
                  ) : (
                    <Text.H6 color="foregroundMuted">Content not captured</Text.H6>
                  )
                }
              />
            </div>
          ) : recordsRaw ? (
            <CodeBlock value={recordsRaw} className="bg-secondary" />
          ) : (
            <Text.H6 color="foregroundMuted">Content not captured</Text.H6>
          )}
        </Subsection>
      </div>
    </DetailSection>
  )
}
