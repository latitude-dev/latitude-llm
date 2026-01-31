import * as ip from 'ip'
import { headers as nextHeaders } from 'next/headers'

export function getUnsafeIp(headers: Awaited<ReturnType<typeof nextHeaders>>) {
  const candidates = []
  const forwardedFor = headers.get('x-forwarded-for') ?? ''
  candidates.push(...forwardedFor.split(',').map((a) => a.trim()))
  const realIP = headers.get('x-real-ip') ?? ''
  candidates.push(realIP.trim())

  for (const address of candidates) {
    if (
      (ip.isV4Format(address) || ip.isV6Format(address)) &&
      ip.isPublic(address)
    ) {
      return address
    }
  }

  return null
}
