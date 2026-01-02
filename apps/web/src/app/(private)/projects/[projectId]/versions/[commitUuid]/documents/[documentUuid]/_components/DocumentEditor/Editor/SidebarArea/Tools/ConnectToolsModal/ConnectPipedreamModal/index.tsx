import { useCallback, useState, FormEvent, useMemo } from 'react'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  AppComponentsCard,
  AppComponentsHeader,
} from '$/components/Pipedream/PipedreamCard'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import useIntegrations from '$/stores/integrations'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { ValidIntegration } from '$/app/(private)/settings/_components/Integrations/New'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { App } from '@latitude-data/core/constants'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import { IntegrationType } from '@latitude-data/constants'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { PipedreamIntegration } from '@latitude-data/core/schema/models/types/Integration'
import { usePipedreamApp } from '$/stores/pipedreamApp'

export function ConnectPipedreamModal({
  onOpenChange,
  onConnect,
  app,
}: {
  onOpenChange: (open: boolean) => void
  onConnect: (integration: PipedreamIntegration) => void
  app: App
}) {
  const [integrationName, setIntegrationName] = useState<string>('')
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const nameErrors = useMemo<string[] | undefined>(() => {
    const errors = []
    if (integrationName.includes(' ')) {
      errors.push('Name cannot contain spaces')
    }
    if (integrationName.includes('/')) {
      errors.push('Name cannot contain slashes')
    }
    return errors.length ? errors : undefined
  }, [integrationName])
  const { create } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  const { data: workspace } = useCurrentWorkspace()
  const { connect } = useConnectToPipedreamApp(app)
  const [error, setError] = useState<Error | undefined>(undefined)
  const { data: appData, isLoading: isLoadingAppData } = usePipedreamApp(
    app.nameSlug,
    { withConfig: false },
  )
  const hasTools = appData?.tools && appData.tools.length > 0
  const validate: () => Promise<ValidIntegration> = useCallback(async () => {
    if (!workspace) {
      throw new Error(
        'Authentication token not available. Please wait a few seconds and try again.',
      )
    }

    const [connectionId, error] = await connect()
    if (error) throw error

    return {
      type: IntegrationType.Pipedream,
      configuration: {
        appName: app.nameSlug,
        connectionId,
        externalUserId: String(workspace.id),
        authType: app.authType ?? 'none',
        oauthAppId: app.id,
        metadata: {
          displayName: app.name,
          imageUrl: app.imgSrc,
        },
      },
    } as unknown as ValidIntegration
  }, [app, connect, workspace])
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setIsCreating(true)
      setError(undefined)
      let integration: ValidIntegration

      try {
        integration = await validate()
      } catch (err) {
        setIsCreating(false)
        setError(err as Error)
        return
      }

      const [result, createError] = await create({
        ...integration,
        name: integrationName,
      })
      setIsCreating(false)

      if (createError) {
        toast({
          title: 'Error creating integration',
          description: createError.message,
          variant: 'destructive',
        })
        return
      }

      onConnect(result.integration as PipedreamIntegration)
    },
    [create, integrationName, validate, onConnect],
  )
  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Create Integration'
      description='Integrations allow your prompt to interact with external services.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='createIntegrationForm'
            type='submit'
            isLoading={isCreating}
            disabled={isLoadingAppData || !hasTools || isCreating}
            iconProps={{
              name: 'unplug',
            }}
          >
            {isCreating ? 'Connecting...' : 'Connect & Create'}
          </Button>
        </>
      }
    >
      <form
        id='createIntegrationForm'
        onSubmit={handleSubmit}
        className='flex flex-col gap-4'
      >
        <Input
          required
          type='text'
          name='name'
          label='Name'
          disabled={isCreating}
          description="This is the name you'll use in the prompt editor to refer to use this integration and model."
          placeholder='my_integration'
          onChange={(event) => setIntegrationName(event.target.value)}
          value={integrationName}
          errors={nameErrors}
        />

        {!isLoadingAppData && !hasTools ? (
          <Alert
            variant='warning'
            title='No tools available'
            description='Sorry, this integration does not have any tools available for use.'
          />
        ) : (
          <AppComponentsCard
            title='Tools'
            icon='blocks'
            isLoading={isLoadingAppData}
            components={appData?.tools as any}
            header={
              <AppComponentsHeader
                label='tools'
                isLoading={isLoadingAppData}
                count={appData?.tools?.length}
              />
            }
          />
        )}
        {error && (
          <Alert
            variant='destructive'
            title={error.name}
            description={error.message}
          />
        )}
      </form>
    </Modal>
  )
}
