import { CodeBlock, cn, Icon, Skeleton, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  HistoryIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react"
import { useState } from "react"
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-center border-b px-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex-1 p-3">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    )
  }
  if (!data) return null

  const body = data.body ?? ""
  const language = body !== "" && looksLikeJson(body) ? "json" : undefined
  const lineCount = body === "" ? 0 : body.split("\n").length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Text.H5M className="min-w-0 font-mono" noWrap ellipsis>
            {recordDisplayLabel(recordId)}
          </Text.H5M>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {language === "json" ? (
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
              JSON
            </span>
          ) : null}
          {data.body !== null ? (
            <Text.H6 color="foregroundMuted" noWrap>
              {formatCount(lineCount)} {lineCount === 1 ? "line" : "lines"} · {formatCount(data.tokenCount)} tok
            </Text.H6>
          ) : (
            <Text.H6 color="foregroundMuted" noWrap>
              {formatCount(data.tokenCount)} tok
            </Text.H6>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {data.body !== null ? (
          <CodeBlock value={body} fillHeight className="h-full rounded-none" {...(language ? { language } : {})} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Text.H6 color="foregroundMuted">Content not captured</Text.H6>
          </div>
        )}
      </div>

      <RecordHistoryPanel versions={data.versions} />
    </div>
  )
}

function RecordHistoryPanel({ versions }: { readonly versions: readonly MemoryRecordVersionRecord[] }) {
  const [open, setOpen] = useState(true)
  const mutating = versions.filter((version) => isMutating(version.changeKind))
  if (mutating.length === 0) return null

  return (
    <div className="shrink-0 border-t">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Text.H6M>Record History</Text.H6M>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
            {mutating.length}
          </span>
        </div>
        <Icon icon={open ? ChevronDownIcon : ChevronUpIcon} size="sm" color="foregroundMuted" className="shrink-0" />
      </button>
      {open ? (
        <div className="h-40 overflow-y-auto border-t px-1 py-1">
          {mutating.map((version) => {
            const meta = CHANGE_META[version.changeKind as MutatingKind]
            const ChangeIcon = meta.icon
            return (
              <div key={`${version.spanId}-${version.endTime}`} className="flex items-center gap-2 px-2 py-1.5">
                <ChangeIcon className={cn("h-3.5 w-3.5 shrink-0", meta.className)} />
                <Text.H6 className="w-14 shrink-0">{meta.label}</Text.H6>
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
      ) : null}
    </div>
  )
}
