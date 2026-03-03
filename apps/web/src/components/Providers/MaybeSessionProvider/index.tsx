'use client'

import type { User } from '@latitude-data/core/schema/models/types/User'
import { createContext, type ReactNode } from 'react'

type ISessionContext = {
  currentUser: User | undefined | null
}

const MaybeSessionContext = createContext<ISessionContext>(
  {} as ISessionContext,
)

const MaybeSessionProvider = ({
  children,
  ...context
}: {
  children: ReactNode
} & ISessionContext) => {
  return (
    <MaybeSessionContext.Provider value={context}>
      {children}
    </MaybeSessionContext.Provider>
  )
}

export { MaybeSessionProvider }
