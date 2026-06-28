import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

export const ElevenlabsIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg
    ref={ref}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <path className="fill-black dark:fill-white" d="M5 0h5v24H5V0zM14 0h5v24h-5V0z" />
  </svg>
))
ElevenlabsIcon.displayName = "ElevenlabsIcon"
