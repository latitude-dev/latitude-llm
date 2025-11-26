import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'

export function AnnotationsProgressIcon({
  isCompleted,
}: {
  isCompleted: boolean
}) {
  return (
    <div className='relative flex items-center justify-center border-4 border-background rounded-full'>
      {/* Light rays */}
      {/* Top */}
      <div
        className={cn('absolute -top-2.5 h-2 w-0.5 bg-latte rounded-full', {
          'opacity-0': !isCompleted,
          'opacity-100': isCompleted,
        })}
      />
      {/* Top-right */}
      <div
        className={cn(
          'absolute -top-1.5 -right-0.5 h-2 w-0.5 bg-latte rounded-full rotate-45',
          {
            'opacity-0': !isCompleted,
            'opacity-100': isCompleted,
          },
        )}
      />
      {/* Right */}
      {/* Top-left */}
      <div
        className={cn(
          'absolute -top-1.5 -left-0.5 h-2 w-0.5 bg-latte rounded-full -rotate-45',
          {
            'opacity-0': !isCompleted,
            'opacity-100': isCompleted,
          },
        )}
      />

      <div
        className={cn('h-6 w-6 rounded-full flex items-center justify-center', {
          'bg-secondary': !isCompleted,
          'bg-latte': isCompleted,
        })}
      >
        <Icon
          name='lightBulb'
          color={isCompleted ? 'latteInputForeground' : 'foregroundMuted'}
        />
      </div>
    </div>
  )
}
