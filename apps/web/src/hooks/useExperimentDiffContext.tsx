'use client'

import { createContext, ReactNode, useContext, useState } from 'react'
import { type DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'
import { useDocumentValue } from './useDocumentValueContext'

type ExperimentDiffContextType = {
  diff: string | undefined
}

const ExperimentDiffContext = createContext<
  ExperimentDiffContextType | undefined
>(undefined)

type ExperimentDiffProviderProps = {
  children: ReactNode
  diff: string | undefined
}

export function ExperimentDiffProvider({
  children,
  diff,
}: ExperimentDiffProviderProps) {
  return (
    <ExperimentDiffContext.Provider value={{ diff }}>
      {children}
    </ExperimentDiffContext.Provider>
  )
}

export function useExperimentDiff() {
  const context = useContext(ExperimentDiffContext)
  if (context === undefined) {
    throw new Error(
      'useExperimentDiff must be used within an ExperimentDiffProvider',
    )
  }

  const { diff: initialDiff } = context
  const { updateDocumentContent } = useDocumentValue()
  const removeApplyExperimentIdFromUrl = () => {
    if (window?.location) {
      const url = new URL(window.location.href)
      url.searchParams.delete('applyExperimentId')
      window.history.replaceState({}, '', url.toString())
    }
  }
  const [diff, setDiff] = useState<DiffOptions | undefined>(
    initialDiff
      ? {
          newValue: initialDiff,
          onAccept: (newValue: string) => {
            setDiff(undefined)
            updateDocumentContent(newValue)
            removeApplyExperimentIdFromUrl()
          },
          onReject: () => {
            setDiff(undefined)
            removeApplyExperimentIdFromUrl()
          },
        }
      : undefined,
  )

  return { diff, setDiff }
}
