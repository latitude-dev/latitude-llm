import { LatteInteractionStep } from '$/hooks/latte/types'
import { LatteEditAction } from '@latitude-data/constants/latte'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function InteractionStep({
  step,
  singleLine,
  isLoading = false,
}: {
  step?: LatteInteractionStep
  singleLine?: boolean
  isLoading?: boolean
}) {
  if (!step) {
    return (
      <Text.H5
        color='latteOutputForegroundMuted'
        noWrap={singleLine}
        ellipsis={singleLine}
        userSelect={false}
        animate
      >
        Thinking...
      </Text.H5>
    )
  }

  if (step.type === 'thought') {
    return (
      <Text.H5
        color='latteOutputForeground'
        noWrap={singleLine}
        ellipsis={singleLine}
        whiteSpace='preWrap'
        userSelect={false}
        animate={isLoading}
      >
        {step.content}
      </Text.H5>
    )
  }

  if (step.type === 'action') {
    return (
      <EditActionStep
        step={step}
        singleLine={singleLine}
        isLoading={isLoading}
      />
    )
  }

  return <ToolStep step={step} singleLine={singleLine} isLoading={isLoading} />
}

function ToolStep({
  step,
  singleLine,
  isLoading,
}: {
  step: Extract<LatteInteractionStep, { type: 'tool' }>
  singleLine?: boolean
  isLoading?: boolean
}) {
  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon
        name={step.customIcon ?? (step.finished ? 'check' : 'loader')}
        spin={!step.customIcon && !step.finished}
        color='latteOutputForegroundMuted'
        className='min-w-4 mt-0.5'
      />
      <Text.H5
        noWrap={singleLine}
        ellipsis={singleLine}
        color='latteOutputForegroundMuted'
        userSelect={false}
        animate={isLoading}
      >
        {step.finished
          ? (step.finishedDescription ?? step.activeDescription)
          : step.activeDescription}
      </Text.H5>
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
}: {
  step: Extract<LatteInteractionStep, { type: 'action' }>
  singleLine?: boolean
  isLoading?: boolean
}) {
  const { icon, operationDescription } = editAction(step.action)

  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon
        name={icon}
        color='latteOutputForegroundMuted'
        className='min-w-4 mt-0.5'
      />
      <Text.H5
        noWrap={singleLine}
        ellipsis={singleLine}
        color='latteOutputForegroundMuted'
        animate={isLoading}
        userSelect={false}
      >
        {operationDescription}
      </Text.H5>
    </div>
  )
}
