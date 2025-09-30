import { useState } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { testWebhookAction } from '$/actions/webhooks/testWebhook'
import useLatitudeAction from '$/hooks/useLatitudeAction'

interface UseTestWebhookOptions {
  getUrl: () => string | null
}

export function useTestWebhook({ getUrl }: UseTestWebhookOptions) {
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false)
  const { toast } = useToast()

  const { execute: executeTestWebhook } = useLatitudeAction(testWebhookAction)
  const testEndpoint = async () => {
    const url = getUrl()

    if (!url) {
      toast({
        title: 'Error',
        description: 'Please enter a URL first',
        variant: 'destructive',
      })
      return
    }

    setIsTestingEndpoint(true)
    try {
      const [_, error] = await executeTestWebhook({ url })
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Test webhook was sent successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to test webhook',
        variant: 'destructive',
      })
    } finally {
      setIsTestingEndpoint(false)
    }
  }

  return {
    isTestingEndpoint,
    testEndpoint,
  }
}
