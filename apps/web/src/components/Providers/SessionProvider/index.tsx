'use client'

import type { SubscriptionPlanContent } from '@latitude-data/core/plans'
import type { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import type { User } from '@latitude-data/core/schema/models/types/User'
import type { ProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'
import { createContext, ReactNode, useContext } from 'react'

interface ISessionContext {
  currentUser: User
  workspace: WorkspaceDto
  subscriptionPlan: SubscriptionPlanContent
  productAccess: ProductAccess
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

const useProductAccess = () => {
  const { productAccess } = useSession()
  return productAccess
}

export { SessionProvider, useSession, useProductAccess }
