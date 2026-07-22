import type { LucideProps } from "lucide-react"
import { createContext, forwardRef, memo, type ReactNode, useContext } from "react"

import { colors, type TextColor } from "../../tokens/colors.ts"
import { cn } from "../../utils/cn.ts"

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

const weightMap = {
  XS: 1,
  S: 1.5,
  L: 2.5,
  XL: 3,
} as const

export type IconWeight = keyof typeof weightMap

export interface IconProps extends Omit<LucideProps, "size"> {
  icon: React.ComponentType<LucideProps>
  size?: IconSize
  color?: TextColor
  weight?: IconWeight
  className?: string
}

interface IconDefaults {
  readonly size?: IconSize | undefined
  readonly weight?: IconWeight | undefined
}

const IconDefaultsContext = createContext<IconDefaults | null>(null)

/**
 * Lets an ancestor (e.g. `Button`) set a fallback icon size/weight for any
 * `Icon` rendered inside it. Only applies when the `Icon` itself doesn't
 * specify its own `size`/`weight` — an explicit prop always wins.
 */
export function IconDefaultsProvider({ size, weight, children }: IconDefaults & { children: ReactNode }) {
  return <IconDefaultsContext.Provider value={{ size, weight }}>{children}</IconDefaultsContext.Provider>
}

const Icon = memo(
  forwardRef<SVGSVGElement, IconProps>(({ icon: IconComponent, size, color, weight, className, ...props }, ref) => {
    const defaults = useContext(IconDefaultsContext)
    const resolvedSize = size ?? defaults?.size ?? "default"
    const resolvedWeight = weight ?? defaults?.weight
    const colorClass = color ? colors.textColors[color] : ""

    return (
      <IconComponent
        ref={ref}
        className={cn(sizeMap[resolvedSize], colorClass, className)}
        {...(resolvedWeight ? { strokeWidth: weightMap[resolvedWeight] } : {})}
        {...props}
      />
    )
  }),
)

Icon.displayName = "Icon"

export { Icon }
