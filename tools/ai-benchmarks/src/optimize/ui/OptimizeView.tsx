import { Box, Text } from "ink"
import { useEffect, useState } from "react"
import { formatCostUsd, formatPercent } from "../../ui/format.ts"
import type { IterationRecord } from "../audit-trail.ts"
import type { CostBreakdown } from "../cost-meter.ts"

/**
 * Live ink view for `benchmark:optimize`. Drives off a mutable state
 * object the orchestrator updates as work happens; the component polls
 * the snapshot via a ref-style getter on a 100ms interval. Cheap because
 * the rendered tree is small (header + one activity line + an N-row
 * table), and the polling pattern keeps the orchestrator's state
 * mutations decoupled from React (no setState plumbing).
 *
 * The iteration table is hidden until at least one iteration has been
 * recorded — reduces the up-front empty-table noise on cold starts.
 */

export type Activity =
  | { readonly kind: "starting" }
  | {
      readonly kind: "evaluate"
      readonly hash: string
      readonly rowsDone: number
      readonly phaseCounts: Record<string, number>
    }
  | {
      readonly kind: "proposing"
      readonly phase: "preparing" | "calling" | "received" | "hashing"
      readonly attemptStartedAtMs: number
    }
  | { readonly kind: "measuring"; readonly label: string; readonly rowsDone: number; readonly rowsTotal: number }
  | { readonly kind: "done"; readonly message: string }

export interface RecentEvent {
  readonly atMs: number
  readonly text: string
  readonly tone: "info" | "ok" | "warn" | "err"
}

export interface OptimizeViewState {
  readonly targetId: string
  readonly sample: number | null
  readonly seed: number
  readonly budgetSeconds: number | undefined
  readonly startedAtMs: number
  readonly activity: Activity
  readonly iterations: readonly IterationRecord[]
  readonly cost: CostBreakdown
  readonly proposerCallCount: number
  readonly recentEvents: readonly RecentEvent[]
  readonly proposerModel: string
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const useTick = (intervalMs: number): number => {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}

const formatElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const toHex = (n: number): string => `0x${n.toString(16)}`

export const OptimizeView = ({ getState }: { getState: () => OptimizeViewState }) => {
  const tick = useTick(100)
  const state = getState()
  const elapsed = Math.floor((Date.now() - state.startedAtMs) / 1000)
  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0]

  return (
    <Box flexDirection="column">
      <Header
        targetId={state.targetId}
        sample={state.sample}
        seed={state.seed}
        elapsed={elapsed}
        budgetSeconds={state.budgetSeconds}
        cost={state.cost}
      />
      <ActivityLine activity={state.activity} spinner={spinner ?? "·"} proposerModel={state.proposerModel} />
      {state.recentEvents.length > 0 && <RecentEventsList events={state.recentEvents} />}
      {state.iterations.length > 0 && <IterationTable rows={state.iterations} />}
    </Box>
  )
}

const Header = ({
  sample,
  seed,
  elapsed,
  budgetSeconds,
  cost,
}: {
  readonly targetId: string
  readonly sample: number | null
  readonly seed: number
  readonly elapsed: number
  readonly budgetSeconds: number | undefined
  readonly cost: CostBreakdown
}) => (
  <Box flexDirection="row">
    <Text bold>sample=</Text>
    <Text color="cyan">{sample === null ? "full" : sample}</Text>
    <Text> · seed={toHex(seed)}</Text>
    <Text> · elapsed {formatElapsed(elapsed)}</Text>
    {budgetSeconds !== undefined && <Text>/{formatElapsed(budgetSeconds)}</Text>}
    <Text> · cost </Text>
    <Text color="yellow">{formatCostUsd(cost.totalUsd)}</Text>
  </Box>
)

const ActivityLine = ({
  activity,
  spinner,
  proposerModel,
}: {
  readonly activity: Activity
  readonly spinner: string
  readonly proposerModel: string
}) => {
  if (activity.kind === "starting") {
    return (
      <Box>
        <Text color="gray">{spinner} starting optimization…</Text>
      </Box>
    )
  }
  if (activity.kind === "evaluate") {
    const phases = Object.entries(activity.phaseCounts)
      .map(([p, c]) => `${p}=${c}`)
      .join(" ")
    return (
      <Box>
        <Text color="cyan">{spinner} </Text>
        <Text>evaluating </Text>
        <Text color="magenta">{activity.hash.slice(0, 8)}</Text>
        <Text> · row {activity.rowsDone}</Text>
        {phases.length > 0 && <Text color="gray"> · {phases}</Text>}
      </Box>
    )
  }
  if (activity.kind === "proposing") {
    const elapsed = Math.floor((Date.now() - activity.attemptStartedAtMs) / 1000)
    const phaseColor: "gray" | "yellow" | "cyan" =
      activity.phase === "calling" ? "yellow" : activity.phase === "preparing" ? "gray" : "cyan"
    const phaseLabel =
      activity.phase === "preparing"
        ? "preparing prompt"
        : activity.phase === "calling"
          ? `calling ${proposerModel}`
          : activity.phase === "received"
            ? "received response"
            : "hashing candidate"
    return (
      <Box>
        <Text color="yellow">{spinner} </Text>
        <Text>proposing</Text>
        <Text> · </Text>
        <Text color={phaseColor}>{phaseLabel}</Text>
        <Text color="gray"> · {elapsed}s</Text>
      </Box>
    )
  }
  if (activity.kind === "measuring") {
    return (
      <Box>
        <Text color="green">{spinner} </Text>
        <Text>
          final measurement ({activity.label}) · {activity.rowsDone}/{activity.rowsTotal}
        </Text>
      </Box>
    )
  }
  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>{activity.message}</Text>
    </Box>
  )
}

const IterationTable = ({ rows }: { readonly rows: readonly IterationRecord[] }) => (
  <Box flexDirection="column" marginTop={1}>
    <Box>
      <Text bold>Iter Hash Parent Attempts Changed Result</Text>
    </Box>
    <Box>
      <Text color="gray">{"-".repeat(95)}</Text>
    </Box>
    {rows.map((r) => (
      <IterationRow key={`${r.iteration}-${r.childHash}`} row={r} />
    ))}
  </Box>
)

const IterationRow = ({ row }: { readonly row: IterationRecord }) => {
  const changed =
    row.changedDeclarations.length > 0 ? row.changedDeclarations.join(", ").slice(0, 36) : "(no top-level changes)"
  const result = row.rejection ? `✗ rejected: ${row.rejection.stage}` : "✓ accepted"
  const resultColor: "red" | "green" = row.rejection ? "red" : "green"
  return (
    <Box>
      <Text>{String(row.iteration).padStart(4, " ")} </Text>
      <Text color="magenta">{row.childHash.slice(0, 8)}</Text>
      <Text> </Text>
      <Text color="gray">{row.parentHash.slice(0, 8)}</Text>
      <Text> </Text>
      <Text>{String(row.proposerAttempts).padStart(8, " ")}</Text>
      <Text> </Text>
      <Text>{changed.padEnd(36, " ")}</Text>
      <Text> </Text>
      <Text color={resultColor}>{result}</Text>
    </Box>
  )
}

const RecentEventsList = ({ events }: { readonly events: readonly RecentEvent[] }) => {
  // Show the last 5 with their relative-to-start timestamp. Older events
  // disappear off the top — the user gets a transient log of what just
  // happened without scrollback noise.
  const last = events.slice(-5)
  return (
    <Box flexDirection="column" marginTop={1}>
      {last.map((e) => (
        <Text key={`${e.atMs}-${e.text}`} color={toneColor(e.tone)}>
          {`[${formatLocalTime(e.atMs)}] `}
          {e.tone === "ok" ? "✓ " : e.tone === "err" ? "✗ " : e.tone === "warn" ? "⚠ " : "· "}
          {e.text}
        </Text>
      ))}
    </Box>
  )
}

const toneColor = (tone: RecentEvent["tone"]): "gray" | "green" | "yellow" | "red" => {
  if (tone === "ok") return "green"
  if (tone === "warn") return "yellow"
  if (tone === "err") return "red"
  return "gray"
}

const formatLocalTime = (atMs: number): string => {
  const d = new Date(atMs)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

// Minimal usage of formatPercent to keep import; iteration-row column may
// surface train F1 in a follow-up.
void formatPercent
