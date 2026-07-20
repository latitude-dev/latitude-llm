import { ChevronDown, ChevronUp, UnfoldVertical } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { cn } from "../../utils/cn.ts"
import { computeDiffRows, type DiffFoldItem, type DiffRow, type DiffRowKind, foldDiffRows } from "./diff-model.ts"
import { highlightToLines, type LineToken } from "./highlight-lines.ts"

interface CodeDiffViewProps {
  readonly before: string
  readonly after: string
  readonly className?: string
  readonly language?: string | undefined
  readonly fillHeight?: boolean
  /** Collapse unchanged runs, keeping this many context lines around each change. Omit to show every line. */
  readonly contextLines?: number | undefined
}

/** Rows revealed per click when expanding a fold from either end (GitHub's step). */
const EXPAND_STEP = 20

type FoldState = { readonly top: number; readonly bottom: number }

interface RenderSegment {
  readonly text: string
  readonly hljsClass: string | null
  readonly emphasis: boolean
}

const ROW_BG: Record<DiffRowKind, string> = {
  context: "",
  add: "bg-success-muted",
  remove: "bg-destructive-muted",
}

// Stronger, saturated tint over the line fill — highlights the exact words that changed.
const EMPHASIS_BG: Record<DiffRowKind, string> = {
  context: "",
  add: "bg-success/30",
  remove: "bg-destructive/30",
}

const SIGN: Record<DiffRowKind, string> = { context: " ", add: "+", remove: "−" }

const SIGN_COLOR: Record<DiffRowKind, string> = {
  context: "text-muted-foreground/40",
  add: "text-success-muted-foreground",
  remove: "text-destructive-muted-foreground",
}

function isEmphasized(column: number, emphases: DiffRow["emphases"]): boolean {
  for (const [start, end] of emphases) {
    if (column >= start && column < end) return true
  }
  return false
}

/** Split each syntax token wherever the word-level emphasis toggles. */
function buildRenderSegments(lineTokens: LineToken[], emphases: DiffRow["emphases"]): RenderSegment[] {
  const segments: RenderSegment[] = []
  for (const token of lineTokens) {
    let i = 0
    while (i < token.text.length) {
      const emphasis = isEmphasized(token.start + i, emphases)
      let j = i + 1
      while (j < token.text.length && isEmphasized(token.start + j, emphases) === emphasis) j++
      segments.push({ text: token.text.slice(i, j), hljsClass: token.hljsClass, emphasis })
      i = j
    }
  }
  return segments
}

function LineGutter({ value, className }: { value: number | null; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-[2.5rem] shrink-0 select-none px-2 text-right tabular-nums text-muted-foreground/60",
        className,
      )}
    >
      {value ?? ""}
    </span>
  )
}

function DiffLine({ row, segments }: { row: DiffRow; segments: RenderSegment[] }) {
  return (
    <div className={cn("flex items-stretch", ROW_BG[row.kind])}>
      <LineGutter value={row.oldLineNumber} />
      <LineGutter value={row.newLineNumber} className="border-r border-border/60" />
      <span className={cn("w-5 shrink-0 select-none text-center", SIGN_COLOR[row.kind])}>{SIGN[row.kind]}</span>
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words py-px pr-3">
        {segments.map((segment, i) => {
          const className = cn(segment.hljsClass, segment.emphasis && EMPHASIS_BG[row.kind]) || undefined
          return (
            <span key={i} {...(className != null && { className })}>
              {segment.text}
            </span>
          )
        })}
      </code>
    </div>
  )
}

const FOLD_BUTTON = "rounded p-0.5 hover:bg-muted hover:text-foreground"

function FoldBar({
  count,
  onExpandDown,
  onExpandUp,
  onExpandAll,
}: {
  readonly count: number
  readonly onExpandDown: () => void
  readonly onExpandUp: () => void
  readonly onExpandAll: () => void
}) {
  const label = `${count} unchanged ${count === 1 ? "line" : "lines"}`
  return (
    <div className="flex select-none items-stretch bg-muted/40 text-muted-foreground/80">
      <div className="flex min-w-[5rem] shrink-0 items-center justify-center gap-1 border-r border-border/60 py-0.5">
        {count > EXPAND_STEP ? (
          <>
            <button
              type="button"
              title="Expand down"
              aria-label="Expand down"
              onClick={onExpandDown}
              className={FOLD_BUTTON}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Expand up" aria-label="Expand up" onClick={onExpandUp} className={FOLD_BUTTON}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            title="Expand all"
            aria-label="Expand all"
            onClick={onExpandAll}
            className={FOLD_BUTTON}
          >
            <UnfoldVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        title="Expand all"
        onClick={onExpandAll}
        className="flex min-w-0 flex-1 items-center gap-2 py-0.5 pl-2 pr-3 text-left hover:text-foreground"
      >
        <span aria-hidden className="text-muted-foreground/50">
          ⋯
        </span>
        <span className="truncate">{label}</span>
      </button>
    </div>
  )
}

/** Read-only, GitHub-style unified diff of two text bodies, syntax-highlighted per line. */
export function CodeDiffView({
  before,
  after,
  className,
  language,
  fillHeight = false,
  contextLines,
}: CodeDiffViewProps) {
  const { rows, beforeLines, afterLines } = useMemo(
    () => ({
      rows: computeDiffRows(before, after),
      beforeLines: highlightToLines(before, language),
      afterLines: highlightToLines(after, language),
    }),
    [before, after, language],
  )
  const items = useMemo(() => (contextLines == null ? null : foldDiffRows(rows, contextLines)), [rows, contextLines])
  // Reset fold expansion when the diff content changes (this viewer is reused across records).
  const [store, setStore] = useState<{ before: string; after: string; folds: Record<string, FoldState> }>({
    before,
    after,
    folds: {},
  })
  const folds = store.before === before && store.after === after ? store.folds : {}
  const setFold = (id: string, next: FoldState) =>
    setStore((prev) => {
      const base = prev.before === before && prev.after === after ? prev.folds : {}
      return { before, after, folds: { ...base, [id]: next } }
    })

  const renderLine = (row: DiffRow, key: string) => {
    const lineTokens =
      row.kind === "remove"
        ? (beforeLines[(row.oldLineNumber ?? 1) - 1] ?? [])
        : (afterLines[(row.newLineNumber ?? 1) - 1] ?? [])
    return <DiffLine key={key} row={row} segments={buildRenderSegments(lineTokens, row.emphases)} />
  }

  const renderFold = (fold: DiffFoldItem) => {
    const total = fold.rows.length
    const state = folds[fold.id] ?? { top: 0, bottom: 0 }
    const top = Math.min(state.top, total)
    const bottom = Math.min(state.bottom, total - top)
    const remaining = total - top - bottom
    return (
      <Fragment key={fold.id}>
        {fold.rows.slice(0, top).map((row, k) => renderLine(row, `${fold.id}-t-${k}`))}
        {remaining > 0 && (
          <FoldBar
            count={remaining}
            onExpandDown={() => setFold(fold.id, { top: Math.min(top + EXPAND_STEP, total - bottom), bottom })}
            onExpandUp={() => setFold(fold.id, { top, bottom: Math.min(bottom + EXPAND_STEP, total - top) })}
            onExpandAll={() => setFold(fold.id, { top: total, bottom: 0 })}
          />
        )}
        {bottom > 0 && fold.rows.slice(total - bottom).map((row, k) => renderLine(row, `${fold.id}-b-${k}`))}
      </Fragment>
    )
  }

  return (
    <div
      className={cn(
        "overflow-auto rounded-md bg-muted font-mono text-xs leading-[1.6] text-foreground",
        { "h-full": fillHeight },
        className,
      )}
    >
      {items == null
        ? rows.map((row, index) => renderLine(row, String(index)))
        : items.map((item, index) => (item.type === "line" ? renderLine(item.row, String(index)) : renderFold(item)))}
    </div>
  )
}
