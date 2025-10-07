import { useState, useCallback } from 'react'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { OnTriggerCreated } from '../../../types'
import {
  SelectDocument,
  useDocumentSelection,
} from '../../../components/SelectDocument'
import { TriggerWrapper } from '../TriggerWrapper'
import { ScheduledTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { CronFormField } from '@latitude-data/web-ui/organisms/CronInput'
import { CLIENT_TIMEZONE } from '$/lib/constants'

const DEFAULT_CONFIG: ScheduledTriggerConfiguration = {
  cronExpression: '* * * * *',
  timezone: CLIENT_TIMEZONE,
}

export function ScheduleTrigger({
  onTriggerCreated,
}: {
  onTriggerCreated: OnTriggerCreated
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const documentSelection = useDocumentSelection()
  const document = documentSelection.document
  const { create, isCreating } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onCreated: (trigger) => {
        onTriggerCreated(trigger)
      },
    },
  )
  const documentUuid = document?.documentUuid
  const [config, setConfig] =
    useState<ScheduledTriggerConfiguration>(DEFAULT_CONFIG)

  const onCreate = useCallback(async () => {
    if (!documentUuid) return

    create({
      documentUuid,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: config,
    })
  }, [create, documentUuid, config])

  return (
    <TriggerWrapper
      title='Schedule Trigger'
      description='Enables running this prompt in a fixed schedule. For example, once per day.'
    >
      <SelectDocument
        options={documentSelection.options}
        document={document}
        onSelectDocument={documentSelection.onSelectDocument}
      />
      {document ? (
        <>
          <CronFormField
            value={config.cronExpression}
            onChange={(newValue: string) =>
              setConfig({ ...config, cronExpression: newValue })
            }
            disabled={isCreating}
          />

          <Button fancy onClick={onCreate} disabled={isCreating}>
            {isCreating ? 'Creating trigger...' : 'Create trigger'}
          </Button>
        </>
      ) : null}
    </TriggerWrapper>
  )
}
