import { LatteStepGroup, LatteStepGroupItem } from '$/hooks/latte/types'
import { LatteEditAction } from '@latitude-data/constants/latte'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'

export function InteractionStep({
  step,
  singleLine,
  isLoading = false,
  isStreaming = false,
}: {
  step?: LatteStepGroup['steps'][number]
  singleLine?: boolean
  isLoading?: boolean
  isStreaming?: boolean
}) {
  if (!step) {
    return (
      <Text.H4
        color='latteOutputForegroundMuted'
        noWrap
        ellipsis
        userSelect={false}
        animate
      >
        {isStreaming ? 'Brewing...' : 'Stopped'}
      </Text.H4>
    )
  }

  if (step.type === 'thought') {
    return (
      <Text.H4
        color='latteOutputForeground'
        noWrap={singleLine}
        ellipsis={singleLine}
        whiteSpace='preWrap'
        userSelect={false}
        animate={isLoading && isStreaming}
      >
        {step.content}
      </Text.H4>
    )
  }

  if (step.type === 'action') {
    return (
      <EditActionStep
        step={step}
        singleLine={singleLine}
        isLoading={isLoading}
        isStreaming={isStreaming}
      />
    )
  }

  if (step.type === 'tool') {
    return (
      <ToolStep
        step={step}
        singleLine={singleLine}
        isLoading={isLoading}
        isStreaming={isStreaming}
      />
    )
  }

  return null
}

function ToolStep({
  step,
  singleLine,
  isLoading,
  isStreaming,
}: {
  step: Extract<LatteStepGroupItem, { type: 'tool' }>
  singleLine?: boolean
  isLoading?: boolean
  isStreaming?: boolean
}) {
  const icon = useMemo(() => {
    if (step.customIcon) {
      return step.customIcon
    }

    if (step.finished) {
      return 'check'
    }

    if (!isStreaming) {
      return 'circleX'
    }

    return 'loader'
  }, [step.customIcon, step.finished, isStreaming])

  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon
        name={icon}
        spin={icon === 'loader'}
        color='latteOutputForegroundMuted'
        className='min-w-4 mt-0.5'
      />
      <Text.H4
        noWrap={singleLine}
        ellipsis={singleLine}
        color='latteOutputForegroundMuted'
        userSelect={false}
        animate={isLoading && isStreaming}
      >
        {step.finished
          ? (step.finishedDescription ?? step.activeDescription)
          : step.activeDescription}
      </Text.H4>
    </div>
  )
}

const editAction = (
  action: LatteEditAction,
): { icon: IconName; operationDescription: string } => {
  if (action.operation === 'create') {
    return {
      icon: 'filePlus',
      operationDescription: `Created prompt ${action.path}`,
    }
  }

  if (action.operation === 'delete') {
    return {
      icon: 'trash',
      operationDescription: `Deleted prompt ${action.promptUuid}`,
    }
  }

  if (action.path && !action.content) {
    return {
      icon: 'squareArrowRight',
      operationDescription: `Renamed prompt to ${action.path}`,
    }
  }

  return {
    icon: 'file',
    operationDescription: `Updated prompt ${action.path ?? action.promptUuid}`,
  }
}

function EditActionStep({
  step,
  singleLine,
  isLoading,
  isStreaming,
}: {
  step: Extract<LatteStepGroupItem, { type: 'action' }>
  singleLine?: boolean
  isLoading?: boolean
  isStreaming?: boolean
}) {
  const { icon, operationDescription } = editAction(step.action)

  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon
        name={icon}
        color='latteOutputForegroundMuted'
        className='min-w-4 mt-0.5'
      />
      <Text.H4
        noWrap={singleLine}
        ellipsis={singleLine}
        color='latteOutputForegroundMuted'
        animate={isLoading && isStreaming}
        userSelect={false}
      >
        {operationDescription}
      </Text.H4>
    </div>
  )
}
