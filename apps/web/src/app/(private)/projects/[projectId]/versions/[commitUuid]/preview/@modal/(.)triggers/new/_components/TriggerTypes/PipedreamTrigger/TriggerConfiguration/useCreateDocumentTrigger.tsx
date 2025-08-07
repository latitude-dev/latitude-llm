import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import type {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import type { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { DocumentTriggerType } from '@latitude-data/constants'

export function useCreateDocumentTrigger({
  account,
  triggerComponent,
  onTriggerCreated,
  document,
  payloadParameters,
}: {
  triggerComponent: PipedreamComponent<PipedreamComponentType.Trigger>
  onTriggerCreated: (documentTrigger: DocumentTrigger) => void
  payloadParameters: string[]
  account?: IntegrationDto
  document?: DocumentVersion
}) {
  const { toast } = useToast()
  const [configuredProps, setConfiguredProps] = useState<ConfiguredProps<ConfigurableProps>>({})
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { create: createTrigger, isCreating } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
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
    [onCreateTrigger, isCreating, configuredProps],
  )
}
