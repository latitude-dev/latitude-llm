import { cn, Text } from "@repo/ui"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { MOTION_EXIT_MS, usePrefersReducedMotion } from "../motion.ts"

type VariantId = "incident" | "report" | "resolved"

const NOTIFICATION_VARIANTS: ReadonlyArray<{
  readonly id: VariantId
  readonly emoji: string
  readonly title: string
  readonly body: string
  readonly age: string
}> = [
  {
    id: "incident",
    emoji: "🚨",
    title: "Incident: PII leak detected",
    body: "Trace 8f3a · production-agent",
    age: "just now",
  },
  {
    id: "report",
    emoji: "📊",
    title: "Weekly summary ready",
    body: "1,243 traces · 8 issues flagged this week",
    age: "1 min ago",
  },
  {
    id: "resolved",
    emoji: "✅",
    title: "Issue resolved",
    body: `#142 "Empty response" · fixed in deploy 7c2b`,
    age: "3 min ago",
  },
]

const NOTIFICATION_VARIANTS_BY_ID = Object.fromEntries(NOTIFICATION_VARIANTS.map((v) => [v.id, v])) as Record<
  VariantId,
  (typeof NOTIFICATION_VARIANTS)[number]
>

const TICK_MS = 2500
const MAX_VISIBLE = 3

type RenderedCard = {
  readonly id: number
  readonly variant: VariantId
  readonly leaving: boolean
  readonly seeded: boolean
}

// Seed the stack so the pane is populated the instant the user arrives, newest (incident,
// "just now") on top. Negative ids keep them clear of the live tick counter (which starts at 0).
const SEED_CARDS: ReadonlyArray<RenderedCard> = [
  { id: -1, variant: "incident", leaving: false, seeded: true },
  { id: -2, variant: "report", leaving: false, seeded: true },
  { id: -3, variant: "resolved", leaving: false, seeded: true },
]

function QueueCard({ card, children }: { readonly card: RenderedCard; readonly children: ReactNode }) {
  // Seeded cards render already-open (no entry animation); ticked cards start collapsed and
  // expand on the next frame so the height transition plays.
  const [open, setOpen] = useState(card.seeded)
  useEffect(() => {
    if (open) return
    const raf = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  const expanded = open && !card.leaving
  return (
    <div
      aria-hidden={!expanded}
      className={cn(
        "grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none",
        card.leaving ? "duration-200" : "duration-300",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-2">{children}</div>
      </div>
    </div>
  )
}

export function MockSlackQueue({ isActive }: { readonly isActive: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const [cards, setCards] = useState<ReadonlyArray<RenderedCard>>(SEED_CARDS)
  const counterRef = useRef(0)
  const variantIndexRef = useRef(0)

  // Tick only while the Slack step is visible (and motion is allowed), so the queue never
  // builds a backlog off-screen and stays still under reduced-motion.
  useEffect(() => {
    if (!isActive || reducedMotion) return
    const interval = window.setInterval(() => {
      const id = counterRef.current++
      const variant = NOTIFICATION_VARIANTS[variantIndexRef.current++ % NOTIFICATION_VARIANTS.length]
      if (!variant) return
      setCards((prev) => {
        const next: RenderedCard[] = [{ id, variant: variant.id, leaving: false, seeded: false }, ...prev]
        const visibleCount = next.reduce((acc, c) => acc + (c.leaving ? 0 : 1), 0)
        if (visibleCount > MAX_VISIBLE) {
          // Mark the oldest still-visible card (last non-leaving) to slide out.
          for (let i = next.length - 1; i >= 0; i--) {
            const card = next[i]
            if (card && !card.leaving) {
              next[i] = { ...card, leaving: true }
              break
            }
          }
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(interval)
  }, [isActive, reducedMotion])

  // Drop leaving cards once their collapse animation has played. Watching `cards` keeps this
  // decoupled from the tick, so the cap can never silently fail.
  useEffect(() => {
    if (!cards.some((c) => c.leaving)) return
    const timer = window.setTimeout(() => {
      setCards((prev) => prev.filter((c) => !c.leaving))
    }, MOTION_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [cards])

  return (
    <div className="flex h-fit w-full max-w-[440px] flex-col gap-4 self-center">
      <div className="flex flex-col gap-1">
        <Text.H5M>Notifications you'd see in Slack</Text.H5M>
        <Text.H6 color="foregroundMuted">
          A sample of incidents, reports, and resolutions Latitude can route to your workspace
        </Text.H6>
      </div>

      <div className="flex max-h-[280px] w-full flex-col overflow-hidden">
        {cards.map((card) => {
          const v = NOTIFICATION_VARIANTS_BY_ID[card.variant]
          return (
            <QueueCard key={card.id} card={card}>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
                  <span aria-hidden>{v.emoji}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-row items-baseline justify-between gap-2">
                    <Text.H5M>{v.title}</Text.H5M>
                    <Text.H6 color="foregroundMuted" className="shrink-0">
                      {v.age}
                    </Text.H6>
                  </div>
                  <Text.H6 color="foregroundMuted" className="truncate">
                    {v.body}
                  </Text.H6>
                </div>
              </div>
            </QueueCard>
          )
        })}
      </div>
    </div>
  )
}
