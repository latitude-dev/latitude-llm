import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type UrlParamContextType = {
  value: string | null
  setValue: (value: string | null) => void
}

export function createUrlParamContext<T extends string>(paramName: T) {
  const Context = createContext<UrlParamContextType | undefined>(undefined)

  function Provider({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [value, setValue] = useState<string | null>(
      searchParams.get(paramName),
    )

    useEffect(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(paramName, value)
      } else {
        params.delete(paramName)
      }
      router.replace(`?${params.toString()}`, { scroll: true })
    }, [value, searchParams, router])

    return (
      <Context.Provider value={{ value, setValue }}>
        {children}
      </Context.Provider>
    )
  }

  function useValue() {
    const context = useContext(Context)
    if (context === undefined) {
      throw new Error(`useValue must be used within a ${paramName} Provider`)
    }
    return context
  }

  return { Provider, useValue }
}
