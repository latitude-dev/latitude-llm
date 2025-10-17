import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTriggers from '$/stores/documentTriggers'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { type IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import {
  type PipedreamComponent,
  type PipedreamComponentType,
} from '@latitude-data/core/constants'

export function useCreateDocumentTrigger({
  account,
  triggerComponent,
  onTriggerCreated,
  document,
  initialDocument,
  payloadParameters,
}: {
  triggerComponent: PipedreamComponent<PipedreamComponentType.Trigger>
  onTriggerCreated: (documentTrigger: DocumentTrigger) => void
  payloadParameters: string[]
  account?: IntegrationDto
  document?: DocumentVersion
  initialDocument?: DocumentVersion
}) {
  const { toast } = useToast()
  const [configuredProps, setConfiguredProps] = useState<
    ConfiguredProps<ConfigurableProps>
  >({})
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { create: createTrigger, isCreating } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: initialDocument?.documentUuid,
  })
  const onCreateTrigger = useCallback(async () => {
    if (!account || !document) return

    const [trigger, error] = await createTrigger({
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Integration,
      configuration: {
        integrationId: account.id,
        componentId: triggerComponent.key,
        properties: configuredProps,
        payloadParameters,
      },
    })

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error creating trigger',
        description: error?.message,
      })
      return
    }

    onTriggerCreated(trigger)
  }, [
    toast,
    account,
    document,
    triggerComponent,
    configuredProps,
    payloadParameters,
    createTrigger,
    onTriggerCreated,
  ])

  return useMemo(
    () => ({
      setConfiguredProps,
      configuredProps,
      onCreateTrigger,
      isCreating,
    }),
    [setConfiguredProps, onCreateTrigger, isCreating, configuredProps],
  )
}
