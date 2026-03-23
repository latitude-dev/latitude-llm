import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

export const VercelIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg
    ref={ref}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 222"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <path className="fill-black dark:fill-white" d="m128 0 128 221.705H0z" />
  </svg>
))
VercelIcon.displayName = "VercelIcon"
