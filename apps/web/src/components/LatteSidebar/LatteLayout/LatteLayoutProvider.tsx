'use client'

import {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

const MIN_WIDTH = 400

type LatteLayoutContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setIsOpen: (isOpen: boolean) => void
  width: number
  localWidth: number
  setWidth: (width: number) => void
  setLocalWidth: (width: number) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

const LatteLayoutContext = createContext<LatteLayoutContextValue | null>(null)

export function LatteLayoutProvider({ children }: { children: ReactNode }) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const { value: width, setValue: setWidth } = useLocalStorage<number>({
    key: AppLocalStorage.latteSidebarWidth,
    defaultValue: MIN_WIDTH,
  })
  const [localWidth, setLocalWidth] = useState(MIN_WIDTH)

  const [isOpen, _setIsOpen] = useState(false)

  const setIsOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) setLocalWidth(width)
      _setIsOpen(isOpen)

      // Focus/unfocus Latte input when opening/closing sidebar
      if (isOpen) inputRef.current?.focus({ preventScroll: true })
      else inputRef.current?.blur()
    },
    [_setIsOpen, setLocalWidth, width],
  )

  const open = useCallback(() => setIsOpen(true), [setIsOpen])
  const close = useCallback(() => setIsOpen(false), [setIsOpen])
  const toggle = useCallback(() => setIsOpen(!isOpen), [setIsOpen, isOpen])

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = (event: KeyboardEvent) => {
      // (Cmd+E / Ctrl+E) — Toggle Sidebar
      if (event.key === 'e' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const newIsOpen = !isOpen
        setIsOpen(newIsOpen)

        // Auto-focus textarea when opening sidebar
        if (newIsOpen && inputRef.current) {
          // Small delay to ensure the sidebar animation has started
          setTimeout(() => {
            inputRef.current?.focus()
          }, 100)
        }
      }

      // (Escape) — Close Sidebar
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setIsOpen])

  return (
    <LatteLayoutContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        setIsOpen,
        width,
        localWidth,
        setWidth,
        setLocalWidth,
        inputRef,
      }}
    >
      {children}
    </LatteLayoutContext.Provider>
  )
}

export function useLatteSidebar() {
  const context = useContext(LatteLayoutContext)
  if (!context) {
    throw new Error('useLatteLayout must be used within LatteLayoutProvider')
  }
  return context
}
