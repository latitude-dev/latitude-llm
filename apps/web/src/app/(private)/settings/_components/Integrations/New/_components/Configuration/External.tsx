'use client'
import { IntegrationType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { pingCustomMcpAction } from '$/actions/integrations/pingCustomMcpServer'
import { probeAuthRequirementsAction } from '$/actions/integrations/probeAuthRequirements'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'

type HeaderEntry = { key: string; value: string }

type AuthDetection = {
  checked: boolean
  requiresOAuth: boolean
}

type AuthMethod = 'oauth' | 'bearer'

export const ExternalIntegrationConfiguration = forwardRef<
  {
    validate: () => Promise<IntegrationConfiguration>
  },
  {}
>((_, ref) => {
  const { execute, isPending } = useLatitudeAction(pingCustomMcpAction)
  const { execute: probeAuth } = useLatitudeAction(probeAuthRequirementsAction)
  const [url, setUrl] = useState<string>('')
  const [headers, setHeaders] = useState<HeaderEntry[]>([])
  const [isProbing, setIsProbing] = useState(false)
  const [authDetection, setAuthDetection] = useState<AuthDetection>({
    checked: false,
    requiresOAuth: false,
  })
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth')
  const [bearerToken, setBearerToken] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isValidUrl = useCallback((urlString: string): boolean => {
    if (!urlString.trim()) return false
    try {
      const url = new URL(urlString)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  const probeServer = useCallback(
    async (urlToProbe: string) => {
      if (!urlToProbe.trim()) {
        setAuthDetection({ checked: false, requiresOAuth: false })
        return
      }

      setIsProbing(true)
      const [result] = await probeAuth({ url: urlToProbe })
      setIsProbing(false)

      if (result) {
        setAuthDetection({
          checked: true,
          requiresOAuth: result.requiresOAuth,
        })
      } else {
        setAuthDetection({ checked: true, requiresOAuth: false })
      }
    },
    [probeAuth],
  )

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl)
      setAuthDetection({ checked: false, requiresOAuth: false })

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      if (!isValidUrl(newUrl)) return

      debounceRef.current = setTimeout(() => {
        probeServer(newUrl)
      }, 500)
    },
    [probeServer, isValidUrl],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const headersRecord = headers.reduce(
    (acc, { key, value }) => {
      if (key.trim()) {
        acc[key.trim()] = value
      }
      return acc
    },
    {} as Record<string, string>,
  )

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }])
  }

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index))
  }

  const updateHeader = (
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    const newHeaders = [...headers]
    newHeaders[index]![field] = value
    setHeaders(newHeaders)
  }

  useImperativeHandle(
    ref,
    () => ({
      validate: async () => {
        if (!url) throw new Error('URL is required')

        // Use cached detection if available, otherwise probe again
        let serverRequiresOAuth = authDetection.requiresOAuth
        if (!authDetection.checked) {
          const [probeResult] = await probeAuth({ url })
          serverRequiresOAuth = probeResult?.requiresOAuth ?? false
        }

        // If user chose bearer token auth, merge it with other headers and skip OAuth
        const useBearerToken =
          serverRequiresOAuth && authMethod === 'bearer' && bearerToken.trim()
        const finalHeaders = useBearerToken
          ? { ...headersRecord, Authorization: `Bearer ${bearerToken.trim()}` }
          : headersRecord

        // Use OAuth flow only if server requires it AND user didn't choose bearer token
        const useOAuth = serverRequiresOAuth && !useBearerToken

        if (!useOAuth) {
          const [_, error] = await execute({ url, headers: finalHeaders })
          if (error) throw error
        }

        return {
          type: IntegrationType.ExternalMCP,
          configuration: {
            url,
            useOAuth,
            headers:
              Object.keys(finalHeaders).length > 0 ? finalHeaders : undefined,
          },
        }
      },
    }),
    [
      url,
      headersRecord,
      authDetection,
      authMethod,
      bearerToken,
      execute,
      probeAuth,
    ],
  )

  return (
    <div className='flex flex-col gap-4'>
      <Input
        required
        name='url'
        label='URL'
        description='URL to your external MCP Server.'
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
      />
      {isProbing && (
        <div className='flex items-center gap-2'>
          <Icon name='loader' spin color='foregroundMuted' />
          <Text.H5 color='foregroundMuted'>Checking server...</Text.H5>
        </div>
      )}
      {isPending && (
        <div className='flex items-center gap-2'>
          <Icon name='loader' spin color='foregroundMuted' />
          <Text.H5 color='foregroundMuted'>Testing connection...</Text.H5>
        </div>
      )}
      {authDetection.checked && authDetection.requiresOAuth && (
        <>
          <Alert
            variant='default'
            title='Authentication Required'
            description='This server requires authentication. Choose how you want to authenticate.'
          />
          <TabSelect
            value={authMethod}
            options={[
              { value: 'oauth', label: 'OAuth' },
              { value: 'bearer', label: 'Bearer token' },
            ]}
            onChange={setAuthMethod}
          />
          {authMethod === 'oauth' && (
            <Text.H6 color='foregroundMuted'>
              You&apos;ll be redirected to authorize after creating the
              integration.
            </Text.H6>
          )}
          {authMethod === 'bearer' && (
            <Input
              required
              name='bearerToken'
              label='Bearer Token'
              description="Enter the access token from the server's dashboard or API."
              placeholder='Your access token'
              type='password'
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
            />
          )}
        </>
      )}
      {authDetection.checked && !authDetection.requiresOAuth && (
        <CollapsibleBox
          title='Advanced configuration'
          icon='settings'
          expandedContent={
            <div className='flex flex-col gap-4 w-full'>
              <Text.H6 color='foregroundMuted'>
                Add custom headers to include with every request (e.g.,
                x-api-key for authentication).
              </Text.H6>
              {headers.map((header, index) => (
                <div key={index} className='flex items-center gap-2'>
                  <Input
                    placeholder='Header name (e.g., x-api-key)'
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value)}
                    className='flex-1'
                  />
                  <Input
                    placeholder='Header value'
                    value={header.value}
                    onChange={(e) =>
                      updateHeader(index, 'value', e.target.value)
                    }
                    className='flex-1'
                    type='password'
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='small'
                    onClick={() => removeHeader(index)}
                    iconProps={{
                      name: 'trash',
                      color: 'destructiveMutedForeground',
                    }}
                  />
                </div>
              ))}
              <Button
                type='button'
                variant='outline'
                onClick={addHeader}
                iconProps={{ name: 'plus' }}
              >
                Add Header
              </Button>
            </div>
          }
        />
      )}
    </div>
  )
})
