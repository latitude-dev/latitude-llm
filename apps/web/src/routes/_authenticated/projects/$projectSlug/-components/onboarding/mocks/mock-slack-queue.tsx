import { cn, Text, useMountEffect } from "@repo/ui"
import { type ReactNode, useRef, useState } from "react"
import { usePrefersReducedMotion } from "../motion.ts"

type IncidentKind = "new" | "escalating" | "regressed" | "resolved"
type Severity = "low" | "medium" | "high"

type IncidentNotification = {
  readonly id: string
  readonly kind: IncidentKind
  readonly severity: Severity
  readonly issueName: string
  readonly detail: string
  readonly trend?: ReadonlyArray<number>
}

const KIND_LABEL: Record<IncidentKind, string> = {
  new: "New issue",
  escalating: "Issue escalating",
  regressed: "Issue regressed",
  resolved: "Resolved",
}

const KIND_EMOJI: Record<IncidentKind, string> = {
  new: "🆕",
  escalating: "📈",
  regressed: "🔴",
  resolved: "✅",
}

const KIND_TEXT_CLASS: Record<IncidentKind, string> = {
  new: "text-blue-600 dark:text-blue-400",
  escalating: "text-amber-600 dark:text-amber-400",
  regressed: "text-rose-600 dark:text-rose-400",
  resolved: "text-green-600 dark:text-green-400",
}

const KIND_SPARK_CLASS: Record<IncidentKind, string> = {
  new: "bg-blue-500/60 dark:bg-blue-400/60",
  escalating: "bg-amber-500/70 dark:bg-amber-400/70",
  regressed: "bg-rose-500/70 dark:bg-rose-400/70",
  resolved: "bg-green-500/60 dark:bg-green-400/60",
}

// Severity bar colors mirror COLORS in
// packages/domain/integrations/src/templates/notifications/blocks.ts — resolved is always green.
const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#F2C94C",
  medium: "#F2994A",
  high: "#E8534B",
}
const RESOLVED_COLOR = "#27AE60"

function accentColor(notification: IncidentNotification): string {
  return notification.kind === "resolved" ? RESOLVED_COLOR : SEVERITY_COLOR[notification.severity]
}

// Reuses the flaggers-feed scenarios so the alerts read as "those issues → these notifications".
// Trends mirror the real incident chart: rising for escalating, baseline→spike for regressed,
// spike→recovered for resolved. New issues have no history yet, so no chart.
const NOTIFICATION_VARIANTS: ReadonlyArray<IncidentNotification> = [
  {
    id: "checkout-regressed",
    kind: "regressed",
    severity: "high",
    issueName: "Checkout total fails on string amounts",
    detail: "Reopened after deploy 7c2b",
    trend: [2, 1, 1, 1, 1, 2, 5, 8],
  },
  {
    id: "pdf-new",
    kind: "new",
    severity: "medium",
    issueName: "Blank reply on long PDF uploads",
    detail: "12 occurrences · production",
  },
  {
    id: "password-escalating",
    kind: "escalating",
    severity: "high",
    issueName: "User abandons password reset after the agent loops",
    detail: "Climbed to 18/hr · 3× baseline",
    trend: [1, 1, 2, 2, 3, 4, 6, 9],
  },
  {
    id: "injection-new",
    kind: "new",
    severity: "low",
    issueName: "Prompt injection via 'repeat the above'",
    detail: "4 occurrences this hour",
  },
  {
    id: "retry-regressed",
    kind: "regressed",
    severity: "medium",
    issueName: "Agent retries a failing tool with identical args",
    detail: "Reopened · was resolved 2d ago",
    trend: [1, 2, 1, 1, 1, 2, 4, 7],
  },
  {
    id: "abuse-resolved",
    kind: "resolved",
    severity: "medium",
    issueName: "Abusive language mirrored back at users",
    detail: "Recovered · elevated for 42 min",
    trend: [5, 7, 8, 6, 4, 2, 1, 0],
  },
]

const NOTIFICATION_VARIANTS_BY_ID = Object.fromEntries(NOTIFICATION_VARIANTS.map((v) => [v.id, v])) as Record<
  string,
  IncidentNotification
>

const AGES_BY_INDEX = ["just now", "2m ago", "7m ago", "15m ago", "32m ago", "1h ago"]

const TICK_MS = 2500
const ENTRY_MS = 300
// Cards kept in the steady stack: the top 3 are fully visible, the next 2 fade into depth.
const STACK_SIZE = 5

// Depth styling by stack position. Index STACK_SIZE is the transient slot a card passes
// through on its way out — already at opacity 0, so dropping it from the DOM is invisible.
const DEPTH_OPACITY = [1, 1, 1, 0.55, 0.22, 0]
const DEPTH_SCALE = [1, 0.985, 0.97, 0.955, 0.94, 0.925]
const LAST_DEPTH_INDEX = DEPTH_OPACITY.length - 1

function depthFor(index: number): { opacity: number; scale: number } {
  const i = Math.min(index, LAST_DEPTH_INDEX)
  return { opacity: DEPTH_OPACITY[i] ?? 0, scale: DEPTH_SCALE[i] ?? 0.9 }
}

type RenderedCard = {
  readonly id: number
  readonly variant: string
  readonly seeded: boolean
}

// Seed a full depth stack so the pane is populated the instant the user arrives, newest on top.
const SEED_CARDS: ReadonlyArray<RenderedCard> = Array.from({ length: STACK_SIZE }, (_, i) => {
  const variant = NOTIFICATION_VARIANTS[i % NOTIFICATION_VARIANTS.length]
  return { id: -1 - i, variant: variant?.id ?? "pdf-new", seeded: true }
})

function MiniSparkline({ trend, barClass }: { readonly trend: ReadonlyArray<number>; readonly barClass: string }) {
  const max = Math.max(1, ...trend)
  return (
    <div className="flex h-6 w-16 shrink-0 items-end gap-[2px]" aria-hidden>
      {trend.map((count, i) => {
        const heightPercent = count === 0 ? 0 : Math.max(14, (count / max) * 92)
        return (
          <span
            key={i}
            className={cn("min-w-0 flex-1 rounded-t-[2px]", barClass)}
            style={{ height: `${heightPercent}%` }}
          />
        )
      })}
    </div>
  )
}

function QueueCard({
  card,
  index,
  children,
}: {
  readonly card: RenderedCard
  readonly index: number
  readonly children: ReactNode
}) {
  // Seeded cards render in place; freshly-added cards start collapsed and expand next frame.
  const [entered, setEntered] = useState(card.seeded)
  useMountEffect(() => {
    if (card.seeded) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  })

  // Past the stack: collapse height while already faded to 0 — an invisible exit, no snap
  // (the entering card grows by the same amount this one shrinks).
  const evicting = index >= STACK_SIZE
  const heightOpen = entered && !evicting
  const { opacity, scale } = depthFor(index)

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
        heightOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className="origin-top pb-2 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none"
          style={{ opacity: entered ? opacity : 0, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function MockSlackQueue({ isActive }: { readonly isActive: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const [cards, setCards] = useState<ReadonlyArray<RenderedCard>>(SEED_CARDS)
  const counterRef = useRef(0)
  const variantIndexRef = useRef(0)

  // Latest-value refs so the mount-only interval reads current visibility/motion state without
  // re-subscribing. Skipping ticks while inactive keeps the queue from building a backlog
  // off-screen (all carousel slides stay mounted) and holds it still under reduced-motion.
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

  useMountEffect(() => {
    const evictionTimers = new Set<number>()
    const interval = window.setInterval(() => {
      if (!isActiveRef.current || reducedMotionRef.current) return
      const id = counterRef.current++
      const variant = NOTIFICATION_VARIANTS[variantIndexRef.current++ % NOTIFICATION_VARIANTS.length]
      if (!variant) return
      setCards((prev) => [{ id, variant: variant.id, seeded: false }, ...prev])
      // The new card pushes the oldest into the transient slot; drop it once it has faded to 0
      // and collapsed out of sight.
      const evict = window.setTimeout(() => {
        evictionTimers.delete(evict)
        setCards((prev) => (prev.length > STACK_SIZE ? prev.slice(0, STACK_SIZE) : prev))
      }, ENTRY_MS)
      evictionTimers.add(evict)
    }, TICK_MS)
    return () => {
      window.clearInterval(interval)
      for (const timer of evictionTimers) window.clearTimeout(timer)
    }
  })

  return (
    <div className="flex h-fit w-full max-w-[440px] flex-col gap-4 self-center">
      <div className="flex flex-col gap-1">
        <Text.H5M>Notifications you'd see in Slack</Text.H5M>
        <Text.H6 color="foregroundMuted">
          New, escalating, and regressed issues, routed to your workspace the moment they're flagged
        </Text.H6>
      </div>

      <div className="flex w-full flex-col">
        {cards.map((card, index) => {
          const v = NOTIFICATION_VARIANTS_BY_ID[card.variant]
          if (!v) return null
          const age = AGES_BY_INDEX[Math.min(index, AGES_BY_INDEX.length - 1)]
          return (
            <QueueCard key={card.id} card={card} index={index}>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg"
                  style={{ backgroundColor: `${accentColor(v)}1F` }}
                >
                  <span aria-hidden>{KIND_EMOJI[v.kind]}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-row items-baseline justify-between gap-2">
                    <span className={cn("shrink-0 text-xs font-medium", KIND_TEXT_CLASS[v.kind])}>
                      {KIND_LABEL[v.kind]}
                    </span>
                    <Text.H6 color="foregroundMuted" className="shrink-0">
                      {age}
                    </Text.H6>
                  </div>
                  <Text.H5M ellipsis noWrap className="min-w-0">
                    {v.issueName}
                  </Text.H5M>
                  <div className="flex flex-row items-end justify-between gap-2">
                    <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
                      {v.detail}
                    </Text.H6>
                    {v.trend ? <MiniSparkline trend={v.trend} barClass={KIND_SPARK_CLASS[v.kind]} /> : null}
                  </div>
                </div>
              </div>
            </QueueCard>
          )
        })}
      </div>
    </div>
  )
}
