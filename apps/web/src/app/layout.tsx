import { ReactNode } from 'react'

import type { Metadata } from 'next'
import localFont from 'next/font/local'

import '@latitude-data/web-ui/styles.css'

import { ToastProvider } from '@latitude-data/web-ui'

const fontSans = localFont({
  src: '../assets/fonts/GeistVF.woff',
  variable: '--font-geist-sans',
})
const fontMono = localFont({
  src: '../assets/fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
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
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable}`}>
        {children}
        <ToastProvider duration={2500} />
      </body>
    </html>
  )
}
