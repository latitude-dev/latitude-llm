import { Text } from "@repo/ui"
import { useEffect, useRef, useState } from "react"
import { MOTION_EXIT_MS } from "../motion.ts"

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
}

export function MockSlackQueue() {
  const [cards, setCards] = useState<ReadonlyArray<RenderedCard>>([])
  const counterRef = useRef(0)
  const variantIndexRef = useRef(0)

  useEffect(() => {
    const tick = () => {
      const id = counterRef.current++
      const variant = NOTIFICATION_VARIANTS[variantIndexRef.current % NOTIFICATION_VARIANTS.length] as
        | (typeof NOTIFICATION_VARIANTS)[number]
        | undefined
      if (!variant) return
      variantIndexRef.current++

      let markedForExit = false
      setCards((prev) => {
        const next: RenderedCard[] = [...prev, { id, variant: variant.id, leaving: false }]
        if (next.length > MAX_VISIBLE) {
          const idx = next.findIndex((c) => !c.leaving)
          if (idx !== -1) {
            const target = next[idx]
            if (target) {
              next[idx] = { ...target, leaving: true }
              markedForExit = true
            }
          }
        }
        return next
      })

      if (markedForExit) {
        window.setTimeout(() => {
          setCards((prev) => prev.filter((c) => !c.leaving))
        }, MOTION_EXIT_MS)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, TICK_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <div className="flex h-fit w-full max-w-[440px] flex-col gap-4 self-center">
      <div className="flex flex-col gap-1">
        <Text.H5M>Notifications you'd see in Slack</Text.H5M>
        <Text.H6 color="foregroundMuted">
          A sample of incidents, reports, and resolutions Latitude can route to your workspace
        </Text.H6>
      </div>

      <div className="flex w-full flex-col gap-2">
        {cards.map(({ id, variant, leaving }) => {
          const v = NOTIFICATION_VARIANTS_BY_ID[variant]
          return (
            <div
              key={id}
              data-leaving={leaving}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm animate-in fade-in-0 slide-in-from-bottom-3 duration-300 data-[leaving=true]:animate-out data-[leaving=true]:fade-out-0 data-[leaving=true]:slide-out-to-top-3 data-[leaving=true]:duration-200"
            >
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
          )
        })}
      </div>
    </div>
  )
}
