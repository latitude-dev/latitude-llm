import { useRef, useCallback, useMemo } from 'react'
import { createCustomerPortalAction } from '$/actions/billing/createCustomerPortalAction'
import { useSession } from '$/components/Providers/SessionProvider'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from './useLatitudeAction'

const ERROR_MESSAGE =
  "We couldn't access the billing portal. Please reach out to our support team — we're happy to help!"

export function useBillingPortal() {
  const { toast } = useToast()
  const { workspace } = useSession()
  const windowRef = useRef<Window | null>(null)

  const { execute: createPortal, isPending } = useLatitudeAction(
    createCustomerPortalAction,
    {
      onSuccess: ({ data }) => {
        const url = data?.url
        const newWindow = windowRef.current
        windowRef.current = null

        if (!url || !newWindow) {
          newWindow?.close()
          toast({
            variant: 'destructive',
            title: 'Error',
            description: ERROR_MESSAGE,
          })
          return
        }
        newWindow.location.href = url
      },
      onError: () => {
        windowRef.current?.close()
        windowRef.current = null
        toast({
          variant: 'destructive',
          title: 'Error',
          description: ERROR_MESSAGE,
        })
      },
    },
  )

  /**
   * Handles the click event to open the billing portal
   * - Opens a new window with a loading indicator
   * - Initiates the creation of a customer portal session
   *
   * This is needed to avoid popup blockers by opening the window
   */
  const onClick = useCallback(() => {
    const newWindow = window.open('about:blank', '_blank')
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Loading...</title>
            <style>
              body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
              }
              .loader {
                text-align: center;
              }
              .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #e0e0e0;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 16px;
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="loader">
              <div class="spinner"></div>
              <p>Loading billing portal...</p>
            </div>
          </body>
        </html>
      `)
      newWindow.document.close()
    }
    windowRef.current = newWindow
    createPortal()
  }, [createPortal])

  return useMemo(
    () => ({
      onClick,
      isLoading: isPending,
      hasBillingPortal: workspace.hasBillingPortal,
    }),
    [onClick, isPending, workspace.hasBillingPortal],
  )
}
