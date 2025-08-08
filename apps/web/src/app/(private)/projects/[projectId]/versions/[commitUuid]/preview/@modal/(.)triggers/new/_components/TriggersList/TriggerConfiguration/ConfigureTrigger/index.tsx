import { FormEvent, useCallback, useState } from 'react'
import { PipedreamComponentPropsForm } from '$/components/Pipedream/PipedreamPropsForm'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import type {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'

export function ConfigureTrigger({
  account,
  triggerComponent,
  onTriggerCreated,
  document,
  payloadParameters,
}: {
  account: IntegrationDto
  triggerComponent: PipedreamComponent<PipedreamComponentType.Trigger>
  onTriggerCreated: (documentTrigger: DocumentTrigger) => void
  document: DocumentVersion
  payloadParameters: string[]
}) {
  const { toast } = useToast()
  const [configuredProps, setConfiguredProps] = useState<
    ConfiguredProps<ConfigurableProps>
  >({})
  const { project } = useCurrentProject()
  const { create: createTrigger, isCreating } = useDocumentTriggers({
    projectId: project.id,
  })
  const onCreateTrigger = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      const [trigger, error] = await createTrigger({
        documentUuid: document.documentUuid,
        trigger: {
          type: DocumentTriggerType.Integration,
          configuration: {
            integrationId: account.id,
            componentId: triggerComponent.key,
            properties: configuredProps,
            payloadParameters,
          },
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
    },
    [
      toast,
      account,
      document,
      triggerComponent,
      configuredProps,
      payloadParameters,
      createTrigger,
      onTriggerCreated,
    ],
  )
  return (
    <form onSubmit={onCreateTrigger}>
      <FormWrapper>
        <PipedreamComponentPropsForm
          integration={account}
          component={triggerComponent}
          values={configuredProps}
          onChange={setConfiguredProps}
          disabled={isCreating}
        />

        <Button fullWidth fancy type='submit' disabled={isCreating}>
          Create trigger
        </Button>
      </FormWrapper>
    </form>
  )
}
