import { createContext, useContext, useState, ReactNode } from 'react'

interface SelectedTraceIdContextType {
  selectedTraceId: string | null
  setSelectedTraceId: (traceId: string | null) => void
}

const SelectedTraceIdContext = createContext<
  SelectedTraceIdContextType | undefined
>(undefined)

export function SelectedTraceIdProvider({ children }: { children: ReactNode }) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)

  return (
    <SelectedTraceIdContext.Provider
      value={{ selectedTraceId, setSelectedTraceId }}
    >
      {children}
    </SelectedTraceIdContext.Provider>
  )
}

export function useSelectedTraceId() {
  const context = useContext(SelectedTraceIdContext)
  if (context === undefined) {
    throw new Error(
      'useSelectedTraceId must be used within a SelectedTraceIdProvider',
    )
  }
  return context
}
