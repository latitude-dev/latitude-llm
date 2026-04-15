import { Slot } from "@radix-ui/react-slot"
import { forwardRef, memo, type ReactNode } from "react"

import { colors, type TextColor } from "../../tokens/colors.ts"
import { type FontSize, type FontSpacing, type FontWeight, font } from "../../tokens/font.ts"
import { opacity, type TextOpacity } from "../../tokens/opacity.ts"
import { type Overflow, overflow as overflowOptions } from "../../tokens/overflow.ts"
import { type WhiteSpace, whiteSpace as whiteSpaceOptions } from "../../tokens/whiteSpace.ts"
import { type WordBreak, wordBreak as wordBreakOptions } from "../../tokens/wordBreak.ts"
import { cn } from "../../utils/cn.ts"

// Define display sizes as const outside component for better performance
const DISPLAY_SIZES = new Set<FontSize>(["h1", "h2", "h3", "h4"])

type Display = "inline" | "inline-block" | "block"
export type Common = {
  id?: string
  children: ReactNode
  className?: string
  color?: TextColor
  textOpacity?: TextOpacity
  align?: "left" | "center" | "right"
  capitalize?: boolean
  uppercase?: boolean
  wordBreak?: WordBreak
  whiteSpace?: WhiteSpace
  ellipsis?: boolean
  display?: Display
  userSelect?: boolean
  noWrap?: boolean
  /** Truncates to N lines via Tailwind `line-clamp-*`. Values ≥ 6 use `line-clamp-6`. */
  lineClamp?: number
  centered?: boolean
  underline?: boolean
  lineThrough?: boolean
  italic?: boolean
  weight?: FontWeight
  asChild?: boolean
}

export type TextProps = {
  size?: FontSize
  weight?: FontWeight
  spacing?: FontSpacing
  capitalize?: boolean
  wordBreak?: WordBreak
  uppercase?: boolean
  userSelect?: boolean
}

type AllTextProps = TextProps & Common

const TextAtom = memo(
  forwardRef<HTMLElement, AllTextProps>(function Text(
    {
      id,
      children,
      className,
      size = "h4",
      color = "foreground",
      textOpacity = 100,
      spacing = "normal",
      weight = "normal",
      display = "inline",
      uppercase = false,
      align = "left",
      capitalize = false,
      whiteSpace = "normal",
      wordBreak = "normal",
      lineClamp = undefined,
      ellipsis = false,
      centered = false,
      userSelect = true,
      noWrap = false,
      underline = false,
      lineThrough = false,
      italic = false,
      asChild = false,
    },
    ref,
  ) {
    const colorClass = colors.textColors[color]
    const sizeClass = font.size[size]
    const weightClass = font.weight[weight]
    const spacingClass = font.spacing[spacing]
    const alignClass = font.align[align]
    const wordBreakClass = wordBreakOptions[wordBreak]
    const clampActive = lineClamp !== undefined && lineClamp > 0
    const whiteSpaceClass = clampActive ? whiteSpaceOptions.normal : whiteSpaceOptions[whiteSpace]
    const Comp = asChild ? Slot : "span"
    const isDisplay = DISPLAY_SIZES.has(size)
    return (
      <Comp
        id={id}
        ref={ref}
        className={cn(
          sizeClass,
          weightClass,
          spacingClass,
          colorClass,
          opacity.text[textOpacity],
          wordBreakClass,
          whiteSpaceClass,
          alignClass,
          display,
          className,
          {
            capitalize: capitalize,
            uppercase: uppercase,
            truncate: ellipsis && !clampActive,
            "select-none": !userSelect,
            "whitespace-nowrap": noWrap && !clampActive,
            underline: underline,
            "line-through": lineThrough,
            italic: italic,
            [font.family.mono]: false,
            [font.family.sans]: !isDisplay,
            [font.family.display]: isDisplay,
            "text-center": centered,
            "leading-5": lineClamp && size === "h6",
            "break-words": clampActive,
            "line-clamp-1": lineClamp === 1,
            "line-clamp-2": lineClamp === 2,
            "line-clamp-3": lineClamp === 3,
            "line-clamp-4": lineClamp === 4,
            "line-clamp-5": lineClamp === 5,
            "line-clamp-6": lineClamp !== undefined && lineClamp >= 6,
          },
        )}
      >
        {children}
      </Comp>
    )
  }),
)

namespace Text {
  export const H1 = forwardRef<HTMLHeadingElement, Common>(function H1(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h1" {...props} />
  })
  H1.displayName = "Text.H1"

  export const H2 = forwardRef<HTMLHeadingElement, Common>(function H2(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h2" {...props} />
  })
  H2.displayName = "Text.H2"

  export const H3 = forwardRef<HTMLHeadingElement, Common>(function H3(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h3" {...props} />
  })
  H3.displayName = "Text.H3"
  export const H3M = forwardRef<HTMLHeadingElement, Common>(function H3M(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h3" weight="medium" {...props} />
  })
  H3M.displayName = "Text.H3M"

  export const H4 = forwardRef<HTMLHeadingElement, Common>(function H4(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h4" {...props} />
  })
  H4.displayName = "Text.H4"

  export const H4M = forwardRef<HTMLHeadingElement, Common>(function H4M(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h4" weight="medium" {...props} />
  })
  H4M.displayName = "Text.H4M"

  export const H4B = forwardRef<HTMLHeadingElement, Common>(function H4B(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h4" weight="bold" {...props} />
  })
  H4B.displayName = "Text.H4B"

  export const H5 = forwardRef<HTMLHeadingElement, Common>(function H5(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h5" {...props} />
  })
  H5.displayName = "Text.H5"

  export const H5M = forwardRef<HTMLHeadingElement, Common>(function H5M(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h5" weight="medium" {...props} />
  })
  H5M.displayName = "Text.H5M"

  export const H6 = forwardRef<HTMLHeadingElement, Common>(function H6(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h6" {...props} />
  })
  H6.displayName = "Text.H6"

  export const H6B = forwardRef<HTMLHeadingElement, Common>(function H6B(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h6" weight="bold" {...props} />
  })
  H6B.displayName = "Text.H6B"

  export const H7 = forwardRef<HTMLHeadingElement, Common>(function H7(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h7" {...props} />
  })
  H7.displayName = "Text.H7"

  export type MonoProps = {
    children: ReactNode
    color?: TextColor
    weight?: Extract<FontWeight, "normal" | "semibold" | "bold">
    userSelect?: boolean
    overflow?: Overflow
    ellipsis?: boolean
    display?: Display
    underline?: boolean
    lineThrough?: boolean
    size?: FontSize
    textTransform?: "none" | "uppercase" | "lowercase"
    whiteSpace?: WhiteSpace
    wordBreak?: WordBreak
    asChild?: boolean
  }

  export const Mono = forwardRef<HTMLSpanElement, MonoProps>(function MonoFont(
    {
      children,
      color = "foreground",
      overflow = "auto",
      whiteSpace = "pre",
      wordBreak = "normal",
      underline = false,
      lineThrough = false,
      size = "h6",
      textTransform = "none",
      userSelect = true,
      weight = "normal",
      ellipsis = false,
      display = "inline",
      asChild = false,
    },
    ref,
  ) {
    const sizeClass = font.size[size]
    const Comp = asChild ? Slot : "span"

    return (
      <Comp
        ref={ref}
        className={cn(
          sizeClass,
          font.family.mono,
          font.weight[weight],
          colors.textColors[color],
          overflowOptions[overflow],
          wordBreakOptions[wordBreak],
          {
            [display]: !ellipsis,
            [whiteSpaceOptions[whiteSpace]]: !!whiteSpace,
            "block truncate": ellipsis,
            "select-none": !userSelect,
            "line-through": lineThrough,
            underline: underline,
            [textTransform]: textTransform !== "none",
          },
        )}
      >
        {children}
      </Comp>
    )
  })
  Mono.displayName = "Text.Mono"
}

export { Text, TextAtom }
