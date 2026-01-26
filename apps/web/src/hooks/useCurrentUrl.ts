'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

/**
 * Be aware that this is a client-side only hook.
 * It react to url changes and can provoke re-renders.
 *
 * If you have performance issues, consider using a static url instead.
 * window.location.href or similar.
 */
export function useCurrentUrl({ full }: { full?: boolean } = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useMemo(() => {
    let url = ''

    if (full) url += window.location.origin
    url += pathname
    if (searchParams.size > 0) url += `?${searchParams.toString()}`

    return url
  }, [pathname, searchParams, full])
}
