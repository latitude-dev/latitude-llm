import {
  Children,
  forwardRef,
  memo,
  ReactNode,
  type ForwardRefExoticComponent,
} from 'react'
import { Slot } from '@radix-ui/react-slot'

import { ExtendsUnion } from '@latitude-data/core/lib/commonTypes'

import { CurrentTheme } from '../../../constants'
import { cn } from '../../../lib/utils'
import {
  colors,
  font,
  opacity,
  overflow as overflowOptions,
  TextAlign,
  whiteSpace as whiteSpaceOptions,
  wordBreak as wordBreakOptions,
  type FontSize,
  type FontSpacing,
  type FontWeight,
  type Overflow,
  type TextColor,
  type WhiteSpace,
  type WordBreak,
  type TextOpacity,
} from '../../tokens'

type Display = 'inline' | 'inline-block' | 'block'
export type Common = {
  children: ReactNode
  theme?: CurrentTheme
  color?: TextColor
  textOpacity?: TextOpacity
  darkColor?: TextColor
  align?: TextAlign
  capitalize?: boolean
  uppercase?: boolean
  wordBreak?: WordBreak
  whiteSpace?: WhiteSpace
  ellipsis?: boolean
  showNativeTitle?: boolean
  lineClamp?: number
  display?: Display
  userSelect?: boolean
  noWrap?: boolean
  underline?: boolean
  lineThrough?: boolean
  weight?: FontWeight
  asChild?: boolean
  monospace?: boolean
  centered?: boolean
  animate?: boolean
  isItalic?: boolean
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
      children,
      size = 'h4',
      color = 'foreground',
      textOpacity = 100,
      darkColor,
      theme,
      spacing = 'normal',
      weight = 'normal',
      display = 'inline',
      uppercase = false,
      align = 'left',
      capitalize = false,
      whiteSpace = 'normal',
      wordBreak = 'normal',
      ellipsis = false,
      showNativeTitle = true,
      lineClamp = undefined,
      userSelect = true,
      noWrap = false,
      underline = false,
      lineThrough = false,
      asChild = false,
      isItalic = false,
      monospace = false,
      centered = false,
      animate = false,
    },
    ref,
  ) {
    const isDark = theme === CurrentTheme.Dark
    const colorClass =
      colors.textColors[isDark && darkColor ? darkColor : color]
    const sizeClass = font.size[size]
    const weightClass = font.weight[weight]
    const spacingClass = font.spacing[spacing]
    const alignClass = font.align[align]
    const wordBreakClass = wordBreakOptions[wordBreak]
    const whiteSpaceClass = whiteSpaceOptions[whiteSpace]
    const Comp = asChild ? Slot : 'span'
    const isDisplay = ['h1', 'h2', 'h3', 'h4'].includes(size)
    return (
      <Comp
        ref={ref}
        title={
          ellipsis && typeof children === 'string' && showNativeTitle
            ? children
            : ''
        }
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
          {
            'bg-[length:200%_auto] text-transparent bg-clip-text animate-text-gradient bg-gradient-to-r from-muted via-muted-foreground to-muted':
              animate,
            capitalize: capitalize,
            uppercase: uppercase,
            truncate: ellipsis,
            italic: isItalic,
            'select-none': !userSelect,
            'whitespace-nowrap': noWrap,
            underline: underline,
            'line-through': lineThrough,
            [font.family.mono]: monospace,
            [font.family.sans]: !monospace && !isDisplay,
            [font.family.display]: !monospace && isDisplay,
            'text-center': centered,
            'line-clamp-1': lineClamp === 1,
            'line-clamp-3': lineClamp === 3,
            'leading-5': lineClamp && size === 'h6',
          },
        )}
      >
        {Children.count(children) > 1 ? <span>{children}</span> : children}
      </Comp>
    )
  }),
)

namespace Text {
  export const H1: ForwardRefExoticComponent<Common> = forwardRef<
    HTMLSpanElement,
    Common
  >(function H1(props, ref) {
    return <TextAtom ref={ref} size='h1' {...props} />
  })

  export const H1B = forwardRef<HTMLSpanElement, Common>(
    function H1(props, ref) {
      return <TextAtom ref={ref} size='h1' weight='bold' {...props} />
    },
  )

  export const H2 = forwardRef<HTMLSpanElement, Common>(
    function H2(props, ref) {
      return <TextAtom ref={ref} size='h2' {...props} />
    },
  )

  export const H2M = forwardRef<HTMLSpanElement, Common>(
    function H2M(props, ref) {
      return <TextAtom ref={ref} size='h2' weight='medium' {...props} />
    },
  )

  export const H2B = forwardRef<HTMLSpanElement, Common>(
    function H2B(props, ref) {
      return <TextAtom ref={ref} size='h2' weight='bold' {...props} />
    },
  )

  export const H3 = forwardRef<HTMLSpanElement, Common>(
    function H3(props, ref) {
      return <TextAtom ref={ref} size='h3' {...props} />
    },
  )

  export const H3M = forwardRef<HTMLSpanElement, Common>(
    function H3M(props, ref) {
      return <TextAtom ref={ref} size='h3' weight='medium' {...props} />
    },
  )

  export const H3B = forwardRef<HTMLSpanElement, Common>(
    function H3B(props, ref) {
      return <TextAtom ref={ref} size='h3' weight='bold' {...props} />
    },
  )

  export const H4 = forwardRef<HTMLSpanElement, Common>(
    function H4(props, ref) {
      return <TextAtom ref={ref} size='h4' {...props} />
    },
  )

  export const H4M = forwardRef<HTMLSpanElement, Common>(
    function H4M(props, ref) {
      return <TextAtom ref={ref} size='h4' weight='medium' {...props} />
    },
  )

  export const H4B = forwardRef<HTMLSpanElement, Common>(
    function H4B(props, ref) {
      return <TextAtom ref={ref} size='h4' weight='semibold' {...props} />
    },
  )

  export const H5 = forwardRef<HTMLSpanElement, Common>(
    function H5(props, ref) {
      return <TextAtom ref={ref} size='h5' {...props} />
    },
  )

  export const H5M = forwardRef<HTMLSpanElement, Common>(
    function H5M(props, ref) {
      return <TextAtom ref={ref} size='h5' weight='medium' {...props} />
    },
  )
  export const H5B = forwardRef<HTMLSpanElement, Common>(
    function H5B(props, ref) {
      return <TextAtom ref={ref} size='h5' weight='semibold' {...props} />
    },
  )

  export const H6 = forwardRef<HTMLSpanElement, Common>(
    function H6(props, ref) {
      return <TextAtom ref={ref} size='h6' {...props} />
    },
  )

  export const H6M = forwardRef<HTMLSpanElement, Common>(
    function H6M(props, ref) {
      return <TextAtom ref={ref} size='h6' weight='medium' {...props} />
    },
  )
  export const H6B = forwardRef<HTMLSpanElement, Common>(
    function H6B(props, ref) {
      return <TextAtom ref={ref} size='h6' weight='semibold' {...props} />
    },
  )

  export const H6C = forwardRef<HTMLSpanElement, Common>(
    function H6C(props, ref) {
      return (
        <TextAtom
          ref={ref}
          uppercase
          size='h6'
          spacing='wide'
          weight='bold'
          {...props}
        />
      )
    },
  )

  // H7
  export const H7 = forwardRef<HTMLSpanElement, Common>(
    function H7(props, ref) {
      return (
        <TextAtom ref={ref} size='h7' spacing='wide' weight='bold' {...props} />
      )
    },
  )

  export const H7C = forwardRef<HTMLSpanElement, Common>(
    function H7C(props, ref) {
      return (
        <TextAtom
          ref={ref}
          uppercase
          size='h7'
          spacing='wide'
          weight='bold'
          {...props}
        />
      )
    },
  )

  export const H8 = forwardRef<HTMLSpanElement, Common>(
    function H8(props, ref) {
      return (
        <TextAtom ref={ref} size='h8' spacing='wide' weight='bold' {...props} />
      )
    },
  )

  export type MonoProps = {
    children: ReactNode
    color?: TextColor
    weight?: ExtendsUnion<FontWeight, 'normal' | 'semibold' | 'bold'>
    userSelect?: boolean
    overflow?: Overflow
    ellipsis?: boolean
    display?: Display
    underline?: boolean
    lineThrough?: boolean
    size?: FontSize
    textTransform?: 'none' | 'uppercase' | 'lowercase'
    whiteSpace?: WhiteSpace
    wordBreak?: WordBreak
  }

  export const Mono = forwardRef<HTMLSpanElement, MonoProps>(function MonoFont(
    {
      children,
      color = 'foreground',
      overflow = 'auto',
      whiteSpace = 'pre',
      wordBreak = 'normal',
      underline = false,
      lineThrough = false,
      size = 'h6',
      textTransform = 'none',
      userSelect = true,
      weight = 'normal',
      ellipsis = false,
      display = 'inline',
    },
    ref,
  ) {
    const sizeClass = font.size[size]

    return (
      <span
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
            'block truncate': ellipsis,
            'select-none': !userSelect,
            'line-through': lineThrough,
            underline: underline,
            [textTransform]: textTransform !== 'none',
          },
        )}
      >
        {children}
      </span>
    )
  })
}

export { Text }
