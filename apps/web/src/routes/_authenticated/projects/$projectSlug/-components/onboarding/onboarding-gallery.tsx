import { Button, cn, Text, useMountEffect } from "@repo/ui"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRef, useState } from "react"
import { GALLERY_DWELL_MS, usePrefersReducedMotion } from "./motion.ts"

const INTRO_GALLERY: ReadonlyArray<{ readonly title: string; readonly description: string; readonly image: string }> = [
  {
    title: "See every request your AI makes",
    description: "Each call captured with full context — inputs, outputs, timing, and cost.",
    image: "/onboarding/traces.png",
  },
  {
    title: "Your whole project at a glance",
    description: "Volume, latency, spend, and health across every agent and feature.",
    image: "/onboarding/home.png",
  },
  {
    title: "Catch problems before your users do",
    description: "Latitude flags refusals, errors, and hallucinations — and groups them into issues.",
    image: "/onboarding/issues.png",
  },
]

/**
 * Intro hero shared by the `role` and `stack` steps. Self-manages its active image with a
 * crossfade, indicator dots, and auto-advance that pauses while the pointer is over the
 * pane and is disabled entirely under reduced-motion (manual navigation still works).
 */
export function OnboardingGallery() {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = INTRO_GALLERY.length

  // Latest-value refs so the mount-only interval reads current pause/motion state without
  // re-subscribing. Each tick advances unless the pointer is over the pane or motion is reduced.
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

  useMountEffect(() => {
    if (count <= 1) return
    const interval = window.setInterval(() => {
      if (pausedRef.current || reducedMotionRef.current) return
      setIndex((i) => (i + 1) % count)
    }, GALLERY_DWELL_MS)
    return () => window.clearInterval(interval)
  })

  const goPrev = () => setIndex((i) => (i === 0 ? count - 1 : i - 1))
  const goNext = () => setIndex((i) => (i + 1) % count)
  const active = INTRO_GALLERY[index] ?? INTRO_GALLERY[0]

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only pauses decorative auto-advance; controls remain keyboard-operable
    <div
      className="flex h-fit w-full flex-col items-start"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex w-full max-w-[591px] flex-col gap-6">
        <div key={index} className="flex flex-col gap-1 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
          <Text.H5M>{active?.title}</Text.H5M>
          <Text.H6 color="foregroundMuted">{active?.description}</Text.H6>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goNext} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            {INTRO_GALLERY.map((item, i) => (
              <button
                key={item.image}
                type="button"
                aria-label={`Show "${item.title}"`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-all duration-300 ease-out motion-reduce:transition-none",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40",
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="relative mt-10 aspect-[1024/579] w-full overflow-hidden rounded-xl border-4 border-border bg-card shadow-xl">
        {INTRO_GALLERY.map((item, i) => (
          <img
            key={item.image}
            src={item.image}
            alt={item.title}
            width={1024}
            height={579}
            decoding="async"
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
    </div>
  )
}
