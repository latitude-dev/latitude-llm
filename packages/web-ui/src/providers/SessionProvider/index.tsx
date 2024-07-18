'use client'

import { createContext, ReactNode, useContext } from 'react'

export type SessionUser = {
  id: string
  name: string | null | undefined
  email: string
}
export type SessionWorkspace = { id: number; name: string }
interface ISessionContext {
  currentUser: SessionUser
  workspace: SessionWorkspace
}

const SessionContext = createContext<ISessionContext>({} as ISessionContext)

const SessionProvider = ({
  children,
  ...context
}: {
  children: ReactNode
} & ISessionContext) => {
  return (
    <SessionContext.Provider value={context}>
      {children}
    </SessionContext.Provider>
  )
}

const useSession = () => {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}

export { SessionProvider, useSession }
