'use client'

import { envClient } from '$/envClient'
import {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useRef,
} from 'react'
import { DocsRoute } from './routes'

type DocumentationContextProps = {
  open: (route: DocsRoute) => void
  navigateTo: (route: DocsRoute) => void
  ref: RefObject<HTMLIFrameElement>
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

export function DocumentationProvider({
  children,
  onOpen,
}: {
  children: ReactNode
  onOpen?: () => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)

  const navigateTo = useCallback((route: DocsRoute) => {
    if (!ref.current) return
    ref.current.src = `${DOCS_DOMAIN}${route}`
  }, [])

  const open = useCallback(
    (route: DocsRoute) => {
      onOpen?.()
      if (ref.current) {
        navigateTo(route)
      } else {
        // It may not have been loaded yet, it's always unloaded until the sidebar is opened for the first time
        setTimeout(() => {
          navigateTo(route)
        }, 50)
      }
    },
    [onOpen, navigateTo],
  )

  return (
    <DocumentationContext.Provider value={{ open, navigateTo, ref }}>
      {children}
    </DocumentationContext.Provider>
  )
}
