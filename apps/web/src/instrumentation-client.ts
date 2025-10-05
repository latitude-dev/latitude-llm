// This file configures DataDog RUM (Real User Monitoring) for browser-side monitoring
import { datadogRum, Site } from '@datadog/browser-rum'
import { envClient } from './envClient'

// Initialize DataDog RUM according to the official documentation
if (
  typeof window !== 'undefined' &&
  envClient.NEXT_PUBLIC_DATADOG_APPLICATION_ID &&
  envClient.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
) {
  datadogRum.init({
    applicationId: envClient.NEXT_PUBLIC_DATADOG_APPLICATION_ID,
    clientToken: envClient.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    site: (envClient.NEXT_PUBLIC_DATADOG_SITE as Site) || 'datadoghq.com',
    service: 'latitude-llm-web',
    env: envClient.NEXT_PUBLIC_NODE_ENV || 'development',
    version: '1.0.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 10,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input',
  })

  datadogRum.startSessionReplayRecording()
}

// Enhanced client error capture function
export const captureClientError = (
  error: Error,
  context?: Record<string, any>,
) => {
  console.error('Client error:', error)

  if (typeof window !== 'undefined' && datadogRum.getInternalContext()) {
    datadogRum.addError(error, {
      ...context,
      source: 'custom',
    })
  }
}

// Enhanced client message capture function
export const captureClientMessage = (
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  context?: Record<string, any>,
) => {
  console.log(`[${level}] ${message}`)

  if (typeof window !== 'undefined' && datadogRum.getInternalContext()) {
    datadogRum.addAction('custom_message', {
      message,
      level,
      ...context,
    })
  }
}
