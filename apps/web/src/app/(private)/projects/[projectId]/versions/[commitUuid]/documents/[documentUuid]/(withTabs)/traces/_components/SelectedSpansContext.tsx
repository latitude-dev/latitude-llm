import { createContext, useContext, useState, ReactNode } from 'react'

interface SelectedSpansContextType {
  selectedSpanId: string | null
  setSelectedSpanId: (spanId: string | null) => void
}

const SelectedSpansContext = createContext<
  SelectedSpansContextType | undefined
>(undefined)

export function SelectedSpansProvider({ children }: { children: ReactNode }) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  return (
    <SelectedSpansContext.Provider
      value={{ selectedSpanId, setSelectedSpanId }}
    >
      {children}
    </SelectedSpansContext.Provider>
  )
}

export function useSelectedSpan() {
  const context = useContext(SelectedSpansContext)
  if (context === undefined) {
    throw new Error(
      'useSelectedSpans must be used within a SelectedSpansProvider',
    )
  }
  return context
}
