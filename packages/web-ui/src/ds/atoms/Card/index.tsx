import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '../../../lib/utils'
import { boxShadow, type BoxShadow } from '../../tokens'

type CardSpacing = 'small' | 'normal'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  background?: 'dark' | 'light'
  shadow?: BoxShadow
}
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, shadow = 'none', background = 'dark', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border bg-card text-card-foreground',
        'overflow-hidden',
        className,
        boxShadow[shadow],
        {
          'bg-card border': background === 'dark',
          'bg-background-gray border dark:border-foreground/20': background === 'light',
        },
      )}
      {...props}
    />
  )
})

type CardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  spacing?: CardSpacing
}
const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { className, spacing = 'normal', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5', className, {
        'p-6': spacing === 'normal',
        'p-3': spacing === 'small',
      })}
      {...props}
    />
  )
})

const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('font-semibold leading-none tracking-tight', className)}
        {...props}
      />
    )
  },
)

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  },
)

type CardContentProps = HTMLAttributes<HTMLDivElement> & {
  standalone?: boolean
  spacing?: CardSpacing
}
const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent(
  { className, standalone, spacing = 'normal', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(className, {
        'p-6 pt-0': spacing === 'normal',
        'p-3 pt-0': spacing === 'small',
        'pt-6': standalone && spacing === 'normal',
        'pt-3': standalone && spacing === 'small',
      })}
      {...props}
    />
  )
})

type CardFooterProps = HTMLAttributes<HTMLDivElement> & {
  spacing?: CardSpacing
}
const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { className, spacing = 'normal', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center pt-0', className, {
        'p-6': spacing === 'normal',
        'p-3': spacing === 'small',
      })}
      {...props}
    />
  )
})

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
