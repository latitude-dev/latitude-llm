import type { ReactNode } from "react"

/**
 * Horizontal track of full-width slides. Renders all slides at once;
 * `translateX` shifts the track so only the active slide is in view.
 * Honors `prefers-reduced-motion` (snap instead of slide).
 */
export function CarouselTrack({
  activeIndex,
  children,
}: {
  readonly activeIndex: number
  readonly children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex h-full flex-row transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {children}
      </div>
    </div>
  )
}

export function CarouselSlide({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-0 w-full shrink-0 flex-col justify-center overflow-y-auto p-24 [scrollbar-gutter:stable]">
      {children}
    </div>
  )
}
