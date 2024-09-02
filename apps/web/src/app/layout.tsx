import { ReactNode } from 'react'

import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'

import '@latitude-data/web-ui/styles.css'

import { ToastProvider, TooltipProvider } from '@latitude-data/web-ui'
import { ThemeProvider } from '$/components/Providers/ThemeProvider'
import localFont from 'next/font/local'

const fontSans = localFont({
  src: [
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLight.ttf',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLightItalic.ttf',
      weight: '200',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-LightItalic.ttf',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-MediumItalic.ttf',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBoldItalic.ttf',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-sans',
})

const fontMono = localFont({
  src: [
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLight.ttf',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-ExtraLightItalic.ttf',
      weight: '200',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-LightItalic.ttf',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-MediumItalic.ttf',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-SemiBoldItalic.ttf',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../assets/fonts/JetBrainsMono-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../assets/fonts/JetBrainsMono-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-mono',
})

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
