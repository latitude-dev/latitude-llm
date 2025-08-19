'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

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
