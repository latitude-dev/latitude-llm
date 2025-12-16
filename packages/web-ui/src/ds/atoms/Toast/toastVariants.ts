import { cva } from 'class-variance-authority'

import { cn } from '../../../lib/utils'

export const toastVariants = cva(
  cn(
    'group pointer-events-auto relative flex w-full items-center justify-between space-x-2',
    'overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all',
    'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80',
    'data-[state=closed]:slide-out-to-left-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  ),
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        accent: 'accent group border-accent bg-accent text-accent-foreground',
        warning:
          'warning group border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
