'use client'

import { usePipedreamApp } from '$/stores/pipedreamApp'
import { IntegrationType } from '@latitude-data/constants'
import { AppDto } from '@latitude-data/core/browser'
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type SelectedIntegration = {
  id?: number
  name: string
  type: IntegrationType
  pipedream?: {
    app: Pick<AppDto, 'name'>
    trigger?: AppDto['triggers'][number]
  }
}

type TriggersModalContextType = {
  selectedIntegration: SelectedIntegration | null | undefined
  selectedPipedreamApp: AppDto | null | undefined
  isSelectedPipedreamAppLoading: boolean
  setSelectedIntegration: React.Dispatch<
    React.SetStateAction<SelectedIntegration | null | undefined>
  >
}

const TriggersModalContext = createContext<
  TriggersModalContextType | undefined
>(undefined)

type TriggersModalProviderProps = {
  children: ReactNode
}

export function TriggersModalProvider({
  children,
}: TriggersModalProviderProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<
    SelectedIntegration | null | undefined
  >()

  const {
    data: selectedPipedreamApp,
    isLoading: isSelectedPipedreamAppLoading,
  } = usePipedreamApp(selectedIntegration?.pipedream?.app.name)

  const value: TriggersModalContextType = useMemo(
    () => ({
      selectedIntegration,
      selectedPipedreamApp,
      isSelectedPipedreamAppLoading,
      setSelectedIntegration,
    }),
    [selectedIntegration, selectedPipedreamApp, isSelectedPipedreamAppLoading],
  )

  return (
    <TriggersModalContext.Provider value={value}>
      {children}
    </TriggersModalContext.Provider>
  )
}

export function useTriggersModalContext() {
  const context = useContext(TriggersModalContext)
  if (context === undefined) {
    throw new Error(
      'useTriggersModalContext must be used within a TriggersModalProvider',
    )
  }
  return context
}
