import React, { ReactNode } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { Text as EmailText, Heading } from '@react-email/components'
import { TextColor, colors } from '../tokens'
import {
  font,
  FontSize,
  FontWeight,
  TextAlign,
} from '@latitude-data/web-ui/tokens'
type Display = 'inline' | 'inline-block' | 'block'

export type Common = {
  children: ReactNode
  color?: TextColor
  weight?: FontWeight
  align?: TextAlign
  lineThrough?: boolean
  display?: Display
}

export type TextProps = {
  size?: FontSize
  weight?: FontWeight
  capitalize?: boolean
  uppercase?: boolean
  underline?: boolean
}

type AllTextProps = TextProps & Common & { as?: 'heading' | 'text' }
const TextAtom = ({
  children,
  size = 'h4',
  color = 'foreground',
  weight = 'normal',
  align = 'left',
  display = 'inline',
  capitalize = false,
  uppercase = false,
  underline = false,
  lineThrough = false,
  as = 'text',
}: AllTextProps) => {
  const sizeClass = font.size[size]
  const weightClass = font.weight[weight]
  const colorClass = colors.textColors[color]
  const alignClass = font.align[align]
  const className = cn(
    'mt-0 mb-0',
    sizeClass,
    weightClass,
    colorClass,
    alignClass,
    display,
    {
      capitalize: capitalize,
      uppercase: uppercase,
      underline: underline,
      'line-through': lineThrough,
    },
  )

  if (as === 'heading') {
    return <Heading className={className}>{children}</Heading>
  }

  return <EmailText className={className}>{children}</EmailText>
}

namespace Text {
  export const H1 = (props: Common) => {
    return <TextAtom as='heading' size='h1' {...props} />
  }

  export const H1B = (props: Common) => {
    return <TextAtom as='heading' size='h1' weight='bold' {...props} />
  }

  export const H2 = (props: Common) => {
    return <TextAtom as='heading' size='h2' {...props} />
  }

  export const H2M = (props: Common) => {
    return <TextAtom as='heading' size='h2' weight='medium' {...props} />
  }

  export const H2B = (props: Common) => {
    return <TextAtom as='heading' size='h2' weight='bold' {...props} />
  }

  export const H3 = (props: Common) => {
    return <TextAtom as='heading' size='h3' {...props} />
  }

  export const H3M = (props: Common) => {
    return <TextAtom as='heading' size='h3' weight='medium' {...props} />
  }

  export const H3B = (props: Common) => {
    return <TextAtom as='heading' size='h3' weight='bold' {...props} />
  }

  export const H4 = (props: Common) => {
    return <TextAtom size='h4' {...props} />
  }

  export const H4M = (props: Common) => {
    return <TextAtom size='h4' weight='medium' {...props} />
  }

  export const H4B = (props: Common) => {
    return <TextAtom size='h4' weight='semibold' {...props} />
  }

  export const H5 = (props: Common) => {
    return <TextAtom size='h5' {...props} />
  }

  export const H5M = (props: Common) => {
    return <TextAtom size='h5' weight='medium' {...props} />
  }

  export const H5B = (props: Common) => {
    return <TextAtom size='h5' weight='semibold' {...props} />
  }

  export const H6 = (props: Common) => {
    return <TextAtom size='h6' {...props} />
  }

  export const H6M = (props: Common) => {
    return <TextAtom size='h6' weight='medium' {...props} />
  }

  export const H6B = (props: Common) => {
    return <TextAtom size='h6' weight='semibold' {...props} />
  }

  export const H6C = (props: Common) => {
    return <TextAtom uppercase size='h6' weight='bold' {...props} />
  }
}

export { Text }
