'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import Intercom, { show, onUnreadCountChange } from '@intercom/messenger-js-sdk'
import { type SupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'

interface IntercomContextValue {
  open: () => void
  unreadCount: number
}

const IntercomContext = createContext<IntercomContextValue | undefined>(
  undefined,
)

export function IntercomProvider({
  identity,
  children,
}: {
  identity: SupportUserIdentity
  children: ReactNode
}) {
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadCountHandler = useCallback((count: number) => {
    setUnreadCount(count)
  }, [])

  useEffect(() => {
    if (!identity) return

    Intercom({
      app_id: identity.appId,
      user_id: identity.identifier,
      user_hash: identity.userHash,
      name: identity.userData.name,
      email: identity.userData.email,
      created_at: identity.userData.createdAt,
      hide_default_launcher: true,
    })

    onUnreadCountChange(unreadCountHandler)
  }, [identity, unreadCountHandler])

  return (
    <IntercomContext.Provider
      value={{
        open: show,
        unreadCount,
      }}
    >
      {children}
    </IntercomContext.Provider>
  )
}

export function useIntercom(): IntercomContextValue {
  const ctx = useContext(IntercomContext)
  if (!ctx)
    throw new Error('useIntercom must be used within an IntercomProvider')
  return ctx
}
