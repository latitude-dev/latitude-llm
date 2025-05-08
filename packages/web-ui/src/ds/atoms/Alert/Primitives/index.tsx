import { forwardRef, HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../../../lib/utils'

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default:
          'border-accent-foreground/10 text-accent-foreground bg-accent [&>svg]:text-accent-foreground',
        destructive:
          'border-destructive-muted-foreground/10 text-destructive-muted-foreground bg-destructive-muted [&>svg]:text-destructive-muted-foreground',
        success: 'border-green-500 text-green-500 dark:text-white',
        warning:
          'bg-yellow text-warning-muted-foreground [&>svg]:text-warning-muted-foreground  border-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>

const AlertRoot = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role='alert'
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
)
AlertRoot.displayName = 'AlertRoot'

const AlertTitle = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-sm [&_p]:leading-relaxed whitespace-pre-wrap',
      className,
    )}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { AlertRoot, AlertTitle, AlertDescription }
