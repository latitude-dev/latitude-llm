import { CodeBlock, cn, Skeleton, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { MinusIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useMemoryRecord } from "../../../../../../../domains/memories/memories.collection.ts"
import type { MemoryRecordVersionRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"

function looksLikeJson(body: string): boolean {
  const trimmed = body.trim()
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

const CHANGE_META = {
  add: { icon: PlusIcon, className: "text-success", label: "Created" },
  update: { icon: PencilIcon, className: "text-muted-foreground", label: "Updated" },
  remove: { icon: MinusIcon, className: "text-destructive", label: "Removed" },
} as const

type MutatingKind = keyof typeof CHANGE_META
const isMutating = (kind: string): kind is MutatingKind => kind === "add" || kind === "update" || kind === "remove"

export function RecordContentView({
  projectId,
  storeId,
  recordId,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly recordId: string
}) {
  const { data, isLoading } = useMemoryRecord({ projectId, storeId, recordId })

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!data) return null

  const body = data.body ?? ""
  const language = body !== "" && looksLikeJson(body) ? "json" : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Text.H5M className="min-w-0 font-mono" noWrap ellipsis>
          {recordDisplayLabel(recordId)}
        </Text.H5M>
        <Text.H6 color="foregroundMuted" className="shrink-0">
          {formatCount(data.tokenCount)} tok
        </Text.H6>
      </div>
      <div className="min-h-0 flex-1">
        {data.body !== null ? (
          <CodeBlock value={body} fillHeight {...(language ? { language } : {})} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed">
            <Text.H6 color="foregroundMuted">Content not captured</Text.H6>
          </div>
        )}
      </div>
      <UpdatedByHistory versions={data.versions} />
    </div>
  )
}

function UpdatedByHistory({ versions }: { readonly versions: readonly MemoryRecordVersionRecord[] }) {
  const mutating = versions.filter((version) => isMutating(version.changeKind))
  if (mutating.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <Text.H6 color="foregroundMuted">Updated by</Text.H6>
      <div className="flex max-h-56 flex-col overflow-y-auto">
        {mutating.map((version) => {
          const meta = CHANGE_META[version.changeKind as MutatingKind]
          const ChangeIcon = meta.icon
          return (
            <div key={`${version.spanId}-${version.endTime}`} className="flex items-center gap-2 px-1 py-1.5">
              <ChangeIcon className={cn("h-3.5 w-3.5 shrink-0", meta.className)} />
              <Text.H6 className="w-16 shrink-0">{meta.label}</Text.H6>
              <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate font-mono">
                {version.sessionId || "—"}
              </Text.H6>
              <Text.H6 color="foregroundMuted" className="shrink-0">
                {relativeTime(new Date(version.endTime))}
              </Text.H6>
            </div>
          )
        })}
      </div>
    </div>
  )
}
