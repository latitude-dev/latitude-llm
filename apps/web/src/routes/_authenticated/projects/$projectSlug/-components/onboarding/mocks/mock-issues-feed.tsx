import { cn, Status, type StatusProps, TagList, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { type ReactNode, useMemo } from "react"

type MockIssueStatus = "new" | "regressed" | "escalating" | "ongoing"

type MockIssue = {
  readonly title: string
  readonly status: MockIssueStatus
  readonly tags: ReadonlyArray<string>
  readonly trend: ReadonlyArray<number>
  readonly occurrences: number
  readonly affectedTracesPercent: number
}

const STATUS_META: Record<MockIssueStatus, { readonly label: string; readonly variant: StatusProps["variant"] }> = {
  new: { label: "New", variant: "info" },
  regressed: { label: "Regressed", variant: "destructive" },
  escalating: { label: "Escalating", variant: "warning" },
  ongoing: { label: "Ongoing", variant: "neutral" },
}

const MOCK_ISSUES_BY_FLAGGER: Record<string, MockIssue> = {
  "empty-response": {
    title: "Blank reply on long PDF uploads",
    status: "new",
    tags: ["rag", "documents"],
    trend: [0, 1, 0, 1, 2, 1, 2, 3, 2, 4, 3, 5],
    occurrences: 12,
    affectedTracesPercent: 0.03,
  },
  "tool-call-errors": {
    title: "Checkout total fails on string amounts",
    status: "regressed",
    tags: ["tool:calculate_total", "types"],
    trend: [2, 1, 2, 1, 3, 2, 1, 2, 4, 6, 9, 14],
    occurrences: 47,
    affectedTracesPercent: 0.09,
  },
  "output-schema-validation": {
    title: "Address extraction drops the postal code",
    status: "ongoing",
    tags: ["extraction", "schema"],
    trend: [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4],
    occurrences: 8,
    affectedTracesPercent: 0.02,
  },
  frustration: {
    title: "User abandons password reset after the agent loops",
    status: "escalating",
    tags: ["support", "auth"],
    trend: [1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 8, 11],
    occurrences: 23,
    affectedTracesPercent: 0.06,
  },
  jailbreaking: {
    title: "Users extract the system prompt via 'repeat the above'",
    status: "escalating",
    tags: ["security", "prompt-injection"],
    trend: [0, 1, 0, 0, 1, 2, 1, 0, 2, 1, 3, 4],
    occurrences: 4,
    affectedTracesPercent: 0.01,
  },
  nsfw: {
    title: "Agent mirrors abusive language back at angry users",
    status: "new",
    tags: ["moderation", "safety"],
    trend: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1],
    occurrences: 2,
    affectedTracesPercent: 0.01,
  },
  refusal: {
    title: "Assistant refuses to write SQL, calling it a security risk",
    status: "new",
    tags: ["coding-agent", "over-refusal"],
    trend: [1, 0, 2, 1, 1, 2, 1, 3, 2, 1, 2, 3],
    occurrences: 6,
    affectedTracesPercent: 0.02,
  },
  laziness: {
    title: "Coding agent leaves TODO stubs instead of code",
    status: "ongoing",
    tags: ["coding-agent", "incomplete"],
    trend: [2, 3, 2, 4, 3, 3, 2, 4, 3, 2, 3, 4],
    occurrences: 11,
    affectedTracesPercent: 0.03,
  },
  forgetting: {
    title: "Agent re-asks for the order number already given",
    status: "ongoing",
    tags: ["context", "long-session"],
    trend: [4, 3, 4, 2, 3, 2, 3, 1, 2, 2, 1, 2],
    occurrences: 9,
    affectedTracesPercent: 0.02,
  },
  trashing: {
    title: "Agent retries a failing tool with identical arguments",
    status: "regressed",
    tags: ["tool-loop", "retries"],
    trend: [1, 0, 1, 2, 1, 3, 2, 4, 3, 5, 7, 8],
    occurrences: 3,
    affectedTracesPercent: 0.01,
  },
}

const STAGGER_STEP_MS = 30
const STAGGER_MAX_MS = 180

type AvailableFlagger = {
  readonly slug: string
  readonly name: string
}

function formatPercent(value: number): string {
  const pct = value * 100
  if (pct > 0 && pct < 1) return "<1%"
  return `${Math.round(pct)}%`
}

function MiniTrendBar({ trend, regressed }: { readonly trend: ReadonlyArray<number>; readonly regressed: boolean }) {
  const max = Math.max(1, ...trend)
  return (
    <div className="flex h-7 w-20 items-end gap-[2px]" aria-hidden>
      {trend.map((count, i) => {
        const heightPercent = count === 0 ? 0 : Math.max(12, (count / max) * 88)
        return (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-t-[2px]",
              regressed ? "bg-rose-500/70 dark:bg-rose-400/70" : "bg-muted-foreground/45",
            )}
            style={{ height: `${heightPercent}%` }}
          />
        )
      })}
    </div>
  )
}

function IssueCard({ issue }: { readonly issue: MockIssue }) {
  const isRegressed = issue.status === "regressed"
  const status = STATUS_META[issue.status]
  return (
    <div
      className={cn(
        "rounded-lg border p-3 shadow-sm",
        isRegressed ? "border-rose-500/30 bg-rose-500/[0.06] dark:bg-rose-500/[0.12]" : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Status variant={status.variant} label={status.label} />
          <Text.H5M ellipsis noWrap className="min-w-0">
            {issue.title}
          </Text.H5M>
        </div>
        <Text.H5 weight="medium" className="shrink-0 tabular-nums">
          {formatCount(issue.occurrences)}
        </Text.H5>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TagList tags={issue.tags} />
        </div>
        <div className="flex shrink-0 items-end gap-3">
          <MiniTrendBar trend={issue.trend} regressed={isRegressed} />
          <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
            {formatPercent(issue.affectedTracesPercent)} traces
          </Text.H6>
        </div>
      </div>
    </div>
  )
}

function CollapsibleRow({
  open,
  delayMs,
  children,
}: {
  readonly open: boolean
  readonly delayMs: number
  readonly children: ReactNode
}) {
  return (
    <div
      aria-hidden={!open}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-2">{children}</div>
      </div>
    </div>
  )
}

export function MockIssuesFeed({
  enabledFlaggerSlugs,
  availableFlaggers,
}: {
  readonly enabledFlaggerSlugs: ReadonlySet<string>
  readonly availableFlaggers: ReadonlyArray<AvailableFlagger>
}) {
  // Stable, fixed render order — every available flagger we have a mock issue for is always
  // mounted. Rows collapse/expand in place via grid-rows, so the list never remounts and
  // never reorders; toggling only flips a row's open state.
  const mockRows = useMemo(
    () => availableFlaggers.filter((f) => MOCK_ISSUES_BY_FLAGGER[f.slug] !== undefined),
    [availableFlaggers],
  )

  const openCount = mockRows.filter((f) => enabledFlaggerSlugs.has(f.slug)).length

  return (
    <div className="flex h-fit w-full max-w-[591px] flex-col gap-4 self-center">
      <div className="flex flex-col gap-1">
        <Text.H5M>Issues you'd see in your project</Text.H5M>
        <Text.H6 color="foregroundMuted">
          {openCount > 0
            ? `${openCount} example ${openCount === 1 ? "issue" : "issues"} from your selected flaggers`
            : "Example issues that the selected flaggers would create"}
        </Text.H6>
      </div>

      <div className="flex w-full flex-col">
        {mockRows.map((flagger, index) => {
          const issue = MOCK_ISSUES_BY_FLAGGER[flagger.slug]
          if (!issue) return null
          // Static per-position delay: a preset (bulk toggle) cascades top-to-bottom, while a
          // single toggle keeps a barely-perceptible delay — no need to track prior open state.
          return (
            <CollapsibleRow
              key={flagger.slug}
              open={enabledFlaggerSlugs.has(flagger.slug)}
              delayMs={Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}
            >
              <IssueCard issue={issue} />
            </CollapsibleRow>
          )
        })}

        <CollapsibleRow open={openCount === 0} delayMs={0}>
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
            <Text.H6 color="foregroundMuted" align="center">
              Pick a flagger to see what kinds of issues it would surface.
            </Text.H6>
          </div>
        </CollapsibleRow>
      </div>
    </div>
  )
}
