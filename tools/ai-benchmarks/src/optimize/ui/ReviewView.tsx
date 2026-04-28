import { createPatch } from "diff"
import { Box, Text, useApp, useInput } from "ink"
import { useMemo, useState } from "react"
import { formatCostUsd } from "../../ui/format.ts"
import type { CandidateRecord, IterationRecord, SerializedAuditTrail } from "../audit-trail.ts"

/**
 * Two-pane post-run reviewer for an optimization audit.
 *
 * - LIST view: paginated table of iterations, one row each. Shows per-row
 *   score breakdown (counts by phase) so you can spot at a glance which
 *   iterations actually exercised the LLM vs short-circuited via the
 *   deterministic phase. Highlights ⭐ on iterations that scored higher
 *   than the baseline.
 *
 * - DETAIL view: a single iteration drilled in. Top: proposer reasoning
 *   (full text, scrollable). Middle: per-row scores grouped by phase.
 *   Bottom: unified diff between the iteration's candidate and the
 *   baseline file (the "vs original" the user asked for). All
 *   independently scrollable in the same pane via ↑↓ on a single
 *   "global scroll" cursor — keeps the input model simple.
 *
 * Keyboard: ↑/k ↓/j navigate, Enter to drill in, Esc/Backspace back,
 * PgUp/PgDn or [ ] scroll detail by 10, q to quit.
 */

const ROWS_PER_PAGE = 12
const DETAIL_VISIBLE_LINES = 28

interface ReviewProps {
  readonly audit: SerializedAuditTrail
}

type Mode =
  | { kind: "list"; cursor: number; pageOffset: number }
  | { kind: "detail"; iterationIdx: number; scroll: number }

export const ReviewView = ({ audit }: ReviewProps) => {
  const { exit } = useApp()
  const candidatesByHash = useMemo(() => new Map(audit.candidates.map((c) => [c.hash, c])), [audit.candidates])
  const baselineCandidate = candidatesByHash.get(audit.baselineHash)
  const baselineText = baselineCandidate?.text ?? ""

  const [mode, setMode] = useState<Mode>({ kind: "list", cursor: 0, pageOffset: 0 })

  useInput((input, key) => {
    if (input === "q") {
      exit()
      return
    }
    if (mode.kind === "list") {
      const max = audit.iterations.length - 1
      if (key.upArrow || input === "k") {
        const next = Math.max(0, mode.cursor - 1)
        const pageOffset = next < mode.pageOffset ? Math.max(0, mode.pageOffset - 1) : mode.pageOffset
        setMode({ kind: "list", cursor: next, pageOffset })
        return
      }
      if (key.downArrow || input === "j") {
        const next = Math.min(max, mode.cursor + 1)
        const pageOffset = next >= mode.pageOffset + ROWS_PER_PAGE ? mode.pageOffset + 1 : mode.pageOffset
        setMode({ kind: "list", cursor: next, pageOffset })
        return
      }
      if (key.pageUp || input === "[") {
        const next = Math.max(0, mode.cursor - ROWS_PER_PAGE)
        setMode({ kind: "list", cursor: next, pageOffset: Math.max(0, mode.pageOffset - ROWS_PER_PAGE) })
        return
      }
      if (key.pageDown || input === "]") {
        const next = Math.min(max, mode.cursor + ROWS_PER_PAGE)
        setMode({ kind: "list", cursor: next, pageOffset: Math.min(max, mode.pageOffset + ROWS_PER_PAGE) })
        return
      }
      if (key.return) {
        setMode({ kind: "detail", iterationIdx: mode.cursor, scroll: 0 })
        return
      }
    } else {
      if (key.escape || key.backspace || key.delete) {
        setMode({ kind: "list", cursor: mode.iterationIdx, pageOffset: 0 })
        return
      }
      if (key.upArrow || input === "k") {
        setMode({ ...mode, scroll: Math.max(0, mode.scroll - 1) })
        return
      }
      if (key.downArrow || input === "j") {
        setMode({ ...mode, scroll: mode.scroll + 1 })
        return
      }
      if (key.pageUp || input === "[") {
        setMode({ ...mode, scroll: Math.max(0, mode.scroll - 10) })
        return
      }
      if (key.pageDown || input === "]") {
        setMode({ ...mode, scroll: mode.scroll + 10 })
        return
      }
    }
  })

  if (mode.kind === "list") {
    return (
      <Box flexDirection="column">
        <Header audit={audit} />
        <ListView audit={audit} candidatesByHash={candidatesByHash} cursor={mode.cursor} pageOffset={mode.pageOffset} />
        <Footer hint="↑↓/jk navigate · Enter inspect · [ ] page · q quit" />
      </Box>
    )
  }

  const iteration = audit.iterations[mode.iterationIdx]
  if (iteration === undefined) {
    return (
      <Box>
        <Text color="red">iteration {mode.iterationIdx} not found</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Header audit={audit} />
      <DetailView
        iteration={iteration}
        candidate={candidatesByHash.get(iteration.childHash)}
        baselineText={baselineText}
        baselinePath={audit.targetId}
        scroll={mode.scroll}
      />
      <Footer hint="↑↓/jk scroll · [ ] page · Esc/Backspace back · q quit" />
    </Box>
  )
}

const Header = ({ audit }: { readonly audit: SerializedAuditTrail }) => {
  const ts = audit.startedAt.replace("T", " ").slice(0, 19)
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="cyan">
          {audit.targetId}
        </Text>
        <Text color="gray"> — review · </Text>
        <Text>{ts}</Text>
        <Text color="gray"> · </Text>
        <Text>{audit.iterations.length} iterations</Text>
      </Text>
      <Text color="gray">{"─".repeat(78)}</Text>
    </Box>
  )
}

const Footer = ({ hint }: { readonly hint: string }) => (
  <Box marginTop={1}>
    <Text color="gray">{hint}</Text>
  </Box>
)

const ListView = ({
  audit,
  candidatesByHash,
  cursor,
  pageOffset,
}: {
  readonly audit: SerializedAuditTrail
  readonly candidatesByHash: ReadonlyMap<string, CandidateRecord>
  readonly cursor: number
  readonly pageOffset: number
}) => {
  const visible = audit.iterations.slice(pageOffset, pageOffset + ROWS_PER_PAGE)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold> # Hash Parent Result Score breakdown Cost</Text>
      </Box>
      <Box>
        <Text color="gray">{"─".repeat(96)}</Text>
      </Box>
      {visible.map((it, idxInPage) => {
        const globalIdx = pageOffset + idxInPage
        const isCursor = globalIdx === cursor
        const candidate = candidatesByHash.get(it.childHash)
        return (
          <ListRow key={`${it.iteration}-${it.childHash}`} iteration={it} candidate={candidate} highlight={isCursor} />
        )
      })}
      <Box marginTop={1}>
        <Text color="gray">
          row {cursor + 1}/{audit.iterations.length}
        </Text>
      </Box>
    </Box>
  )
}

const ListRow = ({
  iteration,
  candidate,
  highlight,
}: {
  readonly iteration: IterationRecord
  readonly candidate: CandidateRecord | undefined
  readonly highlight: boolean
}) => {
  const phaseCounts = countPhases(candidate)
  const phasesText = formatPhaseCounts(phaseCounts)
  const result = iteration.rejection ? `✗ ${iteration.rejection.stage}` : "✓ accepted"
  const resultColor: "red" | "green" = iteration.rejection ? "red" : "green"
  const cursor = highlight ? "▸" : " "
  const num = String(iteration.iteration).padStart(2, " ")
  const hashFmt = iteration.childHash.slice(0, 8)
  const parentFmt = iteration.parentHash.slice(0, 8)
  const cost = formatCostUsd(iteration.proposerCostUsd ?? 0)
  return (
    <Box>
      {highlight ? (
        <Text color="cyan" bold>
          {cursor} {num}
        </Text>
      ) : (
        <Text>
          {cursor} {num}
        </Text>
      )}
      <Text> </Text>
      <Text color="magenta">{hashFmt}</Text>
      <Text> </Text>
      <Text color="gray">{parentFmt}</Text>
      <Text> </Text>
      <Text color={resultColor}>{result.padEnd(13, " ")}</Text>
      <Text> </Text>
      <Text>{phasesText.padEnd(34, " ")}</Text>
      <Text> </Text>
      <Text color="yellow">{cost}</Text>
    </Box>
  )
}

const countPhases = (candidate: CandidateRecord | undefined): Record<string, number> => {
  if (candidate === undefined) return {}
  const counts: Record<string, number> = {}
  for (const s of candidate.scores) {
    counts[s.phase] = (counts[s.phase] ?? 0) + 1
  }
  return counts
}

const PHASE_ORDER: readonly string[] = [
  "deterministic-match",
  "deterministic-no-match",
  "llm-match",
  "llm-no-match",
  "schema-mismatch",
  "error",
  "candidate-rejected",
]

const PHASE_SHORTHAND: Record<string, string> = {
  "deterministic-match": "det✓",
  "deterministic-no-match": "det✗",
  "llm-match": "llm✓",
  "llm-no-match": "llm✗",
  "schema-mismatch": "sch?",
  error: "err",
  "candidate-rejected": "rej",
}

const formatPhaseCounts = (counts: Record<string, number>): string => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return "(not evaluated)"
  return PHASE_ORDER.filter((p) => (counts[p] ?? 0) > 0)
    .map((p) => `${PHASE_SHORTHAND[p] ?? p}=${counts[p]}`)
    .join(" ")
}

const DetailView = ({
  iteration,
  candidate,
  baselineText,
  baselinePath,
  scroll,
}: {
  readonly iteration: IterationRecord
  readonly candidate: CandidateRecord | undefined
  readonly baselineText: string
  readonly baselinePath: string
  readonly scroll: number
}) => {
  const lines = useMemo(
    () => buildDetailLines({ iteration, candidate, baselineText, baselinePath }),
    [iteration, candidate, baselineText, baselinePath],
  )
  const total = lines.length
  const start = Math.min(scroll, Math.max(0, total - DETAIL_VISIBLE_LINES))
  const slice = lines.slice(start, start + DETAIL_VISIBLE_LINES)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold>Iteration {iteration.iteration}</Text>
        <Text color="gray"> · </Text>
        <Text color="magenta">{iteration.childHash.slice(0, 8)}</Text>
        <Text color="gray"> vs baseline </Text>
        <Text color="gray">{iteration.parentHash.slice(0, 8)}</Text>
      </Box>
      <Box>
        <Text color="gray">{"─".repeat(78)}</Text>
      </Box>
      {slice.map((line, i) => (
        <DetailLine key={`${start}-${i}-${line.kind}-${line.text.slice(0, 32)}`} line={line} />
      ))}
      <Box marginTop={1}>
        <Text color="gray">
          line {start + 1}–{start + slice.length} / {total}
        </Text>
      </Box>
    </Box>
  )
}

type DetailLine =
  | { readonly kind: "section"; readonly text: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "added"; readonly text: string }
  | { readonly kind: "removed"; readonly text: string }
  | { readonly kind: "context"; readonly text: string }
  | { readonly kind: "hunk"; readonly text: string }

const DetailLine = ({ line }: { readonly line: DetailLine }) => {
  if (line.kind === "section")
    return (
      <Text bold color="cyan">
        ▸ {line.text}
      </Text>
    )
  if (line.kind === "added") return <Text color="green">{line.text}</Text>
  if (line.kind === "removed") return <Text color="red">{line.text}</Text>
  if (line.kind === "hunk") return <Text color="yellow">{line.text}</Text>
  if (line.kind === "context") return <Text color="gray">{line.text}</Text>
  return <Text>{line.text}</Text>
}

const buildDetailLines = (input: {
  readonly iteration: IterationRecord
  readonly candidate: CandidateRecord | undefined
  readonly baselineText: string
  readonly baselinePath: string
}): readonly DetailLine[] => {
  const lines: DetailLine[] = []

  lines.push({ kind: "section", text: "Proposer reasoning" })
  if (input.iteration.proposerReasoning === null || input.iteration.proposerReasoning === "") {
    lines.push({ kind: "context", text: "(no reasoning recorded)" })
  } else {
    for (const r of input.iteration.proposerReasoning.split("\n")) {
      lines.push({ kind: "text", text: r })
    }
  }
  lines.push({ kind: "text", text: "" })

  if (input.iteration.rejection !== null) {
    lines.push({ kind: "section", text: "Rejection" })
    lines.push({ kind: "removed", text: `[${input.iteration.rejection.stage}] ${input.iteration.rejection.reason}` })
    lines.push({ kind: "text", text: "" })
  }

  lines.push({ kind: "section", text: "Per-row scores" })
  if (input.candidate === undefined || input.candidate.scores.length === 0) {
    lines.push({ kind: "context", text: "(not evaluated)" })
  } else {
    const grouped = groupByPhase(input.candidate.scores)
    for (const phase of PHASE_ORDER) {
      const rows = grouped[phase]
      if (rows === undefined || rows.length === 0) continue
      lines.push({ kind: "text", text: `${PHASE_SHORTHAND[phase] ?? phase} (${rows.length})` })
      for (const r of rows) {
        const mark = r.score === 1 ? "✓" : "✗"
        lines.push({
          kind: r.score === 1 ? "added" : "removed",
          text: `  ${mark} ${r.exampleId}`,
        })
      }
    }
  }
  lines.push({ kind: "text", text: "" })

  lines.push({ kind: "section", text: "Diff vs baseline" })
  if (input.candidate === undefined) {
    lines.push({ kind: "context", text: "(no candidate text recorded)" })
  } else if (input.candidate.text === input.baselineText) {
    lines.push({ kind: "context", text: "(identical to baseline)" })
  } else {
    const patch = createPatch(input.baselinePath, input.baselineText, input.candidate.text, "baseline", "candidate")
    for (const ln of patch.split("\n")) {
      if (ln.startsWith("+++") || ln.startsWith("---") || ln.startsWith("Index:")) {
        lines.push({ kind: "context", text: ln })
      } else if (ln.startsWith("@@")) {
        lines.push({ kind: "hunk", text: ln })
      } else if (ln.startsWith("+")) {
        lines.push({ kind: "added", text: ln })
      } else if (ln.startsWith("-")) {
        lines.push({ kind: "removed", text: ln })
      } else {
        lines.push({ kind: "context", text: ln })
      }
    }
  }
  return lines
}

const groupByPhase = <T extends { phase: string }>(items: readonly T[]): Record<string, T[]> => {
  const out: Record<string, T[]> = {}
  for (const it of items) {
    let bucket = out[it.phase]
    if (bucket === undefined) {
      bucket = []
      out[it.phase] = bucket
    }
    bucket.push(it)
  }
  return out
}
