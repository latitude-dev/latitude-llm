import { cn, Text } from "@repo/ui"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { usePrefersReducedMotion } from "../motion.ts"

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
  readonly variant: VariantId
  readonly seeded: boolean
}

// Seed a full depth stack so the pane is populated the instant the user arrives, newest on top.
const SEED_CARDS: ReadonlyArray<RenderedCard> = Array.from({ length: STACK_SIZE }, (_, i) => {
  const variant = NOTIFICATION_VARIANTS[i % NOTIFICATION_VARIANTS.length]
  return { id: -1 - i, variant: (variant?.id ?? "incident") as VariantId, seeded: true }
})

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
  useEffect(() => {
    if (entered) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [entered])

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

  // Tick only while the Slack step is visible (and motion is allowed), so the queue never
  // builds a backlog off-screen and stays still under reduced-motion.
  useEffect(() => {
    if (!isActive || reducedMotion) return
    const interval = window.setInterval(() => {
      const id = counterRef.current++
      const variant = NOTIFICATION_VARIANTS[variantIndexRef.current++ % NOTIFICATION_VARIANTS.length]
      if (!variant) return
      setCards((prev) => [{ id, variant: variant.id, seeded: false }, ...prev])
    }, TICK_MS)
    return () => window.clearInterval(interval)
  }, [isActive, reducedMotion])

  // Once a new card has pushed the oldest into the transient slot (faded to 0 and collapsed),
  // drop it. Watching `cards` keeps removal decoupled from the tick.
  useEffect(() => {
    if (cards.length <= STACK_SIZE) return
    const timer = window.setTimeout(() => {
      setCards((prev) => prev.slice(0, STACK_SIZE))
    }, ENTRY_MS)
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

      <div className="flex w-full flex-col">
        {cards.map((card, index) => {
          const v = NOTIFICATION_VARIANTS_BY_ID[card.variant]
          return (
            <QueueCard key={card.id} card={card} index={index}>
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
