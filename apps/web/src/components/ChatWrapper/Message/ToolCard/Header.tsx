import { ToolRequestContent } from '@latitude-data/constants/legacyCompiler'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'

function ToolIcon({
  status,
  customIcon,
}: {
  status: 'pending' | 'success' | 'error'
  customIcon?: IconName
}) {
  const statusIcon =
    status === 'pending'
      ? 'loader'
      : status === 'success'
        ? 'checkClean'
        : 'close'

  const statusColor: TextColor =
    status === 'pending'
      ? 'primary'
      : status === 'success'
        ? 'success'
        : 'destructive'

  return (
    <div className='flex min-w-8 h-8 rounded-xl bg-background items-center justify-center border border-border relative'>
      <Icon name={customIcon ?? 'wrench'} color={statusColor} />
      <div
        className={cn(
          'absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 p-0.5 rounded-full',
          {
            'bg-primary': status === 'pending',
            'bg-success': status === 'success',
            'bg-destructive': status === 'error',
          },
        )}
      >
        <Icon
          name={statusIcon}
          color={
            status === 'pending'
              ? 'primaryForeground'
              : status === 'success'
                ? 'successForeground'
                : 'destructiveForeground'
          }
          spin={status === 'pending'}
          size='small'
        />
      </div>
    </div>
  )
}

export function ToolCardHeader({
  toolRequest,
  status,
  isOpen,
  onToggle,
  customLabel,
  customIcon,
}: {
  toolRequest: ToolRequestContent
  status: 'pending' | 'success' | 'error'
  isOpen: boolean
  onToggle: () => void
  customLabel?: string
  customIcon?: IconName
}) {
  return (
    <div
      className='sticky top-0 flex flex-row w-full bg-secondary hover:bg-secondary/80 cursor-pointer items-center p-3 gap-3 pr-4'
      onClick={onToggle}
    >
      <ToolIcon status={status} customIcon={customIcon} />
      <div className='flex flex-col min-w-0 flex-1 overflow-hidden'>
        <Text.H6 noWrap ellipsis>
          {customLabel ?? toolRequest.toolName}
        </Text.H6>
      </div>
      <Icon
        name={isOpen ? 'chevronUp' : 'chevronDown'}
        color='foregroundMuted'
      />
    </div>
  )
}
