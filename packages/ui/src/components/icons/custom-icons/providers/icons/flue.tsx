import type { LucideProps } from "lucide-react"

export function FlueIcon(props: LucideProps) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 108 108"
      preserveAspectRatio="xMidYMid"
      {...props}
    >
      <rect width="108" height="108" transform="matrix(-1 0 0 1 108 0)" className="fill-black dark:fill-white" />
      <rect width="18" height="18" transform="matrix(-1 0 0 1 72 18)" className="fill-white dark:fill-black" />
      <rect width="18" height="18" transform="matrix(-1 0 0 1 54 72)" className="fill-white dark:fill-black" />
      <rect width="18" height="18" transform="matrix(-1 0 0 1 54 36)" className="fill-white dark:fill-black" />
      <rect width="18" height="18" transform="matrix(-1 0 0 1 72 54)" className="fill-white dark:fill-black" />
    </svg>
  )
}
