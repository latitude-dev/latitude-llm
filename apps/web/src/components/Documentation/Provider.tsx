'use client'

import { envClient } from '$/envClient'
import {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DocsRoute, getRouteFromPathname } from './routes'
import { usePathname } from 'next/navigation'

type DocumentationContextProps = {
  isOpen: boolean
  homeRoute: DocsRoute
  currentRoute: DocsRoute
  docTitle: string

  open: (open?: boolean) => void
  navigateTo: (route: DocsRoute, forceOpen?: boolean) => void

  ref: RefObject<HTMLIFrameElement | null>
  init: boolean
}

const DOCS_DOMAIN = envClient.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.latitude.so'

const DocumentationContext = createContext<
  DocumentationContextProps | undefined
>(undefined)

export const useDocs = (): DocumentationContextProps => {
  const context = useContext(DocumentationContext)
  if (!context) {
    throw new Error('useDocs must be used within a DocumentationProvider')
  }
  return context
}

export function DocumentationProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [init, setInit] = useState(false)

  const [isOpen, setIsOpen] = useState(false)

  const [currentRoute, setCurrentRoute] = useState<DocsRoute>(
    DocsRoute.Introduction,
  )
  const [docTitle, setDocTitle] = useState('Documentation')

  const pathname = usePathname()
  const homeRoute = useMemo(() => getRouteFromPathname(pathname), [pathname])

  // Setup iframe listener
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'docs.update') {
        const { title, route } = e.data.value
        setDocTitle(title)
        setCurrentRoute(route)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const initialize = useCallback(() => {
    setInit(true)
    setCurrentRoute(homeRoute)
  }, [homeRoute])

  const open = useCallback(
    (newOpen?: boolean) => {
      setIsOpen(newOpen ?? true)
      initialize()
    },
    [initialize],
  )

  const navigateTo = useCallback(
    (route: DocsRoute) => {
      setCurrentRoute(route)

      if (init && ref.current) {
        ref.current.src = `${DOCS_DOMAIN}${route}`
      } else {
        setTimeout(() => {
          ref.current!.src = `${DOCS_DOMAIN}${route}`
        }, 50)
      }

      open()
    },
    [open, init],
  )

  return (
    <DocumentationContext.Provider
      value={{
        ref,
        init,
        isOpen,
        homeRoute,
        currentRoute,
        docTitle,
        open,
        navigateTo,
      }}
    >
      {children}
    </DocumentationContext.Provider>
  )
}
