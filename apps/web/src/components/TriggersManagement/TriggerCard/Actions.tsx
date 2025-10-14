import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerStatus } from '@latitude-data/constants'
import { Commit, DocumentTrigger } from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCallback } from 'react'
import { RUNNABLE_TRIGGERS, RunTriggerProps } from '../types'

function ToggleEnabled({
  projectId,
  commitUuid,
  isMerged,
  trigger,
}: {
  projectId: number
  commitUuid: string
  isMerged: boolean
  trigger: DocumentTrigger
}) {
  const { toggleEnabled, isEnabling } = useDocumentTriggers({
    projectId,
    commitUuid,
  })
  const onToggleEnabled = useCallback(() => {
    toggleEnabled({
      projectId,
      commitUuid,
      triggerUuid: trigger.uuid,
      enabled: !trigger.enabled,
    })
  }, [toggleEnabled, projectId, commitUuid, trigger.uuid, trigger.enabled])
  const toogleComp = (
    <SwitchToggle
      className='no-hover'
      disabled={!isMerged || isEnabling}
      checked={trigger.enabled}
      onCheckedChange={onToggleEnabled}
    />
  )

  if (!isMerged) {
    return (
      <Tooltip asChild trigger={<div>{toogleComp}</div>}>
        A trigger can only be enabled or disabled in the Live commit
      </Tooltip>
    )
  }

  return toogleComp
}

export function TriggerCardActions({
  trigger,
  commit,
  isOpen,
  handleRun,
  onEdit,
}: {
  trigger: DocumentTrigger
  commit: Commit
  isOpen: boolean
  handleRun: (props: RunTriggerProps) => void
  onEdit: () => void
}) {
  const canEnable = trigger.triggerStatus === DocumentTriggerStatus.Deployed
  const canRun = RUNNABLE_TRIGGERS.includes(trigger.triggerType)
  const canSeeEvents =
    !canRun && trigger.triggerStatus !== DocumentTriggerStatus.Pending

  const onRun = useCallback(() => {
    handleRun({
      trigger,
      parameters: {},
    })
  }, [handleRun, trigger])

  return (
    <div className='flex flex-row gap-2 items-center'>
      {canEnable ? (
        <ToggleEnabled
          projectId={commit.projectId}
          commitUuid={commit.uuid}
          isMerged={!!commit.mergedAt}
          trigger={trigger}
        />
      ) : null}
      {canRun ? (
        <Button
          fancy
          className='no-hover'
          variant='outline'
          iconProps={{ name: 'circlePlay' }}
          onClick={onRun}
        >
          Run
        </Button>
      ) : null}
      <Button fancy className='no-hover' variant='outline' onClick={onEdit}>
        {commit.mergedAt ? 'View' : 'Edit'}
      </Button>
      {canSeeEvents ? (
        <div className='min-h-button flex items-center justify-center'>
          <Icon
            name={isOpen ? 'chevronUp' : 'chevronDown'}
            color='foregroundMuted'
          />
        </div>
      ) : null}
    </div>
  )
}
