import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

export const ReplicateIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg
    ref={ref}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    fillRule="evenodd"
    viewBox="0 0 24 24"
    {...props}
  >
    <path d="M22 10.552v2.26h-7.932V22H11.54V10.552H22zM22 2v2.264H4.528V22H2V2h20zm0 4.276V8.54H9.296V22H6.768V6.276H22z" />
  </svg>
))
ReplicateIcon.displayName = "ReplicateIcon"
