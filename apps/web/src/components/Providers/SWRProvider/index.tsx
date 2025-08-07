'use client'

import type { ReactNode } from 'react'
import { SWRConfig, type SWRConfiguration } from 'swr'

/**
 * This has to be a client component:
 * https://swr.vercel.app/docs/with-nextjs
 */
export function SWRProvider({
  children,
  config,
}: {
  children: ReactNode
  config: Partial<SWRConfiguration>
}) {
  return <SWRConfig value={{ ...config }}>{children}</SWRConfig>
}
