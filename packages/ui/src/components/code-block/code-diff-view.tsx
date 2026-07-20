import { useMemo } from "react"
import { cn } from "../../utils/cn.ts"
import { computeDiffRows, type DiffRow, type DiffRowKind } from "./diff-model.ts"
import { highlightToLines, type LineToken } from "./highlight-lines.ts"

interface CodeDiffViewProps {
  readonly before: string
  readonly after: string
  readonly className?: string
  readonly language?: string | undefined
  readonly fillHeight?: boolean
}

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

/** Read-only, GitHub-style unified diff of two text bodies, syntax-highlighted per line. */
export function CodeDiffView({ before, after, className, language, fillHeight = false }: CodeDiffViewProps) {
  const { rows, beforeLines, afterLines } = useMemo(
    () => ({
      rows: computeDiffRows(before, after),
      beforeLines: highlightToLines(before, language),
      afterLines: highlightToLines(after, language),
    }),
    [before, after, language],
  )

  return (
    <div
      className={cn(
        "overflow-auto rounded-md bg-muted font-mono text-xs leading-[1.6] text-foreground",
        { "h-full": fillHeight },
        className,
      )}
    >
      {rows.map((row, index) => {
        const lineTokens =
          row.kind === "remove"
            ? (beforeLines[(row.oldLineNumber ?? 1) - 1] ?? [])
            : (afterLines[(row.newLineNumber ?? 1) - 1] ?? [])
        return <DiffLine key={index} row={row} segments={buildRenderSegments(lineTokens, row.emphases)} />
      })}
    </div>
  )
}
