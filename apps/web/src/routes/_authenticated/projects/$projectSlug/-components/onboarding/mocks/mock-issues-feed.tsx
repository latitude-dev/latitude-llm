import { cn, Text } from "@repo/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { MOTION_EXIT_MS } from "../motion.ts"

type MockIssue = {
  readonly title: string
  readonly caption: string
  readonly severity: "low" | "medium" | "high"
  readonly occurrences: number
  readonly hoursAgo: number
}

const MOCK_ISSUES_BY_FLAGGER: Record<string, MockIssue> = {
  "empty-response": {
    title: "Empty response on tool call",
    caption: "search_kb returned no result for 3 traces",
    severity: "medium",
    occurrences: 12,
    hoursAgo: 3,
  },
  "tool-call-errors": {
    title: "Tool call failure",
    caption: "fetch_user returned an undefined argument",
    severity: "high",
    occurrences: 47,
    hoursAgo: 1,
  },
  "output-schema-validation": {
    title: "Output schema mismatch",
    caption: "Missing required `confidence` field in response",
    severity: "medium",
    occurrences: 8,
    hoursAgo: 5,
  },
  frustration: {
    title: "User frustration detected",
    caption: "Repeat phrasing and emoji markers across 7 sessions",
    severity: "medium",
    occurrences: 23,
    hoursAgo: 2,
  },
  jailbreaking: {
    title: "Jailbreak attempt",
    caption: "Prompt injection via spoofed system role",
    severity: "high",
    occurrences: 4,
    hoursAgo: 8,
  },
  nsfw: {
    title: "NSFW content in user prompt",
    caption: "Filtered by moderation before model call",
    severity: "low",
    occurrences: 2,
    hoursAgo: 12,
  },
  refusal: {
    title: "Refusal on policy-compliant query",
    caption: "Asked for billing summary, returned safety boilerplate",
    severity: "medium",
    occurrences: 6,
    hoursAgo: 4,
  },
  laziness: {
    title: "Lazy completion",
    caption: "Agent skipped 3 of 5 sub-tasks in the plan",
    severity: "medium",
    occurrences: 11,
    hoursAgo: 6,
  },
  forgetting: {
    title: "Forgot earlier context",
    caption: "Lost the user's product preference after 8 turns",
    severity: "low",
    occurrences: 9,
    hoursAgo: 10,
  },
  trashing: {
    title: "Destructive edit",
    caption: "Agent overwrote a saved file without confirmation",
    severity: "high",
    occurrences: 3,
    hoursAgo: 7,
  },
}

const SEVERITY_DOT: Record<MockIssue["severity"], string> = {
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/50",
}

type AvailableFlagger = {
  readonly slug: string
  readonly name: string
}

/**
 * Tracks a list of keys and keeps recently-removed keys in the render output for `exitMs`
 * so they can play an exit animation before being dropped. Re-adding a key while it's in
 * its exit phase cancels the exit instead of mounting a fresh copy.
 */
function useAnimatedKeys(currentKeys: ReadonlyArray<string>, exitMs: number) {
  const [items, setItems] = useState<ReadonlyArray<{ key: string; leaving: boolean }>>(() =>
    currentKeys.map((k) => ({ key: k, leaving: false })),
  )
  const stableKey = useMemo(() => currentKeys.slice().sort().join("|"), [currentKeys])
  const currentRef = useRef(currentKeys)
  currentRef.current = currentKeys
  const prevRef = useRef<ReadonlyArray<string>>(currentKeys)

  useEffect(() => {
    const prev = prevRef.current
    const next = currentRef.current
    const prevSet = new Set(prev)
    const nextSet = new Set(next)

    const added = next.filter((k) => !prevSet.has(k))
    const removed = prev.filter((k) => !nextSet.has(k))

    prevRef.current = next

    if (added.length === 0 && removed.length === 0) return

    setItems((existing) => {
      const updated = existing.map((it) => {
        if (removed.includes(it.key)) return { ...it, leaving: true }
        if (added.includes(it.key) && it.leaving) return { ...it, leaving: false }
        return it
      })
      const seen = new Set(updated.map((it) => it.key))
      const merged = [...updated]
      for (const key of added) {
        if (!seen.has(key)) merged.push({ key, leaving: false })
      }
      return merged
    })

    if (removed.length > 0) {
      window.setTimeout(() => {
        setItems((existing) => existing.filter((it) => !removed.includes(it.key) || !it.leaving))
      }, exitMs)
    }
  }, [stableKey, exitMs])

  return items
}

export function MockIssuesFeed({
  enabledFlaggerSlugs,
  availableFlaggers,
}: {
  readonly enabledFlaggerSlugs: ReadonlySet<string>
  readonly availableFlaggers: ReadonlyArray<AvailableFlagger>
}) {
  // Stable order: render only slugs we have mock data for, in the available-flaggers order.
  const orderedActiveSlugs = useMemo(() => {
    return availableFlaggers
      .filter((f) => enabledFlaggerSlugs.has(f.slug) && MOCK_ISSUES_BY_FLAGGER[f.slug] !== undefined)
      .map((f) => f.slug)
  }, [availableFlaggers, enabledFlaggerSlugs])

  const items = useAnimatedKeys(orderedActiveSlugs, MOTION_EXIT_MS)
  const hasActiveItems = orderedActiveSlugs.length > 0

  return (
    <div className="flex h-fit w-full max-w-[591px] flex-col gap-4 self-center">
      <div className="flex flex-col gap-1">
        <Text.H5M>Issues you'd see in your project</Text.H5M>
        <Text.H6 color="foregroundMuted">Example issues that the selected flaggers would create</Text.H6>
      </div>

      <div className="flex w-full flex-col gap-2">
        {hasActiveItems
          ? items.map(({ key, leaving }) => {
              const issue = MOCK_ISSUES_BY_FLAGGER[key]
              if (!issue) return null
              return (
                <div
                  key={key}
                  data-leaving={leaving}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-300 data-[leaving=true]:animate-out data-[leaving=true]:fade-out-0 data-[leaving=true]:slide-out-to-top-1 data-[leaving=true]:duration-200"
                >
                  <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[issue.severity])} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Text.H5M>{issue.title}</Text.H5M>
                    <Text.H6 color="foregroundMuted" className="truncate">
                      {issue.caption}
                    </Text.H6>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Text.H5 weight="medium">{issue.occurrences}</Text.H5>
                    <Text.H6 color="foregroundMuted">{issue.hoursAgo}h</Text.H6>
                  </div>
                </div>
              )
            })
          : null}

        {!hasActiveItems ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
            <Text.H6 color="foregroundMuted" align="center">
              Pick a flagger to see what kinds of issues it would surface.
            </Text.H6>
          </div>
        ) : null}
      </div>
    </div>
  )
}
