import useIntegrations from '$/stores/integrations'
import { PipedreamIntegration } from '@latitude-data/core/browser'
import { useConnectToPipedreamApp } from './useConnectToPipedreamApp'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { useCallback, useState } from 'react'
import useLatitudeAction from './useLatitudeAction'
import { updateIntegrationConfigurationAction } from '$/actions/integrations/updateConfiguration'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

export function useConfigureIntegrationAccount({
  integration,
}: {
  integration: PipedreamIntegration
}) {
  const { mutate } = useIntegrations()
  const { toast } = useToast()

  const { data: app, isLoading: isLoadingApp } = usePipedreamApp(
    integration.configuration.appName,
  )
  const {
    connect,
    externalUserId,
    isLoading: isLoadingConnect,
  } = useConnectToPipedreamApp(app)

  const { execute: updateIntegrationConfiguration } = useLatitudeAction(
    updateIntegrationConfigurationAction,
  )

  const isLoading = isLoadingApp || isLoadingConnect

  const [isUpdating, setIsUpdating] = useState(false)

  const showError = useCallback(
    (description: string, title = 'Error') => {
      setIsUpdating(false)
      toast({
        variant: 'destructive',
        title,
        description,
      })
    },
    [toast, setIsUpdating],
  )

  const connectAccount = useCallback(async () => {
    setIsUpdating(true)
    if (!app) {
      showError('Please select an app')
      return
    }
    if (!externalUserId) {
      showError(
        'Authentication token not available. Please wait a few seconds and try again.',
      )
      return
    }

    const [connectionId, connectionError] = await connect()
    if (connectionError) {
      showError(
        connectionError.message || 'Failed to connect to the app',
        'Connection Error',
      )
      return
    }

    const configuration = {
      appName: app.name_slug,
      connectionId,
      externalUserId,
      authType: app.auth_type,
      oauthAppId: app.id,
      metadata: {
        displayName: app.name,
        imageUrl: app.img_src,
      },
    }

    const [updatedIntegration, updateError] =
      await updateIntegrationConfiguration({
        integrationName: integration.name,
        configuration,
      })

    if (updateError) {
      showError(
        updateError.message || 'Failed to update integration configuration',
        'Configuration Error',
      )
      return
    }

    await mutate((integrations) =>
      integrations?.map((i) => {
        if (i.id !== integration.id) return i
        return updatedIntegration as PipedreamIntegration
      }),
    )

    toast({
      title: 'Integration account connected successfully',
      description: 'You can now use this integration in your project.',
    })

    setIsUpdating(false)
  }, [
    app,
    connect,
    externalUserId,
    integration.name,
    integration.id,
    mutate,
    updateIntegrationConfiguration,
    showError,
    toast,
  ])

  return {
    connectAccount,
    isLoading,
    isUpdating,
  }
}
