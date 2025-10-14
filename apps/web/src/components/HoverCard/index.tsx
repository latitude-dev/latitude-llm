import { BackgroundHoverColor, colors } from '@latitude-data/web-ui/tokens'
import { ReactNode } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

export default function HoverCard({
  children,
  backgroundHoverColor,
}: {
  children: ReactNode
  backgroundHoverColor: BackgroundHoverColor
}) {
  return (
    <div
      className={cn(
        `border-2 border-dashed bg-muted rounded-xl max-w-sm p-1 hover:bg-opacity-40 hover:border-opacity-60 transition-all duration-200`,
        colors.backgroundHoverColors[backgroundHoverColor],
        colors.borderHoverColors[backgroundHoverColor],
      )}
    >
      <div className='bg-background rounded-lg p-5 flex flex-col h-full'>
        {children}
      </div>
    </div>
  )
}
