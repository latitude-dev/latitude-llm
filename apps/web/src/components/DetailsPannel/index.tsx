import { ReactNode, Ref } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

const DetailsPanel = ({
  ref,
  children,
  className,
}: {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
}) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col flex-grow min-h-0 bg-background overflow-x-auto',
        'border border-border rounded-lg items-center relative',
        className,
      )}
    >
      {children}
    </div>
  )
}

DetailsPanel.displayName = 'DetailsPanel'

DetailsPanel.Header = function DetailsPanelHeader({
  children,
}: {
  children: ReactNode
}) {
  return <div className='pt-6 px-4 relative w-full'>{children}</div>
}

DetailsPanel.Body = function DetailsPanelBody({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className='w-full px-4 pb-5 mt-5 custom-scrollbar scrollable-indicator overflow-auto relative'>
      {children}
    </div>
  )
}

DetailsPanel.Footer = function DetailsPanelFooter({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className='w-full bg-card rounded-b-lg p-4 mt-auto'>{children}</div>
  )
}

export { DetailsPanel }
