'use client'

import { createContext, useContext, ReactNode, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type SelectionState = {
  testUuid: string | null
}

type TestSelectionContextType = {
  selection: SelectionState
  selectTest: (testUuid: string) => void
  clearSelection: () => void
}

const TestSelectionContext = createContext<
  TestSelectionContextType | undefined
>(undefined)

export function TestSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const params = useSearchParams()
  const router = useRouter()

  const initialTestUuid = params.get('testUuid')

  const [selection, setSelection] = useState<SelectionState>({
    testUuid: initialTestUuid,
  })

  const selectTest = (testUuid: string) => {
    setSelection({ testUuid })

    const newParams = new URLSearchParams(params.toString())
    newParams.set('testUuid', testUuid)
    router.replace(`?${newParams.toString()}`, { scroll: false })
  }

  const clearSelection = () => {
    setSelection({ testUuid: null })

    const newParams = new URLSearchParams(params.toString())
    newParams.delete('testUuid')
    router.replace(`?${newParams.toString()}`)
  }

  return (
    <TestSelectionContext.Provider
      value={{ selection, selectTest, clearSelection }}
    >
      {children}
    </TestSelectionContext.Provider>
  )
}

export function useTestSelection() {
  const context = useContext(TestSelectionContext)
  if (context === undefined) {
    throw new Error(
      'useTestSelection must be used within a TestSelectionProvider',
    )
  }
  return context
}
