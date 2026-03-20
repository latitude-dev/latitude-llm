import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

export const OpencodeIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" {...props}>
    <rect width="512" height="512" className="fill-[#FDFCFC] dark:fill-[#131010]" />
    <path d="M320 224V352H192V224H320Z" className="fill-[#E6E5E6] dark:fill-[#5A5858]" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
      className="fill-[#17181C] dark:fill-white"
    />
  </svg>
))
OpencodeIcon.displayName = "OpencodeIcon"
