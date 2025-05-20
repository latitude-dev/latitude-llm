import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { RightSidebarItem, RightSidebarTabs } from './types'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TripleThemeToggle } from '@latitude-data/web-ui/molecules/TrippleThemeToggle'
import { forwardRef } from 'react'

const SidebarButton = forwardRef<
  HTMLButtonElement,
  {
    iconName: IconName
    isSelected: boolean
    onClick: () => void
  }
>(({ iconName, isSelected, onClick, ...rest }, ref) => {
  return (
    <Button
      ref={ref}
      variant='ghost'
      onClick={onClick}
      className={cn('p-0 w-10 h-10', {
        'bg-accent': isSelected,
        'hover:bg-muted': !isSelected,
      })}
      {...rest}
    >
      <Icon
        name={iconName}
        color={isSelected ? 'primary' : 'foregroundMuted'}
        className='w-6 h-6'
      />
    </Button>
  )
})

export function RightSidebar({
  items,
  selected,
  onSelect,
}: {
  items: RightSidebarItem[]
  selected: RightSidebarTabs | undefined
  onSelect: ReactStateDispatch<RightSidebarTabs | undefined>
}) {
  return (
    <div
      className={cn('flex flex-row w-full h-full overflow-hidden', {
        'border-border border-l': !selected,
      })}
    >
      <div className='flex flex-col gap-2 w-fit h-full max-h-full overflow-hidden min-w-10 p-1 pb-2 items-center'>
        <div className='flex flex-col gap-2 flex-grow min-h-0'>
          {items.map((item) => (
            <Tooltip
              key={item.value}
              side='left'
              delayDuration={0}
              sideOffset={8}
              asChild
              trigger={
                typeof item.icon === 'string' ? (
                  <SidebarButton
                    iconName={item.icon}
                    isSelected={selected === item.value}
                    onClick={() =>
                      onSelect(selected === item.value ? undefined : item.value)
                    }
                  />
                ) : (
                  item.icon({
                    isSelected: selected === item.value,
                    onClick: () =>
                      onSelect(
                        selected === item.value ? undefined : item.value,
                      ),
                  })
                )
              }
            >
              {item.label}
            </Tooltip>
          ))}
        </div>
        <TripleThemeToggle direction='vertical' />
      </div>
      <div className='flex-grow h-full min-w-0 border-l border-border overflow-hidden relative'>
        {items.map((item) => {
          const isVisible = selected === item.value
          return (
            <div
              key={item.value}
              className='absolute inset-0 overflow-hidden transition-opacity duration-200'
              style={{
                opacity: isVisible ? 1 : 0,
                visibility: isVisible ? 'visible' : 'hidden',
                pointerEvents: isVisible ? 'auto' : 'none',
              }}
            >
              {item.content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
