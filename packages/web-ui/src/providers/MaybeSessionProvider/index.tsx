'use client'

import { createContext, type ReactNode, useContext } from 'react'

import type { SessionUser } from '../SessionProvider'

interface ISessionContext {
  currentUser: SessionUser | undefined | null
}

const MaybeSessionContext = createContext<ISessionContext>({} as ISessionContext)

const MaybeSessionProvider = ({
  children,
  ...context
}: {
  children: ReactNode
} & ISessionContext) => {
  return <MaybeSessionContext.Provider value={context}>{children}</MaybeSessionContext.Provider>
}

const useMaybeSession = () => {
  const context = useContext(MaybeSessionContext)
  if (!context) {
    throw new Error('useMaybeSession must be used within a SessionProvider')
  }

  return context
}

export { MaybeSessionProvider, useMaybeSession }
