import buildMetatags from '$/app/_lib/buildMetatags'
import { FeatureFlagProvider } from '$/components/Providers/FeatureFlags'
import {
  FEATURE_FLAGS,
  FEATURE_FLAGS_CONDITIONS,
  ResolvedFeatureFlags,
} from '$/components/Providers/FeatureFlags/flags'
import { SWRProvider } from '$/components/Providers/SWRProvider'
import { fontMono, fontSans } from '$/helpers/fonts'
import { env } from '@latitude-data/env'
import { ToastProvider } from '@latitude-data/web-ui/atoms/Toast'
import { TooltipProvider } from '@latitude-data/web-ui/atoms/Tooltip'
import { THEMES } from '@latitude-data/web-ui/molecules/TrippleThemeToggle'
import { ThemeProvider } from '@latitude-data/web-ui/providers'
import '@latitude-data/web-ui/styles.css'
import NextTopLoader from 'nextjs-toploader'
import { ReactNode } from 'react'
import 'react-data-grid/lib/styles.css'

export const metadata = buildMetatags({
  title: 'The Open-Source LLM Development Platform',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const initialFeatureFlags: ResolvedFeatureFlags = {
    [FEATURE_FLAGS.inviteOnly]: { enabled: env.INVITE_ONLY === true },
    [FEATURE_FLAGS.evaluationsV2]: {
      enabled:
        FEATURE_FLAGS_CONDITIONS.evaluationsV2.workspaceIds === 'all' ||
        env.ENABLE_ALL_FLAGS === true,
    },
    [FEATURE_FLAGS.experiments]: {
      enabled:
        FEATURE_FLAGS_CONDITIONS.experiments.workspaceIds === 'all' ||
        env.ENABLE_ALL_FLAGS === true,
    },
  }

  return (
    <html lang='en' translate='no' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
        <NextTopLoader showSpinner={false} />
        <SWRProvider config={{ revalidateOnFocus: false }}>
          <ThemeProvider
            attribute='class'
            defaultTheme='light'
            themes={THEMES as unknown as string[]}
            enableSystem
            disableTransitionOnChange
          >
            <FeatureFlagProvider featureFlags={initialFeatureFlags}>
              <TooltipProvider>{children}</TooltipProvider>
            </FeatureFlagProvider>
          </ThemeProvider>
        </SWRProvider>
        <ToastProvider duration={5000} />
      </body>
    </html>
  )
}
