import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

export const XaiIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 841.89 595.28" {...props}>
    <g className="fill-black dark:fill-white">
      <path d="m557.09 211.99 8.31 326.37h66.56l8.32-445.18z" />
      <path d="M640.28 56.91H538.72L379.35 284.53l50.78 72.52z" />
      <path d="M201.61 538.36h101.56l50.79-72.52-50.79-72.53z" />
      <path d="M201.61 211.99l228.52 326.37h101.56L303.17 211.99z" />
    </g>
  </svg>
))
XaiIcon.displayName = "XaiIcon"
