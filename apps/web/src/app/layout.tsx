import { ReactNode } from 'react'

import buildMetatags from '$/app/_lib/buildMetatags'
import NextTopLoader from 'nextjs-toploader'

import '@latitude-data/web-ui/styles.css'

import {
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from '@latitude-data/web-ui'
import { fontMono, fontSans } from '$/helpers/fonts'

export const metadata = buildMetatags({
  title: 'The Open-Source LLM Development Platform',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang='en' translate='no' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
        <NextTopLoader showSpinner={false} />
        <ThemeProvider
          attribute='class'
          defaultTheme='light'
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <ToastProvider duration={2500} />
      </body>
    </html>
  )
}
