import { FormEvent, useCallback } from 'react'
import { App } from '@pipedream/sdk/browser'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import { IntegrationType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useIntegrations from '$/stores/integrations'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { IntegrationDto } from '@latitude-data/core/browser'

const NO_TOKEN_MSG =
  'Authentication token not available. Please wait a few seconds and try again.'

/**
 * This connection is only for triggers.
 * If you want to use for connecting tools be aware you need to
 * set `withTools: true` in the `useIntegrations` hook.
 */
export function PipedreamConnect({
  app,
  onAccountConnected,
  onCancel,
  showCancel,
}: {
  app: App
  onAccountConnected: (account: IntegrationDto) => void
  onCancel: () => void
  showCancel: boolean
}) {
  const { toast } = useToast()
  const { connect, externalUserId } = useConnectToPipedreamApp(app)
  const { create } = useIntegrations({
    withTriggers: true,
  })

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      const integrationName = (e.target as HTMLFormElement).integrationName
        .value

      if (!externalUserId) {
        toast({
          title: 'Authentication failed',
          description: NO_TOKEN_MSG,
          variant: 'destructive',
        })
        throw new Error(NO_TOKEN_MSG)
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

      if (createError || !integration) {
        toast({
          title: 'Error creating integration',
          description: createError
            ? createError.message
            : 'Unknown error occurred',
          variant: 'destructive',
        })
      }

      onAccountConnected(integration as IntegrationDto)
    },
    [app, connect, externalUserId, create, toast, onAccountConnected],
  )

  return (
    <div className='flex flex-col gap-4'>
      <form onSubmit={handleSubmit}>
        <FormWrapper>
          <Input
            required
            name='integrationName'
            pattern='[a-z0-9\-]+'
            description='Only lowercase letters, numbers, and hyphens are allowed. No spaces or uppercase letters.'
            placeholder='my-account-name'
          />
          <div className='flex flex-row gap-x-2'>
            {showCancel ? (
              <Button
                fullWidth
                size='small'
                variant='outline'
                type='button'
                onClick={onCancel}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              fullWidth
              fancy
              size='small'
              type='submit'
              disabled={!externalUserId}
            >
              Connect
            </Button>
          </div>
        </FormWrapper>
      </form>
    </div>
  )
}
