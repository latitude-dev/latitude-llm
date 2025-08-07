import { Text } from '../Text'
import { Icon } from '../Icons'
import type { IconProps } from '../Icons'
import { cn } from '../../../lib/utils'

function Line({ clickable }: { clickable: boolean }) {
  return (
    <div
      className={cn('flex-grow h-px bg-muted-foreground/40 transition-all', {
        'hover:rounded-full hover:bg-primary': clickable,
        'group-hover/separator:rounded-full': clickable,
        'group-hover/separator:bg-primary': clickable,
        'cursor-pointer ': clickable,
      })}
    />
  )
}

export function LineSeparator({
  text,
  icon,
  onClick,
  disabled = false,
}: {
  text: string
  asChild?: boolean
  icon?: IconProps
  onClick?: () => void
  disabled?: boolean
}) {
  const clickable = !!onClick && !disabled
  return (
    <button
      disabled={disabled}
      className={cn('group/separator w-full flex flex-row items-center select-none', {
        'cursor-pointer': onClick,
        'cursor-default': !onClick || disabled,
      })}
      onClick={onClick}
    >
      <Line clickable={clickable} />
      <div className='flex flex-row gap-x-2 px-2 items-center'>
        {icon ? <Icon {...icon} /> : null}
        <Text.H6 color='foregroundMuted'>{text}</Text.H6>
      </div>
      <Line clickable={clickable} />
    </button>
  )
}
