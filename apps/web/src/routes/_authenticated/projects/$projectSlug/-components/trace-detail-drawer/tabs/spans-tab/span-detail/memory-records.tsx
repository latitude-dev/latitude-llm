import { Badge, CodeBlock, Icon, MasterDetail, type MasterDetailItem, Text } from "@repo/ui"
import { SearchIcon } from "lucide-react"
import { JsonBlock } from "./helpers.tsx"
import type { MemoryRecord } from "./memory-records-parse.ts"

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2)
}

function RecordDetail({ record }: { readonly record: MemoryRecord }) {
  const hasMetadata = !!record.metadata && Object.keys(record.metadata).length > 0

  return (
    <div className="flex flex-col gap-3">
      {typeof record.content === "string" ? (
        <CodeBlock value={record.content} className="bg-secondary" />
      ) : (
        <JsonBlock value={record.content} />
      )}
      {(record.score != null || hasMetadata) && (
        <div className="flex flex-col gap-2">
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

function SearchQueryHeader({ query }: { readonly query: string }) {
  return (
    <div className="flex flex-row items-center gap-2 bg-secondary px-3 py-2">
      <Icon icon={SearchIcon} size="xs" color="foregroundMuted" />
      <Text.H6 color="foregroundMuted" ellipsis noWrap>
        {query}
      </Text.H6>
    </div>
  )
}

export function MemoryRecordsView({
  records,
  isSearch,
  queryText,
}: {
  readonly records: readonly MemoryRecord[]
  readonly isSearch: boolean
  readonly queryText?: string
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
        return record ? <RecordDetail record={record} /> : null
      }}
      {...(isSearch && queryText ? { header: <SearchQueryHeader query={queryText} /> } : {})}
    />
  )
}
