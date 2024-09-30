import { ReactNode } from 'react'

import { Badge, Button, cn, Icon, Popover, Text } from '@latitude-data/web-ui'

import { PinnedDocumentation } from './PinnedDocumentation'
import { TooltipInfo } from './TooltipInfo'

export const VariableSection = ({
  title,
  content,
  tooltip,
  height = '36',
  isPopoverOpen,
  setIsPopoverOpen,
  popoverContent,
  isPinned,
  onUnpin,
}: {
  title: string
  content: string
  tooltip?: string
  height?: string
  isPopoverOpen?: boolean
  setIsPopoverOpen?: (isPopoverOpen: boolean) => void
  popoverContent?: ReactNode
  isPinned?: boolean
  onUnpin?: () => void
}) => (
  <div className='flex flex-col gap-2'>
    <div className='flex flex-row gap-2 items-center justify-between'>
      <div className='flex flex-row gap-2 items-center'>
        <Badge variant='accent'>{title}</Badge>
        {tooltip && <TooltipInfo text={tooltip} />}
      </div>
      {popoverContent &&
        (isPinned ? (
          <Button variant='nope' onClick={onUnpin}>
            <Icon name='pinOff' color='foregroundMuted' />
            <Text.H6M color='foregroundMuted'>Unpin documentation</Text.H6M>
          </Button>
        ) : (
          <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <Popover.Trigger asChild>
              <Button variant='nope'>
                <Icon name='circleHelp' color='foregroundMuted' />
                <Text.H6M color='foregroundMuted'>View documentation</Text.H6M>
              </Button>
            </Popover.Trigger>
            <Popover.Content
              align='end'
              className='bg-white shadow-lg rounded-lg p-4 max-w-xl'
            >
              {popoverContent}
            </Popover.Content>
          </Popover.Root>
        ))}
    </div>
    {isPinned && popoverContent && <PinnedDocumentation isPinned />}
    <textarea
      className={cn(
        `w-full p-2 rounded-lg border bg-secondary resize-y text-xs`,
        {
          'h-36': height === '36',
          'h-24': height === '24',
        },
      )}
      value={content}
      disabled
      readOnly
    />
  </div>
)
