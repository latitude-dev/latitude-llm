import buildMetatags from '$/app/_lib/buildMetatags'
import { DatadogProvider } from '$/components/Providers/DatadogProvider'
import { SWRProvider } from '$/components/Providers/SWRProvider'
import { fontMono, fontSans, fontDisplay } from '$/helpers/fonts'
import { ToastProvider } from '@latitude-data/web-ui/atoms/Toast'
import { TooltipProvider } from '@latitude-data/web-ui/atoms/Tooltip'
import { THEMES } from '@latitude-data/web-ui/molecules/TrippleThemeToggle'
import { ThemeProvider } from '@latitude-data/web-ui/providers'
import '@latitude-data/web-ui/styles.css'
import 'katex/dist/katex.min.css'
import NextTopLoader from 'nextjs-toploader'
import type { ReactNode } from 'react'
import 'react-data-grid/lib/styles.css'

export const metadata = buildMetatags({
  title: 'The Open-Source LLM Development Platform',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html
      lang='en'
      translate='no'
      suppressHydrationWarning
      className='w-full h-full'
    >
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body
        className={`w-full h-full ${fontSans.variable} ${fontMono.variable} ${fontDisplay.variable} font-sans`}
      >
        <NextTopLoader showSpinner={false} />
        <DatadogProvider>
          <SWRProvider
            config={{
              revalidateOnFocus: false,
              dedupingInterval: 5000, // Prevent duplicate requests within 5s
              provider: () => {
                // Limit cache size to prevent memory issues
                const map = new Map()
                const maxSize = 100 // Keep only 100 most recent cache entries
                return {
                  get: (key: string) => map.get(key),
                  set: (key: string, value: any) => {
                    if (map.size >= maxSize) {
                      // Remove oldest entry when cache is full
                      const firstKey = map.keys().next().value
                      map.delete(firstKey)
                    }
                    map.set(key, value)
                  },
                  delete: (key: string) => map.delete(key),
                  keys: () => Array.from(map.keys()),
                } as any
              },
            }}
          >
            <ThemeProvider
              attribute='class'
              defaultTheme='light'
              themes={THEMES as unknown as string[]}
              enableSystem
              disableTransitionOnChange
            >
              <TooltipProvider>{children}</TooltipProvider>
            </ThemeProvider>
          </SWRProvider>
        </DatadogProvider>
        <ToastProvider duration={5000} />
      </body>
    </html>
  )
}
