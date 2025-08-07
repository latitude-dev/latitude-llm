import { FormEvent, useCallback } from 'react'
import { App } from '@pipedream/sdk/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import { IntegrationType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useIntegrations from '$/stores/integrations'
import { useTriggersModalContext } from '../contexts/triggers-modal-context'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

interface IntegrationConnectionFormProps {
  app: App
}

export function IntegrationConnectionForm({
  app,
}: IntegrationConnectionFormProps) {
  const { toast } = useToast()
  const { setSelectedIntegration } = useTriggersModalContext()
  const { connect, externalUserId } = useConnectToPipedreamApp(app)
  const { create } = useIntegrations()

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      const integrationName = (e.target as HTMLFormElement).integrationName
        .value

      if (!externalUserId) {
        throw new Error(
          'Authentication token not available. Please wait a few seconds and try again.',
        )
      }

      const [connectionId, error] = await connect()
      if (error) throw error

      const [integration, createError] = await create({
        type: IntegrationType.Pipedream,
        configuration: {
          appName: app.name_slug,
          connectionId,
          externalUserId,
          authType: app.auth_type,
          oauthAppId: app.id,
          metadata: {
            displayName: app.name,
            imageUrl: app.img_src,
          },
        },
        name: integrationName,
      })

      if (createError) {
        toast({
          title: 'Error creating integration',
          description: createError.message,
          variant: 'destructive',
        })
      }
      if (!integration) return

      setSelectedIntegration((prev) => ({
        id: integration.id,
        name: integration.name,
        type: IntegrationType.Pipedream,
        pipedream: {
          app: {
            name: app.name,
          },
          trigger: prev?.pipedream?.trigger,
        },
      }))
    },
    [app, connect, externalUserId, create, setSelectedIntegration, toast],
  )

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5 centered color='foregroundMuted'>
        Let's first connect {app.name} to Latitude
      </Text.H5>
      <form onSubmit={handleSubmit}>
        <FormWrapper>
          <Input
            required
            name='integrationName'
            label='Integration name'
            pattern='[a-z0-9\-]+'
            title='Only lowercase letters, numbers, and hyphens are allowed. No spaces or uppercase letters.'
            placeholder='my-integration-name'
          />
          <Button fancy fullWidth type='submit' disabled={!externalUserId}>
            Connect
          </Button>
        </FormWrapper>
      </form>
    </div>
  )
}
