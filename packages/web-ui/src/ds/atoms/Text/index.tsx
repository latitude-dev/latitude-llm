import {
  Children,
  forwardRef,
  ReactNode,
  type ForwardRefExoticComponent,
} from 'react'
import { Slot } from '@radix-ui/react-slot'

import {
  colors,
  font,
  overflow as overflowOptions,
  whiteSpace as whiteSpaceOptions,
  wordBreak as wordBreakOptions,
  type FontSize,
  type FontSpacing,
  type FontWeight,
  type Overflow,
  type TextColor,
  type WhiteSpace,
  type WordBreak,
} from '$ui/ds/tokens'
import { ExtendsUnion } from '$ui/lib/commonTypes'
import { cn } from '$ui/lib/utils'

type Display = 'inline' | 'inline-block' | 'block'
export type Common = {
  children: ReactNode
  color?: TextColor
  centered?: boolean
  capitalize?: boolean
  uppercase?: boolean
  wordBreak?: WordBreak
  whiteSpace?: WhiteSpace
  ellipsis?: boolean
  display?: Display
  userSelect?: boolean
  noWrap?: boolean
  underline?: boolean
  lineThrough?: boolean
  weight?: FontWeight
  asChild?: boolean
}

export type TextProps = {
  size?: FontSize
  weight?: FontWeight
  spacing?: FontSpacing
  centered?: boolean
  capitalize?: boolean
  wordBreak?: WordBreak
  uppercase?: boolean
  userSelect?: boolean
}

type AllTextProps = TextProps & Common

const TextAtom = forwardRef<HTMLElement, AllTextProps>(function Text(
  {
    children,
    size = 'h4',
    color = 'foreground',
    spacing = 'normal',
    weight = 'normal',
    display = 'inline',
    uppercase = false,
    centered = false,
    capitalize = false,
    whiteSpace = 'normal',
    wordBreak = 'normal',
    ellipsis = false,
    userSelect = true,
    noWrap = false,
    underline = false,
    lineThrough = false,
    asChild = false,
  },
  ref,
) {
  const colorClass = colors.textColors[color]
  const sizeClass = font.size[size]
  const weightClass = font.weight[weight]
  const spacingClass = font.spacing[spacing]
  const wordBreakClass = wordBreakOptions[wordBreak]
  const whiteSpaceClass = whiteSpaceOptions[whiteSpace]
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      ref={ref}
      title={ellipsis && typeof children === 'string' ? children : ''}
      className={cn(
        font.family.sans,
        sizeClass,
        weightClass,
        spacingClass,
        colorClass,
        wordBreakClass,
        whiteSpaceClass,
        display,
        {
          capitalize: capitalize,
          uppercase: uppercase,
          'text-center': centered,
          'text-left': !centered,
          truncate: ellipsis,
          'select-none': !userSelect,
          'whitespace-nowrap': noWrap,
          underline: underline,
          'line-through': lineThrough,
        },
      )}
    >
      {Children.count(children) > 1 ? <span>{children}</span> : children}
    </Comp>
  )
})

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
    color: TextColor
    children: ReactNode
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
  }

  export const Mono = forwardRef<HTMLSpanElement, MonoProps>(function MonoFont(
    {
      color,
      children,
      overflow = 'auto',
      whiteSpace = 'normal',
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

export default Text
