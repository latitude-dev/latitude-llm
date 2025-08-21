import { MouseEvent, ReactNode, useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { cn } from '@latitude-data/web-ui/utils'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { TriggerEventsList } from '../TriggerEventsList'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { DocumentTriggerType } from '@latitude-data/constants'
import { OnRunTriggerFn } from '../TriggersList'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'

function ToggleEnabled({
  projectId,
  commitUuid,
  isLive,
  trigger,
}: {
  projectId: number
  commitUuid: string
  isLive: boolean
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
      disabled={!isLive || isEnabling}
      checked={trigger.enabled}
      onCheckedChange={onToggleEnabled}
    />
  )

  if (!isLive) {
    return (
      <Tooltip asChild trigger={<div>{toogleComp}</div>}>
        A trigger can only be enabled or disabled in the Live commit
      </Tooltip>
    )
  }

  return toogleComp
}

function EditTriggerButton({
  projectId,
  commitUuid,
  trigger,
  isLive,
}: {
  projectId: number
  commitUuid: string
  trigger: DocumentTrigger
  isLive: boolean
}) {
  const editLink = useMemo(
    () =>
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .preview.triggers.edit(trigger.uuid).root,
    [projectId, commitUuid, trigger.uuid],
  )

  if (isLive) {
    return (
      <>
        <Tooltip
          asChild
          trigger={
            <Button lookDisabled variant='outline' fancy>
              Edit
            </Button>
          }
        >
          You need to create a new version to edit triggers
        </Tooltip>
      </>
    )
  }

  return (
    <Link href={editLink}>
      <Button fancy variant='outline'>
        Edit
      </Button>
    </Link>
  )
}

export function TriggerWrapper({
  image,
  title,
  description,
  descriptionLoading = false,
  trigger,
  document,
  openTriggerUuid,
  setOpenTriggerUuid,
  onRunTrigger,
}: {
  document: DocumentVersion
  trigger: DocumentTrigger
  title: string
  description: string
  descriptionLoading?: boolean
  image: ReactNode
  openTriggerUuid: string | null
  setOpenTriggerUuid: ReactStateDispatch<string | null>
  onRunTrigger: OnRunTriggerFn
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const canSeeEvents = trigger.triggerType !== DocumentTriggerType.Scheduled
  const canRunTrigger = trigger.triggerType === DocumentTriggerType.Scheduled
  const onToggleEventList = useCallback(() => {
    if (!canSeeEvents) return

    setOpenTriggerUuid(trigger.uuid === openTriggerUuid ? null : trigger.uuid)
  }, [setOpenTriggerUuid, trigger, openTriggerUuid, canSeeEvents])
  const open = trigger.uuid === openTriggerUuid
  const avoidOpenEvents = useCallback((e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
  }, [])

  const handleRunTrigger = useCallback(() => {
    if (!canRunTrigger) return

    // Schedule triggers don't have parameters
    onRunTrigger({ document, parameters: {} })
  }, [onRunTrigger, document, canRunTrigger])
  return (
    <div className='flex flex-col'>
      <div
        className={cn(
          'w-full p-4 flex flex-row justify-between items-center gap-4',
          {
            'border-b border-border': open,
            'cursor-pointer': canSeeEvents,
          },
        )}
        onClick={onToggleEventList}
      >
        <div className='flex flex-row gap-4'>
          <div className='flex-none'>{image}</div>
          <div className='flex-1 flex flex-col gap-0'>
            <Text.H4M>{title}</Text.H4M>
            {descriptionLoading ? (
              <Skeleton className='w-24 h-5' />
            ) : (
              <Text.H5 color='foregroundMuted'>{description}</Text.H5>
            )}
          </div>
        </div>
        <div className='flex flex-row gap-x-4'>
          <div
            onClick={avoidOpenEvents}
            className='flex flex-row items-center gap-x-4 '
          >
            <ToggleEnabled
              projectId={project.id}
              commitUuid={commit.uuid}
              isLive={isLive}
              trigger={trigger}
            />
            <EditTriggerButton
              projectId={project.id}
              commitUuid={commit.uuid}
              trigger={trigger}
              isLive={isLive}
            />
            {canRunTrigger ? (
              <Button
                fancy
                variant='outline'
                iconProps={{ name: 'circlePlay' }}
                onClick={handleRunTrigger}
              >
                Run
              </Button>
            ) : null}
          </div>
          {canSeeEvents ? (
            <div className='min-h-button flex items-center justify-center'>
              <Icon
                name={open ? 'chevronUp' : 'chevronDown'}
                color='foregroundMuted'
              />
            </div>
          ) : null}
        </div>
      </div>
      {open ? (
        <TriggerEventsList
          document={document}
          trigger={trigger}
          onRunTrigger={onRunTrigger}
        />
      ) : null}
    </div>
  )
}
