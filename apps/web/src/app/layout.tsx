import { ReactNode } from 'react'

import type { Metadata } from 'next'
import localFont from 'next/font/local'

import '@latitude-data/web-ui/styles.css'

const fontSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
})
const fontMono = localFont({
  src: './fonts/GeistMonoVF.woff',
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
      <body className={`${fontSans.variable} ${fontMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
