import { LatteInteractionStep } from '$/hooks/latte/types'
import { LatteEditAction } from '@latitude-data/constants/latte'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function InteractionStep({
  step,
  singleLine,
}: {
  step?: LatteInteractionStep
  singleLine?: boolean
}) {
  if (!step) {
    return (
      <Text.H5
        color='foregroundMuted'
        noWrap={singleLine}
        ellipsis={singleLine}
        animate
      >
        Thinking...
      </Text.H5>
    )
  }

  if (step.type === 'thought') {
    return (
      <Text.H5
        color='foregroundMuted'
        noWrap={singleLine}
        ellipsis={singleLine}
        whiteSpace='preWrap'
      >
        {step.content}
      </Text.H5>
    )
  }

  if (step.type === 'action') {
    return <EditActionStep step={step} singleLine={singleLine} />
  }

  return <ToolStep step={step} singleLine={singleLine} />
}

function ToolStep({
  step,
  singleLine,
}: {
  step: Extract<LatteInteractionStep, { type: 'tool' }>
  singleLine?: boolean
}) {
  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon
        name={step.finished ? 'check' : 'loader'}
        spin={!step.finished}
        color='foregroundMuted'
        className='min-w-4 mt-0.5'
      />
      <Text.H5
        noWrap={singleLine}
        ellipsis={singleLine}
        color='foregroundMuted'
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
}: {
  step: Extract<LatteInteractionStep, { type: 'action' }>
  singleLine?: boolean
}) {
  const { icon, operationDescription } = editAction(step.action)

  return (
    <div className='flex flex-row gap-2 items-start max-w-full'>
      <Icon name={icon} color='foregroundMuted' className='min-w-4 mt-0.5' />
      <Text.H5
        noWrap={singleLine}
        ellipsis={singleLine}
        color='foregroundMuted'
      >
        {operationDescription}
      </Text.H5>
    </div>
  )
}
