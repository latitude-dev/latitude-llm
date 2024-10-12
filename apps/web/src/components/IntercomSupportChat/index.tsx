'use client'

import { useEffect } from 'react'

import Intercom from '@intercom/messenger-js-sdk'
import { type SupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'

export function SupportChat({ identity }: { identity: SupportUserIdentity }) {
  useEffect(() => {
    if (!identity) return

    Intercom({
      app_id: identity.appId,
      user_id: identity.identifier,
      user_hash: identity.userHash,
      name: identity.userData.name,
      email: identity.userData.email,
      created_at: identity.userData.createdAt,
    })
  }, [identity])

  return null
}
