import { Box, Text, useApp, useInput } from "ink"
import { useMemo, useState } from "react"
import { classifySlice, falsePositiveRate, type Metrics, type Prediction } from "../runner/metrics.ts"
import { formatCostUsd, formatPercent, truncate } from "./format.ts"
import type { FlipKind, InspectableFlip, InspectableRow, ReportData } from "./types.ts"

const PAGE_SIZE = 25

const PHASE_COLOR: Record<Prediction["phase"], string> = {
  "deterministic-match": "green",
  "deterministic-no-match": "green",
  "llm-match": "cyan",
  "llm-no-match": "cyan",
  "schema-mismatch": "yellow",
  error: "red",
}

const FLIP_LABEL: Record<FlipKind, string> = {
  added: "NEW",
  changed: "CHG",
  removed: "FIX",
}

const FLIP_COLOR: Record<FlipKind, string> = {
  added: "red",
  changed: "yellow",
  removed: "green",
}

interface SummaryProps {
  readonly data: ReportData
  readonly selectedIdx: number
  readonly mode: "failed" | "flipped"
  readonly onToggleMode: () => void
}

function Summary({ data, selectedIdx, mode, onToggleMode: _onToggleMode }: SummaryProps) {
  const visibleRows = mode === "failed" ? data.failedRows : data.flippedRows
  const pageStart = Math.floor(selectedIdx / PAGE_SIZE) * PAGE_SIZE
  const page = visibleRows.slice(pageStart, pageStart + PAGE_SIZE)
  const m = data.metrics

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text>
          <Text bold color="cyan">
            {data.targetId}
          </Text>
          <Text dimColor> {data.sampled ? `(sample=${data.sampleSize})` : "(full)"}</Text>
          <Text dimColor> · {data.totalRows} rows</Text>
        </Text>
        <Box marginTop={1}>
          <Text>
            precision <Text bold>{formatPercent(m.precision)}</Text>
            {"  "}recall <Text bold>{formatPercent(m.recall)}</Text>
            {"  "}f1 <Text bold>{formatPercent(m.f1)}</Text>
            {"  "}accuracy <Text bold>{formatPercent(m.accuracy)}</Text>
          </Text>
        </Box>
        <Text dimColor>
          tp={m.truePositives} fp={m.falsePositives} tn={m.trueNegatives} fn={m.falseNegatives}
        </Text>
        <Text dimColor>
          phases:{" "}
          {Object.entries(data.perPhase)
            .map(([k, v]) => `${k}=${v}`)
            .join("  ")}
        </Text>
        <Text>
          cost <Text bold>{formatCostUsd(data.cost.totalUsd)}</Text>
          <Text dimColor>
            {"  "}({data.cost.usage.successes}/{data.cost.usage.attempts} LLM calls · {data.cost.provider}/
            {data.cost.modelId})
          </Text>
        </Text>
        {data.sampled ? (
          <Text color="yellow">sample mode — baseline comparison disabled</Text>
        ) : data.baseline.present ? (
          <Box flexDirection="column">
            <Text dimColor>
              baseline: <Text color="red">+{data.baseline.addedFailures}</Text>{" "}
              <Text color="yellow">Δ{data.baseline.changedFailures}</Text>{" "}
              <Text color="green">-{data.baseline.removedFailures}</Text> failures
            </Text>
            {data.baseline.fixtureChanged ? (
              <Text color="yellow">
                fixture changed since baseline — inspect mapper diff; some flips may reflect new/removed rows
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text dimColor>baseline: (none yet — pass --update-baseline to create one)</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>per-tactic</Text>
        {Object.entries(data.perTactic).map(([tag, tm]) => (
          <Text key={tag}>
            <Text color="magenta">{tag.padEnd(24)}</Text> {renderSliceMetrics(tm)}
            <Text dimColor> (n={tm.total})</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text>
          <Text bold>{mode === "failed" ? "failed rows" : "baseline flips"}</Text>
          <Text dimColor> ({visibleRows.length})</Text>
          <Text dimColor> [tab switches view · arrows navigate · enter inspects · q quits]</Text>
        </Text>
        {visibleRows.length === 0 ? (
          <Text dimColor>— none —</Text>
        ) : (
          page.map((row, i) => {
            const absoluteIdx = pageStart + i
            const isSelected = absoluteIdx === selectedIdx
            return (
              <Text key={row.prediction.id}>
                {isSelected ? <Text color="cyan">▶ </Text> : <Text>{"  "}</Text>}
                <Text color={colorForRow(row, mode)}>{labelForRow(row, mode).padEnd(4)}</Text>
                <Text dimColor> [{row.prediction.phase.padEnd(22)}]</Text>
                <Text>
                  {"  "}
                  {truncate(row.prediction.id, 58)}
                </Text>
              </Text>
            )
          })
        )}
        {visibleRows.length > PAGE_SIZE && (
          <Text dimColor>
            — page {Math.floor(selectedIdx / PAGE_SIZE) + 1} of {Math.ceil(visibleRows.length / PAGE_SIZE)} —
          </Text>
        )}
      </Box>
    </Box>
  )
}

function isFlip(row: InspectableRow | InspectableFlip): row is InspectableFlip {
  return "kind" in row
}

function labelForRow(row: InspectableRow | InspectableFlip, mode: "failed" | "flipped"): string {
  if (mode === "flipped" && isFlip(row)) return FLIP_LABEL[row.kind]
  return row.prediction.expected ? "FN" : "FP"
}

function colorForRow(row: InspectableRow | InspectableFlip, mode: "failed" | "flipped"): string {
  if (mode === "flipped" && isFlip(row)) return FLIP_COLOR[row.kind]
  return PHASE_COLOR[row.prediction.phase]
}

/**
 * Slice-aware metric rendering. P/R/F1 only make sense when a slice has at
 * least one positive; otherwise we show FPR (false-positive rate) since
 * that's the meaningful quality signal for an all-negative slice.
 */
function renderSliceMetrics(m: Metrics): string {
  const shape = classifySlice(m)
  if (shape === "negatives-only") {
    return `fpr=${formatPercent(falsePositiveRate(m)).padEnd(6)} (${m.falsePositives} FP)`
  }
  if (shape === "positives-only") {
    return `r=${formatPercent(m.recall).padEnd(6)} (${m.falseNegatives} missed)`
  }
  return `p=${formatPercent(m.precision).padEnd(6)} r=${formatPercent(m.recall).padEnd(6)} f1=${formatPercent(m.f1).padEnd(6)}`
}

function Inspector({ row }: { row: InspectableRow | InspectableFlip }) {
  const flip = isFlip(row) ? row : null
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        {row.prediction.id}
      </Text>
      {flip !== null ? (
        <Text>
          flip <Text color={FLIP_COLOR[flip.kind]}>[{FLIP_LABEL[flip.kind]}]</Text>
          {flip.previous !== undefined ? (
            <Text dimColor>
              {"  "}was: predicted={String(flip.previous.predicted)} [{flip.previous.phase}]
            </Text>
          ) : null}
        </Text>
      ) : null}
      <Text>
        expected: <Text bold>{String(row.prediction.expected)}</Text>
        {"  "}predicted: <Text bold>{String(row.prediction.predicted)}</Text>
        {"  "}
        <Text color={PHASE_COLOR[row.prediction.phase]}>[{row.prediction.phase}]</Text>
      </Text>
      <Text dimColor>tags: {row.row.tags.join(", ") || "—"}</Text>
      <Text dimColor>source: {row.row.source}</Text>
      {row.row.notes !== undefined ? <Text dimColor>notes: {row.row.notes}</Text> : null}
      {row.prediction.errorMessage !== undefined ? <Text color="red">error: {row.prediction.errorMessage}</Text> : null}

      <Box marginTop={1} flexDirection="column">
        <Text bold>trace</Text>
        {row.row.trace.systemPrompt !== undefined ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">[system]</Text>
            <Text>{truncate(row.row.trace.systemPrompt, 400)}</Text>
          </Box>
        ) : null}
        {row.row.trace.messages.map((m, i) => {
          const text = m.parts
            .filter((p): p is { type: "text"; content: string } => p.type === "text")
            .map((p) => p.content)
            .join(" ")
          return (
            <Box key={`${i}-${m.role}`} flexDirection="column" marginTop={1}>
              <Text color={m.role === "user" ? "green" : m.role === "assistant" ? "blue" : "gray"}>[{m.role}]</Text>
              <Text>{truncate(text, 600)}</Text>
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[esc / b to go back · q quits]</Text>
      </Box>
    </Box>
  )
}

export function Report({ data }: { data: ReportData }) {
  const { exit } = useApp()
  const [mode, setMode] = useState<"failed" | "flipped">("failed")
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [view, setView] = useState<{ kind: "summary" } | { kind: "inspect"; row: InspectableRow | InspectableFlip }>({
    kind: "summary",
  })

  const activeList = useMemo<readonly (InspectableRow | InspectableFlip)[]>(
    () => (mode === "failed" ? data.failedRows : data.flippedRows),
    [mode, data],
  )

  useInput((input, key) => {
    if (input === "q") {
      exit()
      return
    }
    if (view.kind === "inspect") {
      if (key.escape || input === "b") setView({ kind: "summary" })
      return
    }
    if (key.tab) {
      setMode((m) => (m === "failed" ? "flipped" : "failed"))
      setSelectedIdx(0)
      return
    }
    if (key.upArrow) setSelectedIdx((i) => Math.max(0, i - 1))
    if (key.downArrow) setSelectedIdx((i) => Math.min(Math.max(activeList.length - 1, 0), i + 1))
    if (key.return && activeList.length > 0) {
      const row = activeList[Math.min(selectedIdx, activeList.length - 1)]
      if (row !== undefined) setView({ kind: "inspect", row })
    }
  })

  if (view.kind === "inspect") {
    return <Inspector row={view.row} />
  }
  return (
    <Summary
      data={data}
      selectedIdx={Math.min(selectedIdx, Math.max(activeList.length - 1, 0))}
      mode={mode}
      onToggleMode={() => setMode((m) => (m === "failed" ? "flipped" : "failed"))}
    />
  )
}
