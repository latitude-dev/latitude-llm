import { ReactNode, Ref } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

const DetailsPanel = ({
  ref,
  children,
  bordered,
  className,
}: {
  children: ReactNode
  bordered: boolean
  className?: string
  ref?: Ref<HTMLDivElement>
}) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-y-6 flex-grow min-h-0 bg-background overflow-x-auto',
        'rounded-lg items-center relative',
        className,
        { 'border border-border': bordered },
      )}
    >
      {children}
    </div>
  )
}

DetailsPanel.displayName = 'DetailsPanel'

DetailsPanel.Header = function DetailsPanelHeader({
  children,
  space = 'normal',
}: {
  children: ReactNode
  space?: 'normal' | 'none'
}) {
  return (
    <div
      className={cn('relative w-full', {
        'px-4 pt-4': space === 'normal',
      })}
    >
      {children}
    </div>
  )
}

DetailsPanel.Body = function DetailsPanelBody({
  children,
  space = 'normal',
}: {
  children: ReactNode
  space?: 'normal' | 'none'
}) {
  return (
    <div
      className={cn(
        'w-full custom-scrollbar scrollable-indicator overflow-auto relative',
        {
          'px-4 pb-5': space === 'normal',
        },
      )}
    >
      {children}
    </div>
  )
}

DetailsPanel.Footer = function DetailsPanelFooter({
  children,
  space = 'normal',
}: {
  children: ReactNode
  space?: 'normal' | 'none'
}) {
  return (
    <div
      className={cn('w-full bg-card rounded-b-lg mt-auto', {
        'p-4': space === 'normal',
      })}
    >
      {children}
    </div>
  )
}

export { DetailsPanel }
