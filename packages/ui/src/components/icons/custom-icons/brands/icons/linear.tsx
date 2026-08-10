import type { LucideProps } from "lucide-react"
import type { Ref } from "react"

/**
 * Linear brand mark. Accepts `LucideProps` so it's compatible with the
 * shared `<Icon icon={LinearIcon} />` wrapper.
 */
export function LinearIcon({ ref, ...props }: LucideProps & { ref?: Ref<SVGSVGElement> | undefined }) {
  return (
    <svg ref={ref} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <title>Linear</title>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M5.8 14.6L14.6 5.8" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M8.8 17.2L17.2 8.8" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M5.6 10.8L10.8 5.6" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M13.2 18.4L18.4 13.2" stroke="white" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}
