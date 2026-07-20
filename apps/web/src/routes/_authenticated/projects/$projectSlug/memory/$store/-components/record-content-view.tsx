import { CodeBlock, CodeDiff, cn, Icon, Sheet, Skeleton, Text, useMountEffect } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  FileTextIcon,
  HistoryIcon,
  type LucideIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from "lucide-react"
import { type ReactNode, useCallback, useRef, useState } from "react"
import {
  useMemoryRecord,
  useMemoryRecordChangeDiff,
  useMemoryRecordReads,
  useMemoryRecordUsers,
} from "../../../../../../../domains/memories/memories.collection.ts"
import type {
  MemoryRecordReadRecord,
  MemoryRecordUserRecord,
  MemoryRecordVersionRecord,
} from "../../../../../../../domains/memories/memories.functions.ts"
import { SessionDetailDrawer } from "../../../-components/session-detail-drawer.tsx"
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

const DATETIME_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const plural = (count: number, noun: string) => `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`

export function RecordContentView({
  projectId,
  projectSlug,
  storeId,
  recordId,
  changeSpanId,
  onSelectChange,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly storeId: string
  readonly recordId: string
  readonly changeSpanId?: string | undefined
  readonly onSelectChange: (spanId: string | undefined) => void
}) {
  const { data, isLoading } = useMemoryRecord({ projectId, storeId, recordId })
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const toggleChange = useCallback(
    (spanId: string) => onSelectChange(changeSpanId === spanId ? undefined : spanId),
    [changeSpanId, onSelectChange],
  )

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
  const changes = data.versions.filter((version) => isMutating(version.changeKind))
  const activeVersion = changeSpanId != null ? changes.find((version) => version.spanId === changeSpanId) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <RecordHeader
        recordId={recordId}
        tokenCount={data.tokenCount}
        activeVersion={activeVersion}
        changes={changes}
        onSelectChange={onSelectChange}
        onOpenSession={setOpenSessionId}
        {...(language ? { language } : {})}
      />

      {activeVersion ? (
        <RecordChangeDiffBody projectId={projectId} storeId={storeId} recordId={recordId} version={activeVersion} />
      ) : (
        <div className="min-h-0 flex-1">
          {data.body !== null ? (
            <CodeBlock value={body} fillHeight className="h-full rounded-none" {...(language ? { language } : {})} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Text.H6 color="foregroundMuted">Content not captured</Text.H6>
            </div>
          )}
        </div>
      )}

      <RecordActivityPanel
        projectId={projectId}
        projectSlug={projectSlug}
        storeId={storeId}
        recordId={recordId}
        changes={changes}
        onOpenSession={setOpenSessionId}
        onToggleDiff={toggleChange}
        activeDiffSpanId={changeSpanId ?? null}
      />

      <Sheet open={openSessionId !== null} onClose={() => setOpenSessionId(null)} closeAriaLabel="Close session panel">
        {openSessionId ? (
          <SessionDetailDrawer
            key={openSessionId}
            projectId={projectId}
            sessionId={openSessionId}
            onClose={() => setOpenSessionId(null)}
            defaultTab="session"
          />
        ) : null}
      </Sheet>
    </div>
  )
}

// A stable header for both modes: record identity stays put on the left, the
// selected change's facts (kind, churn, session) and the date + change
// navigation sit together on the right. "Current" is the position above the
// newest change, so ↑ from the newest change returns to it (and is disabled
// while already viewing current); ↓ from current opens the newest change.
function RecordHeader({
  recordId,
  tokenCount,
  language,
  activeVersion,
  changes,
  onSelectChange,
  onOpenSession,
}: {
  readonly recordId: string
  readonly tokenCount: number
  readonly language?: string | undefined
  readonly activeVersion: MemoryRecordVersionRecord | undefined
  readonly changes: readonly MemoryRecordVersionRecord[]
  readonly onSelectChange: (spanId: string | undefined) => void
  readonly onOpenSession: (sessionId: string) => void
}) {
  const activeIndex = activeVersion ? changes.findIndex((change) => change.spanId === activeVersion.spanId) : -1
  const canNewer = activeVersion != null
  const canOlder = activeVersion ? activeIndex >= 0 && activeIndex < changes.length - 1 : changes.length > 0
  const goNewer = () => onSelectChange(activeIndex <= 0 ? undefined : changes[activeIndex - 1]?.spanId)
  const goOlder = () => onSelectChange(activeVersion ? changes[activeIndex + 1]?.spanId : changes[0]?.spanId)

  const meta = activeVersion ? CHANGE_META[activeVersion.changeKind as MutatingKind] : undefined
  const ChangeIcon = meta?.icon
  // In the current view the date reflects the last update — the newest change.
  const dateVersion = activeVersion ?? changes[0]

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3">
      <div className="flex min-w-0 items-center gap-2">
        <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Text.H5M className="min-w-0 font-mono" noWrap ellipsis>
          {recordDisplayLabel(recordId)}
        </Text.H5M>
        <Sep />
        <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap tabular-nums">
          {formatCount(activeVersion?.tokenCount ?? tokenCount)} tok
        </Text.H6>
        {language === "json" ? (
          <span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
            JSON
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {activeVersion && meta && ChangeIcon ? (
          <>
            <span className="flex items-center gap-1">
              <ChangeIcon className={cn("h-3.5 w-3.5 shrink-0", meta.className)} />
              <Text.H6 className="whitespace-nowrap">{meta.label}</Text.H6>
            </span>
            <Sep />
            <ChangeTokens added={activeVersion.tokensAdded} removed={activeVersion.tokensRemoved} />
            {activeVersion.sessionId ? (
              <OpenSessionButton sessionId={activeVersion.sessionId} onOpenSession={onOpenSession} />
            ) : null}
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          </>
        ) : null}
        {dateVersion ? <ActivityTime iso={dateVersion.endTime} /> : null}
        <span className="ml-0.5 flex items-center">
          <NavButton
            icon={ChevronUpIcon}
            label={activeIndex === 0 ? "Back to current version" : "Newer change"}
            onClick={canNewer ? goNewer : undefined}
          />
          <NavButton
            icon={ChevronDownIcon}
            label={activeVersion ? "Older change" : "View latest change"}
            onClick={canOlder ? goOlder : undefined}
          />
        </span>
      </div>
    </div>
  )
}

function RecordChangeDiffBody({
  projectId,
  storeId,
  recordId,
  version,
}: {
  readonly projectId: string
  readonly storeId: string
  readonly recordId: string
  readonly version: MemoryRecordVersionRecord
}) {
  const { data, isLoading } = useMemoryRecordChangeDiff({ projectId, storeId, recordId, spanId: version.spanId })
  const before = data?.beforeBody ?? ""
  const after = data?.afterBody ?? ""
  const language = looksLikeJson(after) || looksLikeJson(before) ? "json" : undefined
  const unchanged = data != null && !data.degraded && before === after

  return (
    <div className="min-h-0 flex-1">
      {isLoading ? (
        <div className="p-3">
          <Skeleton className="h-full w-full" />
        </div>
      ) : data == null ? null : data.degraded ? (
        <div className="flex h-full items-center justify-center">
          <Text.H6 color="foregroundMuted">Content not captured for this change</Text.H6>
        </div>
      ) : unchanged ? (
        <div className="flex h-full items-center justify-center">
          <Text.H6 color="foregroundMuted">No content changes</Text.H6>
        </div>
      ) : (
        <CodeDiff
          before={before}
          after={after}
          fillHeight
          className="h-full rounded-none"
          {...(language ? { language } : {})}
        />
      )}
    </div>
  )
}

const MIN_PANEL_HEIGHT = 96
const DEFAULT_PANEL_HEIGHT = 160
// Reserve this much for the editor header + code area + panel header so the code never vanishes.
const MIN_CONTENT_ABOVE = 200
// Drag the list shorter than this and it closes instead of clamping to the minimum.
const CLOSE_DRAG_THRESHOLD = 64
const KEYBOARD_STEP = 24

// Vertical sibling of the span-tree `useResizablePanel`: drags the activity list taller/shorter.
function usePanelResize(setOpen: (open: boolean) => void) {
  const footerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const drag = useRef<{ startY: number; startHeight: number; max: number } | null>(null)
  const moveRef = useRef<((event: PointerEvent) => void) | null>(null)
  const upRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (moveRef.current) {
      document.removeEventListener("pointermove", moveRef.current)
      moveRef.current = null
    }
    if (upRef.current) {
      document.removeEventListener("pointerup", upRef.current)
      document.removeEventListener("pointercancel", upRef.current)
      upRef.current = null
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("cursor")
  }, [])

  const maxHeight = useCallback(() => {
    const panel = footerRef.current?.parentElement
    if (!panel) return DEFAULT_PANEL_HEIGHT
    return Math.max(MIN_PANEL_HEIGHT, panel.offsetHeight - MIN_CONTENT_ABOVE)
  }, [])

  useMountEffect(() => {
    const panel = footerRef.current?.parentElement
    if (!panel) return
    const observer = new ResizeObserver(() => setHeight((prev) => Math.min(prev, maxHeight())))
    observer.observe(panel)
    return () => {
      observer.disconnect()
      cleanup()
    }
  })

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      if (!footerRef.current?.parentElement) return
      drag.current = { startY: event.clientY, startHeight: height, max: maxHeight() }
      setIsDragging(true)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "ns-resize"

      const onMove = (moveEvent: PointerEvent) => {
        const current = drag.current
        if (!current) return
        const raw = current.startHeight + (current.startY - moveEvent.clientY)
        if (raw < CLOSE_DRAG_THRESHOLD) {
          drag.current = null
          setIsDragging(false)
          cleanup()
          setOpen(false)
          return
        }
        setHeight(Math.max(MIN_PANEL_HEIGHT, Math.min(current.max, raw)))
      }
      const onUp = () => {
        drag.current = null
        setIsDragging(false)
        cleanup()
      }
      moveRef.current = onMove
      upRef.current = onUp
      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
      document.addEventListener("pointercancel", onUp)
    },
    [height, maxHeight, cleanup, setOpen],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      const delta = event.key === "ArrowUp" ? KEYBOARD_STEP : -KEYBOARD_STEP
      setHeight((prev) => Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight(), prev + delta)))
    },
    [maxHeight],
  )

  return { footerRef, height, isDragging, onPointerDown, onKeyDown }
}

type TabId = "changes" | "reads" | "users"
const TABS: readonly { readonly id: TabId; readonly label: string; readonly icon: LucideIcon }[] = [
  { id: "changes", label: "Changes", icon: HistoryIcon },
  { id: "reads", label: "Reads", icon: SearchIcon },
  { id: "users", label: "Users", icon: UsersRoundIcon },
]

function RecordActivityPanel({
  projectId,
  projectSlug,
  storeId,
  recordId,
  changes,
  onOpenSession,
  onToggleDiff,
  activeDiffSpanId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly storeId: string
  readonly recordId: string
  readonly changes: readonly MemoryRecordVersionRecord[]
  readonly onOpenSession: (sessionId: string) => void
  readonly onToggleDiff: (spanId: string) => void
  readonly activeDiffSpanId: string | null
}) {
  const [open, setOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("changes")
  const { footerRef, height, isDragging, onPointerDown, onKeyDown } = usePanelResize(setOpen)

  const reads = useMemoryRecordReads({ projectId, storeId, recordId, enabled: open })
  const users = useMemoryRecordUsers({ projectId, storeId, recordId, enabled: open })

  const counts: Record<TabId, number | undefined> = {
    changes: changes.length,
    reads: reads.data?.length,
    users: users.data?.length,
  }

  const selectTab = (tab: TabId) => {
    setActiveTab(tab)
    if (!open) setOpen(true)
  }

  const maxHeight = footerRef.current?.parentElement
    ? Math.max(MIN_PANEL_HEIGHT, footerRef.current.parentElement.offsetHeight - MIN_CONTENT_ABOVE)
    : DEFAULT_PANEL_HEIGHT

  return (
    <div ref={footerRef} className="relative shrink-0 border-t bg-background">
      {open ? (
        // biome-ignore lint/a11y/useSemanticElements: resize handle requires div for drag events
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize record activity"
          aria-valuenow={height}
          aria-valuemin={MIN_PANEL_HEIGHT}
          aria-valuemax={maxHeight}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-ns-resize touch-none items-center justify-center focus-visible:outline-none"
        >
          <div
            className={cn(
              "h-1 w-10 rounded-full transition-opacity",
              isDragging
                ? "bg-muted-foreground/60 opacity-100"
                : "bg-border opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </div>
      ) : null}

      <div className="flex h-10 items-center justify-between gap-2 pr-1">
        <div className="flex h-full items-stretch" role="tablist" aria-label="Record activity">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const count = counts[tab.id]
            const TabIcon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                onClick={() => selectTab(tab.id)}
                aria-selected={isActive}
                className={cn(
                  "relative flex cursor-pointer items-center gap-1.5 px-3 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TabIcon className="h-3.5 w-3.5 shrink-0" />
                <Text.H6M color={isActive ? "foreground" : "foregroundMuted"}>{tab.label}</Text.H6M>
                {count !== undefined ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    {count}
                  </span>
                ) : null}
                {isActive && open ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Collapse panel" : "Expand panel"}
          className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Icon icon={open ? ChevronDownIcon : ChevronUpIcon} size="sm" color="foregroundMuted" />
        </button>
      </div>

      {open ? (
        <div className="overflow-y-auto border-t px-1 py-1" style={{ height }}>
          {activeTab === "changes" ? (
            <ChangesBody
              changes={changes}
              onOpenSession={onOpenSession}
              onToggleDiff={onToggleDiff}
              activeDiffSpanId={activeDiffSpanId}
            />
          ) : activeTab === "reads" ? (
            <ReadsBody isLoading={reads.isLoading} reads={reads.data ?? []} onOpenSession={onOpenSession} />
          ) : (
            <UsersBody isLoading={users.isLoading} users={users.data ?? []} projectSlug={projectSlug} />
          )}
        </div>
      ) : null}
    </div>
  )
}

// Row rhythm shared across the three lists: uniform height, leading anchor,
// middot-separated self-labeling facts, hover-revealed open affordance.
const ROW_CLASS = "group flex h-7 w-full items-center gap-1.5 rounded px-2 text-left"
const ROW_INTERACTIVE =
  "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"

function ActivityTime({ iso, className }: { readonly iso: string; readonly className?: string }) {
  const date = new Date(iso)
  return (
    <Text.H6 color="foregroundMuted" className={cn("shrink-0 whitespace-nowrap tabular-nums", className)}>
      <span title={date.toLocaleString()}>{DATETIME_FMT.format(date)}</span>
    </Text.H6>
  )
}

function Sep() {
  return (
    <span aria-hidden className="shrink-0 text-muted-foreground/40">
      ·
    </span>
  )
}

function UserMeta({ userId, className }: { readonly userId: string; readonly className?: string }) {
  if (!userId) {
    return (
      <Text.H6 color="foregroundMuted" className={cn("shrink-0 whitespace-nowrap italic", className)}>
        no user
      </Text.H6>
    )
  }
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <UserRoundIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <Text.H6 color="foregroundMuted" className="truncate font-mono">
        {userId}
      </Text.H6>
    </span>
  )
}

// The change's gross token churn, `+added −removed` (GitHub-style), not the net.
function ChangeTokens({ added, removed }: { readonly added: number; readonly removed: number }) {
  if (added === 0 && removed === 0) {
    return (
      <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap tabular-nums">
        ±0 tok
      </Text.H6>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
      {added > 0 ? <Text.H6 className="text-success">+{formatCount(added)}</Text.H6> : null}
      {removed > 0 ? <Text.H6 className="text-destructive">−{formatCount(removed)}</Text.H6> : null}
      <Text.H6 color="foregroundMuted">tok</Text.H6>
    </span>
  )
}

function OpenSessionButton({
  sessionId,
  onOpenSession,
}: {
  readonly sessionId: string
  readonly onOpenSession: (sessionId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenSession(sessionId)}
      aria-label={`Open session ${sessionId}`}
      className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Text.H6 color="foregroundMuted" className="whitespace-nowrap">
        Session
      </Text.H6>
      <ArrowUpRightIcon className="h-3 w-3 shrink-0" />
    </button>
  )
}

// Right-aligned, hover-revealed — signals the row opens a session in the drawer.
function OpenHint() {
  return (
    <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
  )
}

function NavButton({
  icon: NavIcon,
  label,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly onClick: (() => void) | undefined
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={onClick === undefined}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
    >
      <NavIcon className="h-4 w-4" />
    </button>
  )
}

function ActivityRow({
  sessionId,
  onOpenSession,
  children,
}: {
  readonly sessionId: string
  readonly onOpenSession: (sessionId: string) => void
  readonly children: ReactNode
}) {
  if (!sessionId) {
    return <div className={ROW_CLASS}>{children}</div>
  }
  return (
    <button
      type="button"
      onClick={() => onOpenSession(sessionId)}
      aria-label={`Open session ${sessionId}`}
      className={cn(ROW_CLASS, ROW_INTERACTIVE)}
    >
      {children}
      <OpenHint />
    </button>
  )
}

function EmptyRow({ children }: { readonly children: ReactNode }) {
  return (
    <div className="px-3 py-4">
      <Text.H6 color="foregroundMuted">{children}</Text.H6>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  )
}

function ChangesBody({
  changes,
  onOpenSession,
  onToggleDiff,
  activeDiffSpanId,
}: {
  readonly changes: readonly MemoryRecordVersionRecord[]
  readonly onOpenSession: (sessionId: string) => void
  readonly onToggleDiff: (spanId: string) => void
  readonly activeDiffSpanId: string | null
}) {
  if (changes.length === 0) return <EmptyRow>No changes recorded for this record.</EmptyRow>
  return (
    <>
      {changes.map((version) => {
        const meta = CHANGE_META[version.changeKind as MutatingKind]
        const ChangeIcon = meta.icon
        const isActive = activeDiffSpanId === version.spanId
        return (
          <div key={`${version.spanId}-${version.endTime}`} className={cn(ROW_CLASS, isActive && "bg-muted")}>
            <button
              type="button"
              onClick={() => onToggleDiff(version.spanId)}
              aria-label="View this change's diff"
              aria-pressed={isActive}
              className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded", ROW_INTERACTIVE)}
            >
              <ActivityTime iso={version.endTime} />
              <span className="flex shrink-0 items-center gap-1.5">
                <ChangeIcon className={cn("h-3.5 w-3.5 shrink-0", meta.className)} />
                <Text.H6 className="whitespace-nowrap">{meta.label}</Text.H6>
              </span>
              <Sep />
              <ChangeTokens added={version.tokensAdded} removed={version.tokensRemoved} />
              <Sep />
              <UserMeta userId={version.userId} className="max-w-[14rem]" />
            </button>
            {version.sessionId ? (
              <OpenSessionButton sessionId={version.sessionId} onOpenSession={onOpenSession} />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function ReadsBody({
  isLoading,
  reads,
  onOpenSession,
}: {
  readonly isLoading: boolean
  readonly reads: readonly MemoryRecordReadRecord[]
  readonly onOpenSession: (sessionId: string) => void
}) {
  if (isLoading) return <LoadingRows />
  if (reads.length === 0) return <EmptyRow>This record hasn't been retrieved yet.</EmptyRow>
  return (
    <>
      {reads.map((read) => (
        <ActivityRow key={`${read.spanId}-${read.endTime}`} sessionId={read.sessionId} onOpenSession={onOpenSession}>
          <ActivityTime iso={read.endTime} />
          {read.queryText ? (
            <Text.H6 className="min-w-0 flex-1 truncate">
              <span title={read.queryText}>{read.queryText}</span>
            </Text.H6>
          ) : (
            <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate italic">
              no query
            </Text.H6>
          )}
          <Sep />
          <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCount(read.tokenCount)} tok
          </Text.H6>
          <Sep />
          <UserMeta userId={read.userId} className="max-w-[10rem]" />
        </ActivityRow>
      ))}
    </>
  )
}

function UsersBody({
  isLoading,
  users,
  projectSlug,
}: {
  readonly isLoading: boolean
  readonly users: readonly MemoryRecordUserRecord[]
  readonly projectSlug: string
}) {
  if (isLoading) return <LoadingRows />
  if (users.length === 0) return <EmptyRow>No user has accessed this record.</EmptyRow>
  return (
    <>
      {users.map((user) => (
        <Link
          key={user.userId}
          to="/projects/$projectSlug/users/$userId"
          params={{ projectSlug, userId: user.userId }}
          className={cn(ROW_CLASS, ROW_INTERACTIVE)}
        >
          <UserRoundIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Text.H6 className="min-w-0 flex-1 truncate font-mono">{user.userId}</Text.H6>
          <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap">
            {plural(user.readCount, "read")} · {plural(user.writeCount, "write")}
          </Text.H6>
          <ActivityTime iso={user.lastAccessedAt} className="ml-3" />
          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ))}
    </>
  )
}
