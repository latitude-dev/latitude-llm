import { headers } from 'next/headers'
import { cache } from 'react'

export const getCurrentUrl = cache(async () => {
  const hds = await headers()
  return hds.get('x-current-url') ?? undefined
})
