import type { LucideProps } from "lucide-react"
import { forwardRef, memo } from "react"

import { type TextColor, colors } from "../../tokens/index.js"
import { cn } from "../../utils/cn.js"

const sizeMap = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  default: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
  "2xl": "h-12 w-12",
} as const

export type IconSize = keyof typeof sizeMap

export interface IconProps extends Omit<LucideProps, "size"> {
  icon: React.ComponentType<LucideProps>
  size?: IconSize
  color?: TextColor
  className?: string
}

const Icon = memo(
  forwardRef<SVGSVGElement, IconProps>(({ icon: IconComponent, size = "default", color, className, ...props }, ref) => {
    const colorClass = color ? colors.textColors[color] : ""

    return <IconComponent ref={ref} className={cn(sizeMap[size], colorClass, className)} {...props} />
  }),
)

Icon.displayName = "Icon"

export { Icon }
