import { ReactNode } from 'react'

import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'

import '@latitude-data/web-ui/styles.css'

import { ToastProvider, TooltipProvider } from '@latitude-data/web-ui'
import { ThemeProvider } from '$/components/Providers/ThemeProvider'
import { fontMono, fontSans } from '$/helpers/fonts'

export const metadata: Metadata = {
  title: 'Latitude App',
  description: 'LLM - Latitude App',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
        <NextTopLoader showSpinner={false} />
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
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
